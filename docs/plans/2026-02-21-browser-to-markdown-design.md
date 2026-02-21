# 2md：浏览器页面转 Markdown Chrome 扩展 — 设计文档

**日期：** 2026-02-21
**状态：** 已批准

---

## 概述

2md 是一个 Chrome/Edge 扩展，用户点击一次即可将当前浏览器显示的页面完整转存为 Markdown 文件，图片同步下载到本地。

---

## 架构与组件

```
2md/
├── manifest.json          # Manifest V3 配置
├── background.js          # Service Worker：协调下载任务
├── content.js             # Content Script：DOM 读取 + HTML→MD 转换
├── popup/
│   ├── popup.html         # 扩展 Popup UI
│   └── popup.js           # 触发转换逻辑
└── lib/
    └── turndown.js        # Turndown.js（打包进扩展）
```

### 数据流

1. 用户点击扩展图标 → Popup 显示
2. 用户点击"保存为 Markdown" → `popup.js` 向当前 Tab 的 `content.js` 发消息
3. `content.js` 读取 `document.body.innerHTML`，用 Turndown 转换为 Markdown 字符串，并收集所有 `<img>` 的 src
4. 将结果发回 `popup.js` / `background.js`
5. `background.js` 通过 `chrome.downloads` 下载 `.md` 文件和所有图片

---

## 文件命名与输出结构

**Markdown 文件命名：** 使用页面 `<title>` 清洗后作为文件名（去除非法字符）：

```
{页面标题}.md
{页面标题}/
    image1.png
    image2.jpg
    ...
```

**图片路径替换：**
- 原始：`![alt](https://example.com/img/photo.jpg)`
- 替换为：`![alt](./{页面标题}/photo.jpg)`

**边界情况：**
- `data:` URI 图片：跳过，保留原 src
- 图片下载失败：保留原始 URL，不中断整体流程
- 文件名冲突：自动追加 `_1`、`_2` 后缀

---

## 权限与 UX

### Manifest V3 权限

```json
{
  "permissions": ["activeTab", "downloads", "scripting"],
  "host_permissions": ["<all_urls>"]
}
```

- `activeTab` + `scripting`：向当前页面注入 content script
- `downloads`：下载 .md 文件和图片
- `host_permissions`：content script fetch 跨域图片

### Popup UI

极简单屏设计：

```
┌─────────────────────┐
│  2md                │
│                     │
│  [保存为 Markdown]  │
│                     │
│  ⏳ 正在下载图片… 3/7│
└─────────────────────┘
```

- 点击按钮后显示进度（已下载 N/M 张图片）
- 完成后显示"✓ 已保存"
- 若页面无图片，直接下载 .md，无进度显示
- 无需设置页，保持工具极简

---

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| HTML → Markdown | Turndown.js | 成熟稳定，支持自定义规则 |
| 浏览器扩展规范 | Manifest V3 | Chrome 当前标准 |
| 图片下载 | `chrome.downloads` API | 原生 API，无需额外权限 |
| 构建工具 | 无（纯原生 JS） | 保持简单，无需 bundler |
