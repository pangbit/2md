# GFM Plugin Integration Design

**日期：** 2026-02-21
**状态：** 已批准

## 目标

通过添加 `turndown-plugin-gfm` 解决表格、代码块、标题层次三个转换质量问题。

## 改动范围

### 1. 新增文件

- `lib/turndown-plugin-gfm.js` — 从 unpkg 下载 GFM 插件

### 2. 修改 `popup/popup.js`

注入脚本列表加入 GFM 插件（顺序必须在 turndown.js 之后、content.js 之前）：

```js
await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'content.js'],
});
```

### 3. 修改 `content.js`

启用 GFM 插件，添加 `codeBlockStyle: 'fenced'`：

```js
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
gfm(td);
```

## GFM 插件解决的问题

| 问题 | 修复方式 |
|------|---------|
| HTML 表格变一堆文字 | GFM 插件将 `<table>` 转为标准 Markdown 表格 |
| 代码块丢失 | `codeBlockStyle: 'fenced'` + GFM 插件处理 `<pre><code>` |
| 标题层次不稳定 | 已有 `headingStyle: 'atx'`，GFM 整体解析更稳定 |

## 已知局限

页面噪音问题（无语义标签的页面）不在本次范围内，已有 `main/article` 选择器和噪音元素移除作为基础处理。如需进一步改善，后续可引入 Readability.js。
