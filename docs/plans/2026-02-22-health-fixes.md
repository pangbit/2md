# Project Health Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复项目健康度审查中发现的 P1/P2 问题：data URL 大小限制、sendMessage 无超时、缺少 CI、README 过时。

**Architecture:**
- Task 1 将 `.md` 文件下载从 `background.js`（service worker，无 Blob API）迁移到 `popup.js`（扩展页面，有 Blob + `URL.createObjectURL`），彻底消除 data URL 大小限制。
- Task 2 在 `popup.js` 的 `sendMessage` 外包 `Promise.race` + 30s 超时，防止 UI 永久卡死。
- Task 3 创建 GitHub Actions workflow，每次 push/PR 自动运行 `npm test`。
- Task 4 更新 README 项目结构图，补全 `svg.test.js` 和 `helpers/`。

**Tech Stack:** Chrome MV3 Extension（popup.js、background.js）、GitHub Actions、Markdown

---

## Task 1: 将 .md 下载迁移到 popup.js（消除 data URL 大小限制）

**Files:**
- Modify: `popup/popup.js:48-63`
- Modify: `background.js:6-15`

**Background:**
`background.js` 当前将 markdown 文本 `encodeURIComponent` 编码成 data URL 来触发下载，对于超长文章（大量代码块/表格）可能超过 Chrome 的 URL 长度限制。
MV3 service worker 无法使用 `URL.createObjectURL()`，但 `popup.js` 是普通扩展页面，可以使用 `Blob` + `URL.createObjectURL`。
将 `.md` 下载移到 `popup.js`，`background.js` 只保留图片下载（图片是远程 URL 或 data URL，无大小问题）。

**Step 1: 修改 popup.js — 在收到 response 后直接下载 .md**

在 `popup/popup.js` 第 48 行找到：
```js
    const { title, markdown, imageUrls, urlToLocal } = response;

    setStatus(imageUrls.length > 0 ? 'Downloading images...' : 'Saving...', '');

    chrome.runtime.sendMessage(
      { action: 'download', title, markdown, imageUrls, urlToLocal },
```

替换为：
```js
    const { title, markdown, imageUrls, urlToLocal } = response;

    // Download .md from popup context using Blob URL — avoids data URL size limits
    // that affect MV3 service workers (which cannot use URL.createObjectURL).
    const mdBlob = new Blob([markdown], { type: 'text/markdown; charset=utf-8' });
    const mdBlobUrl = URL.createObjectURL(mdBlob);
    chrome.downloads.download(
      { url: mdBlobUrl, filename: title + '.md', saveAs: false },
      () => { URL.revokeObjectURL(mdBlobUrl); void chrome.runtime.lastError; }
    );

    setStatus(imageUrls.length > 0 ? 'Downloading images...' : 'Saving...', '');

    chrome.runtime.sendMessage(
      { action: 'download', title, imageUrls, urlToLocal },
```

（注意：`markdown` 已从 sendMessage payload 中移除）

**Step 2: 修改 background.js — 移除 .md 下载代码**

在 `background.js` 第 6 行找到：
```js
  const { title, markdown, imageUrls, urlToLocal } = message;

  // Download the .md file via data URL (Blob not available in service worker)
  const encoded = encodeURIComponent(markdown);
  const mdDataUrl = 'data:text/markdown;charset=utf-8,' + encoded;

  chrome.downloads.download(
    { url: mdDataUrl, filename: title + '.md', saveAs: false },
    () => { void chrome.runtime.lastError; }
  );

  const total = imageUrls.length;
```

替换为：
```js
  const { title, imageUrls, urlToLocal } = message;

  const total = imageUrls.length;
```

（`markdown` 不再需要，`.md` 下载已移至 popup.js）

**Step 3: 运行现有测试确认无回归**

```bash
cd /Users/xubochen/Workspace/2md/tests && npx jest --no-coverage
```
Expected: 44 passed

**Step 4: 手动测试**

1. 在 `chrome://extensions/` 点击 2md 的刷新按钮
2. 打开一篇长文章（如技术文档含大量代码块）
3. 点击 Save as Markdown
4. 确认下载了 `.md` 文件且内容完整
5. 确认图片文件夹也正常下载

**Step 5: Commit**

