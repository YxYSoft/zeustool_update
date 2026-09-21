# 挂机工具更新日志

纯静态站点，无后端、无构建。页面在浏览器里读取 `data/updates.json` 并渲染成时间线。

**以后要发一条更新，只需要改 `data/updates.json`，然后 push。`index.html` / `style.css` / `app.js` 都不用动。**

## 目录结构

```
.
├── index.html          # 页面骨架，负责挂载
├── assets/
│   ├── style.css       # 样式（时间线风格，跟随系统明暗主题）
│   └── app.js          # 拉取 JSON → 排序 → 筛选 → 渲染
├── data/
│   └── updates.json    # ★ 唯一需要维护的数据文件
└── README.md
```

## 怎么加一条更新

在 `data/updates.json` 的 `releases` 数组里加一个对象。放在数组任意位置都可以，页面会自动按日期倒序排。

```json
{
  "version": "1.5.0",
  "date": "2026-09-25",
  "title": "一句话概括这次更新",
  "tags": ["C++", "寻路"],
  "summary": "可选，一段补充说明。",
  "changes": [
    { "type": "feat", "text": "新增了某个功能。" },
    { "type": "fix",  "text": "修复了某个问题。" }
  ],
  "links": [
    { "label": "查看提交", "url": "https://example.com/commit/abc123" }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `version` | 建议填 | 版本号，同时作为锚点（`index.html#v1.5.0`）。不填则该条不显示版本、不可锚点跳转 |
| `date` | 建议填 | `YYYY-MM-DD`。排序依据；不填则退化为按版本号排序 |
| `title` | 建议填 | 条目标题 |
| `summary` | 否 | 标题下方的补充说明 |
| `tags` | 否 | 字符串数组，显示为小标签，同时参与搜索 |
| `changes` | 是 | 改动条目数组，见下 |
| `links` | 否 | `{ label, url }` 数组，渲染为条目底部的外链 |

> `links` 只填**站外地址**（commit、Release、Issue、文档页等）。不要指向 `data/updates.json` 这种原始文件——点开只会在浏览器里显示一屏 JSON 文本。没有真实外链就整个字段删掉，条目底部那一行会自动消失。

### `changes` 条目

- 对象写法：`{ "type": "feat", "text": "……" }` —— `type` 决定左侧彩色徽章。
- 也支持纯字符串：`"修复了某个问题。"` —— 不显示徽章，只显示圆点。

内置类型（可在 `types` 里改标签和配色）：

| type | 默认标签 | 配色 |
|---|---|---|
| `feat` | 新功能 | 绿 |
| `fix` | 修复 | 红 |
| `improve` | 优化 | 蓝 |
| `perf` | 性能 | 橙 |
| `refactor` | 重构 | 紫 |
| `docs` | 文档 | 灰 |

想要新类型，在顶层 `types` 里加一行，`color` 从 `green` / `red` / `blue` / `amber` / `gray` / `purple` / `teal` / `pink` 里挑一个即可，不需要改 CSS。未知类型会自动降级成灰色徽章，不会报错。

### 文本里放代码

用反引号包裹，例如 `` `mi_setStuckParams` ``，会渲染成等宽高亮样式。

## 下载按钮

页面顶部有「直连下载」和「网盘下载」两个按钮，同样由 `updates.json` 驱动，写在**顶层** `download` 字段里：

```json
"download": {
  "title": "下载最新版本",
  "note": "1.4.0 · 2026-09-21 · Windows x64",
  "direct": { "label": "直连下载", "url": "https://your.site/download/bot-1.4.0.zip" },
  "pan":    { "label": "网盘下载", "url": "https://pan.baidu.com/s/1xxxxxxx", "code": "8888" }
}
```

| 字段 | 说明 |
|---|---|
| `title` | 左侧标题，默认「下载最新版本」 |
| `note` | 标题下的小字。**不填会自动显示「最新版本 1.4.0 · 2026-09-21」**，通常不用写 |
| `direct` | 直连下载按钮，`url` 指向真实文件地址（`.zip` / `.7z` / `.exe`），本页下载 |
| `pan` | 网盘下载按钮，新标签打开；`code` 是提取码，会渲染成旁边一个点击即复制的标签 |
| `label` | 可选，覆盖按钮文字 |

- 只写 `direct`、或只写 `pan` 都可以，缺的那个按钮不显示。
- 整个 `download` 字段删掉，顶部下载区整块消失。
- `url` 写成空字符串 `""`，按钮变灰色禁用态（悬停提示「尚未填写链接」），不会跳到坏地址。

> 直连下载**不要加 `download` 属性**（本站也没加）：如果链接实际上是个网页而不是文件，强制下载会把整个 HTML 存下来。让浏览器按响应类型自己判断即可 —— `.zip` / `.exe` 这类本来就会触发下载。

## 本地预览

**不要直接双击 `index.html`。** 浏览器会拦截 `file://` 下读取本地 JSON，页面会提示加载失败。

在本目录起一个静态服务：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000
```

或者用 VS Code 的 Live Server 插件。

## 部署

### nginx

把整个目录丢到站点根目录即可：

```nginx
server {
    listen 80;
    server_name your.domain.com;

    root /var/www/changelog;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # 关键：JSON 不要长缓存，否则 push 完页面还是旧的
    location = /data/updates.json {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files $uri =404;
    }

    # 静态资源可以长缓存（改了记得带版本号或用文件名区分）
    location ~* \.(css|js)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

```bash
nginx -t && nginx -s reload
```

### Cloudflare Pages

1. 仓库推到 GitHub / GitLab。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → 连接该仓库。
3. 构建设置全部留空：
   - **Framework preset**: None
   - **Build command**: 留空
   - **Build output directory**: `/`（或仓库根目录）
4. 保存后每次 push 自动部署，大约几十秒生效。

可选：在仓库根目录加一个 `_headers` 文件，确保 JSON 不被 CDN 长缓存（Cloudflare Pages 会自动识别，nginx 会忽略这个文件）：

```
/data/updates.json
  Cache-Control: no-cache, must-revalidate
```

## 常见问题

**改完 JSON 页面没变？**
浏览器或 CDN 缓存。`app.js` 已经用 `cache: 'no-cache'` 请求数据，强制刷新（Ctrl/Cmd + Shift + R）一般就正常了；如果用了别的 CDN，检查它是否忽略了 `Cache-Control`。

**页面显示「语法有误」？**
JSON 比普通文本严格：不能有多余的逗号、不能用单引号、最后一项后面不能有逗号。用任意在线 JSON 校验器贴一下就能定位。

**想换站点标题？**
改 `updates.json` 里的 `site.title` 和 `site.subtitle` 就行，页面会自动同步。

**条目顺序？**
自动按 `date` 倒序，同日则按版本号从高到低。数组里怎么排都不影响。
