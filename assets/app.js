/* 挂机工具更新日志 — 读取 data/updates.json 并渲染
 * 约定：以后只修改 data/updates.json，本文件不需要动。
 */
(function () {
  'use strict';

  var DATA_URL = './data/updates.json';

  /* 内置兜底类型：JSON 里没写 types 时使用 */
  var DEFAULT_TYPES = {
    feat:     { label: '新功能', color: 'green' },
    fix:      { label: '修复',   color: 'red' },
    improve:  { label: '优化',   color: 'blue' },
    perf:     { label: '性能',   color: 'amber' },
    refactor: { label: '重构',   color: 'purple' },
    docs:     { label: '文档',   color: 'gray' }
  };

  var el = {
    title:      document.getElementById('site-title'),
    subtitle:   document.getElementById('site-subtitle'),
    latestBox:  document.getElementById('latest-box'),
    latestVer:  document.getElementById('latest-version'),
    statBox:    document.getElementById('stat-box'),
    statCount:  document.getElementById('stat-count'),
    toolbar:    document.getElementById('toolbar'),
    filters:    document.getElementById('type-filters'),
    search:     document.getElementById('search'),
    status:     document.getElementById('status'),
    timeline:   document.getElementById('timeline'),
    download:   document.getElementById('download'),
    dlTitle:    document.getElementById('download-title'),
    dlNote:     document.getElementById('download-note'),
    dlActions:  document.getElementById('download-actions')
  };

  var state = {
    releases: [],
    types: DEFAULT_TYPES,
    activeTypes: Object.create(null), // 为空表示“全部”
    keyword: ''
  };

  /* ---------------- 工具函数 ---------------- */

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function showStatus(html, isError) {
    clear(el.status);
    el.status.hidden = false;
    el.status.className = 'status' + (isError ? ' is-error' : '');
    for (var i = 0; i < html.length; i++) el.status.appendChild(html[i]);
  }

  function p(text) { var n = document.createElement('p'); n.textContent = text; return n; }

  function hint(text) {
    var n = document.createElement('p');
    n.className = 'hint';
    n.textContent = text;
    return n;
  }

  function copyText(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone, function () { window.prompt('复制：', text); });
    } else {
      window.prompt('复制：', text);
    }
  }

  /* 支持 `code` 的内联文本渲染（不使用 innerHTML，避免注入） */
  function renderRich(parent, text) {
    var parts = String(text == null ? '' : text).split('`');
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        var c = document.createElement('code');
        c.textContent = parts[i];
        parent.appendChild(c);
      } else if (parts[i]) {
        parent.appendChild(document.createTextNode(parts[i]));
      }
    }
  }

  function parseDate(str) {
    if (!str) return null;
    var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function relativeLabel(dateStr) {
    var d = parseDate(dateStr);
    if (!d) return '';
    var diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff < 0) return '';
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 30) return diff + ' 天前';
    return '';
  }

  function cmpVersion(a, b) {
    var pa = String(a || '').replace(/^v/i, '').split(/[.\-+]/);
    var pb = String(b || '').replace(/^v/i, '').split(/[.\-+]/);
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = parseInt(pa[i], 10), y = parseInt(pb[i], 10);
      if (isNaN(x)) x = 0;
      if (isNaN(y)) y = 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  function normalize(release, index) {
    var r = release || {};
    return {
      version: r.version ? String(r.version) : '',
      date: r.date ? String(r.date) : '',
      title: r.title ? String(r.title) : (r.version ? String(r.version) : '未命名更新'),
      summary: r.summary ? String(r.summary) : '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      changes: Array.isArray(r.changes) ? r.changes : [],
      links: Array.isArray(r.links) ? r.links : [],
      _index: index
    };
  }

  function typeInfo(name) {
    if (!name) return null;
    var t = state.types[name];
    if (!t) return { key: name, label: name, color: 'gray' };
    return { key: name, label: t.label || name, color: t.color || 'gray' };
  }

  function anchorOf(r) {
    return r.version ? 'v' + r.version.replace(/^v/i, '') : '';
  }

  /* ---------------- 下载区 ---------------- */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function buildIcon(kind) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    var paths = kind === 'cloud'
      ? ['M12 13v8', 'M8 17l4 4 4-4', 'M20.5 16.5A4.5 4.5 0 0 0 18 8.2 6 6 0 0 0 6.2 9.6 4.5 4.5 0 0 0 3.5 16.8']
      : ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'];

    paths.forEach(function (d) {
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  /* cfg: { label, url }；isDirect 决定默认文案与打开方式 */
  function buildLinkButton(cfg, iconKind, cls, isDirect) {
    var url = cfg.url ? String(cfg.url).trim() : '';
    var node = document.createElement(url ? 'a' : 'span');

    node.className = 'btn ' + cls;
    node.appendChild(buildIcon(iconKind));

    var span = document.createElement('span');
    span.textContent = cfg.label ? String(cfg.label) : (isDirect ? '直连下载' : '网盘下载');
    node.appendChild(span);

    if (url) {
      node.setAttribute('href', url);
      if (!isDirect) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    } else {
      node.classList.add('is-disabled');
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute('title', '尚未在 updates.json 里填写链接');
    }
    return node;
  }

  function buildCodeChip(code) {
    var text = String(code);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-chip';
    btn.setAttribute('title', '点击复制提取码');
    btn.textContent = '提取码 ' + text;
    btn.addEventListener('click', function () {
      copyText(text, function () {
        btn.textContent = '已复制 ' + text;
        btn.classList.add('is-done');
        setTimeout(function () {
          btn.textContent = '提取码 ' + text;
          btn.classList.remove('is-done');
        }, 1600);
      });
    });
    return btn;
  }

  function renderDownload(dl) {
    if (!dl || (!dl.direct && !dl.pan)) return;

    if (dl.title) el.dlTitle.textContent = String(dl.title);

    var note = dl.note ? String(dl.note) : '';
    if (!note && state.releases.length) {
      var top = state.releases[0];
      note = '最新版本' + (top.version ? ' ' + top.version : '') + (top.date ? ' · ' + top.date : '');
    }
    if (note) el.dlNote.textContent = note;
    else el.dlNote.hidden = true;

    clear(el.dlActions);
    if (dl.direct) el.dlActions.appendChild(buildLinkButton(dl.direct, 'download', 'btn-primary', true));
    if (dl.pan) {
      el.dlActions.appendChild(buildLinkButton(dl.pan, 'cloud', 'btn-ghost', false));
      if (dl.pan.code) el.dlActions.appendChild(buildCodeChip(dl.pan.code));
    }

    el.download.hidden = false;
  }

  /* ---------------- 渲染 ---------------- */

  function buildBadge(info) {
    var s = document.createElement('span');
    s.className = 'badge';
    s.setAttribute('data-c', info.color);
    s.textContent = info.label;
    return s;
  }

  function buildEntry(r, isLatest) {
    var entry = document.createElement('article');
    entry.className = 'entry' + (isLatest ? ' is-latest' : '');
    var anchor = anchorOf(r);
    if (anchor) entry.id = anchor;

    /* 头部：版本 / 最新 / 日期 */
    var head = document.createElement('div');
    head.className = 'entry-head';

    if (r.version) {
      var v = document.createElement('span');
      v.className = 'version';
      v.textContent = r.version;
      head.appendChild(v);
    }
    if (isLatest) {
      var lt = document.createElement('span');
      lt.className = 'tag-latest';
      lt.textContent = '最新';
      head.appendChild(lt);
    }
    if (r.date) {
      var d = document.createElement('span');
      d.className = 'date';
      var rel = relativeLabel(r.date);
      d.textContent = r.date + (rel ? ' · ' + rel : '');
      head.appendChild(d);
    }
    entry.appendChild(head);

    /* 标题 */
    var h = document.createElement('h2');
    h.textContent = r.title;
    entry.appendChild(h);

    /* 摘要 */
    if (r.summary) {
      var sum = document.createElement('p');
      sum.className = 'summary';
      renderRich(sum, r.summary);
      entry.appendChild(sum);
    }

    /* 标签 */
    if (r.tags.length) {
      var tagBox = document.createElement('div');
      tagBox.className = 'tags';
      r.tags.forEach(function (t) {
        var s = document.createElement('span');
        s.className = 'tag';
        s.textContent = String(t);
        tagBox.appendChild(s);
      });
      entry.appendChild(tagBox);
    }

    /* 改动条目 */
    if (r.changes.length) {
      var ul = document.createElement('ul');
      ul.className = 'changes';
      r.changes.forEach(function (c) {
        c = c || {};
        var text = typeof c === 'string' ? c : c.text;
        var info = text === undefined ? null : typeInfo(c.type);
        var li = document.createElement('li');
        li.className = 'change' + (info ? '' : ' no-type');
        if (info) li.appendChild(buildBadge(info));
        var span = document.createElement('span');
        span.className = 'change-text';
        renderRich(span, text);
        li.appendChild(span);
        ul.appendChild(li);
      });
      entry.appendChild(ul);
    }

    /* 底部：链接 + 复制锚点 */
    var foot = document.createElement('div');
    foot.className = 'entry-foot';

    r.links.forEach(function (l) {
      l = l || {};
      if (!l.url) return;
      var a = document.createElement('a');
      a.href = String(l.url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = l.label ? String(l.label) : '链接';
      foot.appendChild(a);
    });

    if (anchor) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = '复制本版本链接';
      btn.addEventListener('click', function () {
        var url = location.origin + location.pathname + location.search + '#' + anchor;
        copyText(url, function () {
          btn.textContent = '已复制';
          btn.classList.add('is-done');
          setTimeout(function () {
            btn.textContent = '复制本版本链接';
            btn.classList.remove('is-done');
          }, 1600);
        });
      });
      foot.appendChild(btn);
    }

    if (foot.childNodes.length) entry.appendChild(foot);
    return entry;
  }

  function matches(r) {
    var keys = Object.keys(state.activeTypes);
    if (keys.length) {
      var ok = r.changes.some(function (c) {
        return c && typeof c === 'object' && keys.indexOf(c.type) !== -1;
      });
      if (!ok) return false;
    }
    if (state.keyword) {
      var hay = [r.version, r.title, r.summary, r.tags.join(' ')]
        .concat(r.changes.map(function (c) { return (c && (c.text || c)) || ''; }))
        .join(' ')
        .toLowerCase();
      if (hay.indexOf(state.keyword) === -1) return false;
    }
    return true;
  }

  function renderList() {
    var list = state.releases.filter(matches);
    clear(el.timeline);

    if (!list.length) {
      var msg = state.releases.length
        ? ['没有匹配的更新，试试换个关键词或清空筛选。']
        : ['还没有任何更新记录 —— 往 data/updates.json 的 releases 里加一条即可。'];
      showStatus([p(msg[0])], false);
      return;
    }

    showStatus([], false);
    el.status.hidden = true;
    var latestVersion = state.releases[0].version;
    list.forEach(function (r) {
      el.timeline.appendChild(buildEntry(r, r.version === latestVersion));
    });
  }

  function buildFilters() {
    var used = [];
    state.releases.forEach(function (r) {
      r.changes.forEach(function (c) {
        if (c && typeof c === 'object' && c.type && used.indexOf(c.type) === -1) used.push(c.type);
      });
    });
    if (!used.length) return;

    clear(el.filters);

    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'chip';
    all.textContent = '全部';
    all.setAttribute('aria-pressed', 'true');
    all.addEventListener('click', function () {
      state.activeTypes = Object.create(null);
      syncChips();
      renderList();
    });
    el.filters.appendChild(all);

    used.forEach(function (name) {
      var info = typeInfo(name);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = info.label;
      b.setAttribute('data-type', name);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        if (state.activeTypes[name]) delete state.activeTypes[name];
        else state.activeTypes[name] = true;
        syncChips();
        renderList();
      });
      el.filters.appendChild(b);
    });

    el.toolbar.hidden = false;
  }

  function syncChips() {
    var any = Object.keys(state.activeTypes).length > 0;
    var chips = el.filters.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      var t = chips[i].getAttribute('data-type');
      if (!t) chips[i].setAttribute('aria-pressed', any ? 'false' : 'true');
      else chips[i].setAttribute('aria-pressed', state.activeTypes[t] ? 'true' : 'false');
    }
  }

  function scrollToAnchor() {
    var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!hash) return;
    var target = document.getElementById(hash);
    if (!target) return;
    target.classList.add('is-target');
    setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
  }

  /* ---------------- 启动 ---------------- */

  function fail(title, detail, extraHint) {
    var nodes = [p(title)];
    if (detail) nodes.push(p(detail));
    if (extraHint) nodes.push(hint(extraHint));
    showStatus(nodes, true);
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — 找不到 ' + DATA_URL);
      return res.text();
    })
    .then(function (raw) {
      var data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        fail('data/updates.json 语法有误，页面无法解析。', e.message,
             '常见原因：多了或少了逗号、引号不配对、用了单引号。可用在线 JSON 校验器检查。');
        return;
      }

      var site = data.site || {};
      if (site.title) { el.title.textContent = site.title; document.title = site.title; }
      if (site.subtitle) el.subtitle.textContent = site.subtitle;

      if (data.types && typeof data.types === 'object') {
        var merged = {};
        Object.keys(DEFAULT_TYPES).forEach(function (k) { merged[k] = DEFAULT_TYPES[k]; });
        Object.keys(data.types).forEach(function (k) {
          merged[k] = data.types[k] || DEFAULT_TYPES[k];
        });
        state.types = merged;
      }

      var raw_list = Array.isArray(data.releases) ? data.releases
                   : (Array.isArray(data.updates) ? data.updates : []);
      state.releases = raw_list
        .map(normalize)
        .sort(function (a, b) {
          var da = parseDate(a.date), db = parseDate(b.date);
          if (da && db && da.getTime() !== db.getTime()) return db.getTime() - da.getTime();
          var cv = cmpVersion(b.version, a.version);
          if (cv !== 0) return cv;
          return a._index - b._index;
        });

      if (state.releases.length) {
        el.latestVer.textContent = state.releases[0].version || '—';
        el.latestBox.hidden = false;
        el.statCount.textContent = String(state.releases.length);
        el.statBox.hidden = false;
        buildFilters();
      }

      renderDownload(data.download);
      renderList();
      scrollToAnchor();
    })
    .catch(function (err) {
      var isFileProtocol = location.protocol === 'file:';
      fail('无法加载 data/updates.json。', err && err.message ? err.message : String(err),
           isFileProtocol
             ? '当前是直接双击打开的本地文件（file://），浏览器会拦截读取 JSON。请用本地服务预览：在本目录执行 python -m http.server 8000，然后访问 http://localhost:8000'
             : '请确认文件路径为 data/updates.json 且与 index.html 同级目录。');
    });

  el.search.addEventListener('input', function () {
    state.keyword = el.search.value.trim().toLowerCase();
    renderList();
  });

  window.addEventListener('hashchange', function () {
    var old = document.querySelector('.entry.is-target');
    if (old) old.classList.remove('is-target');
    scrollToAnchor();
  });
})();
