/* 挂机工具 API 参考 — 读取 data/api.json 并渲染 */
(function () {
  'use strict';

  var DATA_URL = './data/api.json';

  var el = {
    total:    document.getElementById('api-total'),
    search:   document.getElementById('api-search'),
    cats:     document.getElementById('api-cats'),
    stat:     document.getElementById('api-stat'),
    notes:    document.getElementById('api-notes'),
    status:   document.getElementById('api-status'),
    list:     document.getElementById('api-list')
  };

  var state = {
    data: null,
    query: '',
    activeCat: ''
  };

  /* ---------------- 工具 ---------------- */

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function copyText(text, btn, doneLabel) {
    var done = function () {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.textContent = doneLabel || '已复制';
      btn.classList.add('is-done');
      setTimeout(function () {
        btn.textContent = old;
        btn.classList.remove('is-done');
      }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        window.prompt('复制内容：', text);
      });
    } else {
      window.prompt('复制内容：', text);
    }
  }

  /* ---------------- 渲染：全局提示 ---------------- */

  function renderNotes(notes) {
    clear(el.notes);
    if (!notes || !notes.length) return;

    var box = h('details', 'note-box');
    box.open = true;

    var sum = h('summary', 'note-summary');
    sum.appendChild(h('span', 'note-title', '使用前先看这几条'));
    sum.appendChild(h('span', 'note-count', String(notes.length)));
    box.appendChild(sum);

    var ul = h('ul', 'note-list');
    notes.forEach(function (n) {
      var li = h('li', 'note-item note-' + (n.level || 'info'));
      li.appendChild(h('strong', 'note-item-title', n.title));
      li.appendChild(h('span', 'note-item-text', n.text));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    el.notes.appendChild(box);
  }

  /* ---------------- 渲染：分类导航 ---------------- */

  function countByCat(funcs) {
    var m = {};
    funcs.forEach(function (f) { m[f.cat] = (m[f.cat] || 0) + 1; });
    return m;
  }

  function renderCats(data) {
    clear(el.cats);
    var counts = countByCat(data.funcs);

    data.categories.forEach(function (c) {
      var a = h('a', 'api-cat');
      a.href = '#cat-' + c.id;
      a.setAttribute('data-cat', c.id);
      a.appendChild(h('span', 'api-cat-label', c.label));
      a.appendChild(h('span', 'api-cat-num', String(counts[c.id] || 0)));
      if (c.desc) a.title = c.desc;
      el.cats.appendChild(a);
    });
  }

  /* ---------------- 渲染：单个接口 ---------------- */

  function buildFunc(f) {
    var card = h('article', 'api-fn');
    card.id = f.name;
    card.setAttribute('data-cat', f.cat);
    card.setAttribute('data-text', [
      f.name, f.sig, f.brief, f.returns, f.note || '',
      (f.params || []).map(function (p) { return p.n + ' ' + p.d + ' ' + p.t; }).join(' ')
    ].join(' ').toLowerCase());

    /* 头部：名称 + 陷阱标记 + 复制 */
    var head = h('div', 'api-fn-head');

    var left = h('div', 'api-fn-title');
    left.appendChild(h('code', 'api-name', f.name));
    if (f.trap) {
      var b = h('span', 'api-badge', '注意');
      left.appendChild(b);
    }
    head.appendChild(left);

    var btn = h('button', 'api-copy', '复制签名');
    btn.type = 'button';
    btn.setAttribute('data-label', '复制签名');
    btn.addEventListener('click', function () {
      copyText(f.sig, btn, '已复制');
    });
    head.appendChild(btn);

    card.appendChild(head);

    if (f.brief) card.appendChild(h('p', 'api-brief', f.brief));

    var pre = h('pre', 'api-sig');
    pre.appendChild(h('code', null, f.sig));
    card.appendChild(pre);

    if (f.params && f.params.length) {
      var dl = h('dl', 'api-params');
      f.params.forEach(function (p) {
        dl.appendChild(h('dt', null, p.n));
        var dd = h('dd');
        dd.appendChild(h('span', 'api-type', p.t));
        dd.appendChild(h('span', 'api-pdesc', p.d));
        dl.appendChild(dd);
      });
      card.appendChild(dl);
    }

    if (f.returns && f.returns !== '无') {
      var ret = h('p', 'api-ret');
      ret.appendChild(h('span', 'api-label', '返回'));
      ret.appendChild(h('code', null, f.returns));
      card.appendChild(ret);
    }

    if (f.note) {
      var note = h('p', 'api-note' + (f.trap ? ' is-warn' : ''));
      note.appendChild(h('span', 'api-label', f.trap ? '注意' : '说明'));
      note.appendChild(h('span', null, f.note));
      card.appendChild(note);
    }

    return card;
  }

  /* ---------------- 渲染：分组列表 ---------------- */

  function renderList() {
    clear(el.list);
    var data = state.data;

    data.categories.forEach(function (c) {
      var funcs = data.funcs.filter(function (f) { return f.cat === c.id; });
      if (!funcs.length) return;

      var sec = h('section', 'api-group');
      sec.id = 'cat-' + c.id;
      sec.setAttribute('data-cat', c.id);

      var gh = h('div', 'api-group-head');
      gh.appendChild(h('h2', null, c.label));
      gh.appendChild(h('span', 'api-group-num', String(funcs.length)));
      sec.appendChild(gh);

      if (c.desc) sec.appendChild(h('p', 'api-group-desc', c.desc));

      funcs.forEach(function (f) { sec.appendChild(buildFunc(f)); });
      el.list.appendChild(sec);
    });

    applyFilter();
  }

  /* ---------------- 搜索过滤 ---------------- */

  function applyFilter() {
    var q = state.query.trim().toLowerCase();
    var shown = 0;

    var cards = el.list.querySelectorAll('.api-fn');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var hit = !q || (card.getAttribute('data-text') || '').indexOf(q) !== -1;
      card.hidden = !hit;
      if (hit) shown++;
    }

    var groups = el.list.querySelectorAll('.api-group');
    for (var j = 0; j < groups.length; j++) {
      var g = groups[j];
      var visible = g.querySelectorAll('.api-fn:not([hidden])').length;
      g.hidden = visible === 0;
    }

    if (el.stat) {
      el.stat.textContent = q
        ? '匹配 ' + shown + ' / ' + state.data.funcs.length + ' 个接口'
        : '共 ' + state.data.funcs.length + ' 个接口';
    }

    if (el.status && q && shown === 0) {
      showStatus('没有匹配「' + state.query + '」的接口。', true);
    } else if (el.status) {
      hideStatus();
    }
  }

  /* ---------------- 状态提示 ---------------- */

  function showStatus(msg, isError, hint) {
    clear(el.status);
    el.status.hidden = false;
    el.status.className = 'status' + (isError ? ' is-error' : '');
    if (!isError) {
      var sp = h('div', 'spinner');
      sp.setAttribute('aria-hidden', 'true');
      el.status.appendChild(sp);
    }
    el.status.appendChild(h('p', null, msg));
    if (hint) el.status.appendChild(h('p', 'hint', hint));
  }

  function hideStatus() {
    el.status.hidden = true;
  }

  /* ---------------- 锚点与滚动同步 ---------------- */

  function highlightAnchor() {
    var id = (location.hash || '').replace(/^#/, '');
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;

    var prev = document.querySelector('.api-fn.is-target');
    if (prev) prev.classList.remove('is-target');
    target.classList.add('is-target');
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });

    setTimeout(function () { target.classList.remove('is-target'); }, 2200);
  }

  function setupSpy() {
    var links = el.cats.querySelectorAll('.api-cat');
    var ticking = false;

    function update() {
      ticking = false;
      var groups = el.list.querySelectorAll('.api-group');
      var current = '';
      for (var i = 0; i < groups.length; i++) {
        var r = groups[i].getBoundingClientRect();
        if (r.top <= 120 && r.bottom > 120) { current = groups[i].getAttribute('data-cat'); break; }
      }
      if (!current && groups.length) {
        // 滚到底部时，最后一个可见分组高亮
        var lastVis = null;
        for (var k = 0; k < groups.length; k++) {
          if (groups[k].getBoundingClientRect().height > 0) lastVis = groups[k];
        }
        if (lastVis && (window.innerHeight + window.pageYOffset) >= document.body.scrollHeight - 40) {
          current = lastVis.getAttribute('data-cat');
        }
      }
      for (var m = 0; m < links.length; m++) {
        links[m].classList.toggle('is-active', links[m].getAttribute('data-cat') === current);
      }
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });

    window.addEventListener('resize', update);
    update();
  }

  /* ---------------- 启动 ---------------- */

  function load() {
    var url = DATA_URL + '?_=' + Date.now();

    fetch(url, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.funcs)) {
          throw new Error('数据结构不对：缺少 funcs 数组');
        }
        state.data = data;

        if (data.site) {
          if (data.site.title) document.title = data.site.title + ' · 挂机工具';
        }
        if (el.total) el.total.textContent = String(data.funcs.length);

        renderNotes(data.notes);
        renderCats(data);
        renderList();
        hideStatus();
        setupSpy();
        highlightAnchor();
      })
      .catch(function (err) {
        var isFile = location.protocol === 'file:';
        showStatus(
          '接口数据加载失败：' + err.message,
          true,
          isFile
            ? '当前是直接双击打开的本地文件，浏览器会拦截读取 JSON。请在站点目录起一个静态服务再访问，例如 python -m http.server 8000。'
            : '检查 data/api.json 是否存在、语法是否正确。'
        );
      });
  }

  if (el.search) {
    el.search.addEventListener('input', function () {
      state.query = el.search.value || '';
      applyFilter();
    });
    el.search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        el.search.value = '';
        state.query = '';
        applyFilter();
        el.search.blur();
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== el.search) {
      e.preventDefault();
      el.search.focus();
    }
  });

  window.addEventListener('hashchange', highlightAnchor);

  load();
})();