```bash
git add popup/popup.js background.js
git commit -m "fix: move .md download to popup.js using Blob URL to avoid data URL size limits"
```

---

## Task 2: sendMessage 转换超时保护（防止 UI 永久卡死）

**Files:**
- Modify: `popup/popup.js:38-43`

**Background:**
`popup.js` 的 `chrome.tabs.sendMessage` 等待 `content.js` 的 `sendResponse`，若 Readability 处理超大文档时间过长，popup 按钮永久禁用，用户只能关闭弹窗再重新打开才能重试。

**Step 1: 添加 30s 超时常量并包装 Promise.race**

在 `popup/popup.js` 第 38 行找到：
```js
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'convert' }, (resp) => {
        void chrome.runtime.lastError; // consume to suppress "Unchecked lastError" warning
        resolve(resp);
      });
    });
```

替换为：
```js
    const CONVERSION_TIMEOUT_MS = 30_000;
    const response = await Promise.race([
      new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'convert' }, (resp) => {
          void chrome.runtime.lastError; // consume to suppress "Unchecked lastError" warning
          resolve(resp);
        });
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Conversion timed out — the page may be too large')),
          CONVERSION_TIMEOUT_MS
        )
      ),
    ]);
```

**Step 2: 运行测试确认无回归**

```bash
cd /Users/xubochen/Workspace/2md/tests && npx jest --no-coverage
```
Expected: 44 passed

**Step 3: 手动验证超时路径**

临时将 `CONVERSION_TIMEOUT_MS` 改为 `100`，刷新扩展，点击 Save as Markdown，确认弹窗显示 "Failed: Conversion timed out — the page may be too large" 且按钮重新激活。测试后恢复为 `30_000`。

**Step 4: Commit**

```bash
git add popup/popup.js
git commit -m "fix: add 30s timeout to sendMessage to prevent popup from being permanently disabled"
```

---

## Task 3: GitHub Actions CI（自动化测试）

**Files:**
- Create: `.github/workflows/test.yml`

**Background:**
目前没有 CI，PR 合并依赖人工运行 `npm test`。添加 GitHub Actions workflow，在每次 push 到 `main` 和每个 PR 时自动运行测试套件。

**Step 1: 创建 .github/workflows/test.yml**

```bash
mkdir -p /Users/xubochen/Workspace/2md/.github/workflows
```

创建 `/Users/xubochen/Workspace/2md/.github/workflows/test.yml`：

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: tests/package-lock.json
      - name: Install dependencies
        run: npm ci
        working-directory: tests
      - name: Run tests
        run: npm test
        working-directory: tests
```

**Step 2: 验证 YAML 语法**

```bash
cat /Users/xubochen/Workspace/2md/.github/workflows/test.yml
```
Expected: 文件内容完整显示，无截断

**Step 3: 运行本地测试确认配置与本地一致**

```bash
cd /Users/xubochen/Workspace/2md/tests && npm ci && npm test
```
Expected: 44 passed（模拟 CI 环境）

**Step 4: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add GitHub Actions workflow to run tests on push and PR"
```

---

## Task 4: 更新 README 项目结构图

**Files:**
- Modify: `README.md:101-105`

**Background:**
`README.md` 的项目结构图缺少 `svg.test.js` 和 `tests/helpers/` 目录，与实际代码不符。

**Step 1: 更新项目结构图**

在 `README.md` 找到：
```
└── tests/
    ├── convert.test.js    # HTML → Markdown conversion
    ├── frontmatter.test.js
    ├── images.test.js     # Image URL collection and path rewriting
    └── sanitize.test.js   # Filename sanitization
```

替换为：
```
└── tests/
    ├── convert.test.js    # HTML → Markdown conversion
    ├── frontmatter.test.js
    ├── images.test.js     # URL deduplication and path mapping
    ├── sanitize.test.js   # Filename sanitization
    ├── svg.test.js        # SVG dimension parsing
    └── helpers/           # Test utilities (kept in sync with content.js)
```

**Step 2: 验证文件无语法问题**

```bash
grep -A 12 "Project Structure" /Users/xubochen/Workspace/2md/README.md | grep -A 10 "tests/"
```
Expected: 输出包含 `svg.test.js` 和 `helpers/`

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update project structure in README to include svg.test.js and helpers/"
```

---

## 完成后推送

```bash
git push origin main
```
