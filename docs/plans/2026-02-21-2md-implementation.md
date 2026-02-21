# 2md Chrome Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome/Edge extension that converts the currently displayed browser page to a Markdown file (with images downloaded locally) via a single popup button click.

**Architecture:** A Manifest V3 extension with a content script that reads the DOM and converts it using Turndown.js, a background service worker that handles all chrome.downloads calls, and a minimal popup UI that triggers the flow and shows progress.

**Tech Stack:** Pure vanilla JS (no bundler), Turndown.js (HTML to Markdown), Chrome Extension Manifest V3 APIs (scripting, downloads, activeTab).

---

## Directory Structure (target)

```
2md/
├── manifest.json
├── background.js
├── content.js
├── popup/
│   ├── popup.html
│   └── popup.js
├── lib/
│   └── turndown.js
├── tests/
│   ├── package.json
│   ├── sanitize.test.js
│   ├── convert.test.js
│   └── images.test.js
└── docs/
    └── plans/
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `manifest.json`
- Create: `background.js` (empty stub)
- Create: `content.js` (empty stub)
- Create: `popup/popup.html`
- Create: `popup/popup.js` (empty stub)

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "2md",
  "version": "1.0.0",
  "description": "Save the current browser page as a Markdown file",
  "permissions": ["activeTab", "downloads", "scripting"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Save as Markdown"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

**Step 2: Create stub files**

`background.js` — single comment line:
```
// Service worker: handles chrome.downloads coordination
```

`content.js` — single comment line:
```
// Content script: reads DOM, converts to Markdown, collects images
```

`popup/popup.html`:
```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 220px; padding: 16px; font-family: sans-serif; }
    button { width: 100%; padding: 8px; cursor: pointer; font-size: 14px; }
    #status { margin-top: 10px; font-size: 12px; color: #555; min-height: 16px; }
  </style>
</head>
<body>
  <h3 style="margin:0 0 12px">2md</h3>
  <button id="save-btn">保存为 Markdown</button>
  <div id="status"></div>
  <script src="popup.js"></script>
</body>
</html>
```

`popup/popup.js` — single comment line:
```
// Popup logic: triggers conversion and shows progress
```

**Step 3: Commit**

```
git add manifest.json background.js content.js popup/
git commit -m "chore: scaffold extension structure"
```

---

### Task 2: Add Turndown.js

**Files:**
- Create: `lib/turndown.js`

**Step 1: Download Turndown.js**

```
curl -L https://unpkg.com/turndown@7.2.0/dist/turndown.js -o lib/turndown.js
```

Verify it contains TurndownService:
```
grep -c "TurndownService" lib/turndown.js
# Expected: number > 0
```

**Step 2: Commit**

```
git add lib/turndown.js
git commit -m "chore: add turndown.js v7.2.0"
```

---

### Task 3: Unit Test Setup

**Files:**
- Create: `tests/package.json`

**Step 1: Create tests/package.json**

```json
{
  "name": "2md-tests",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

**Step 2: Install dependencies**

```
cd tests && npm install
```

**Step 3: Create and run smoke test**

Create `tests/smoke.test.js`:
```js
test('jest works', () => {
  expect(1 + 1).toBe(2);
});
```

Run:
```
cd tests && npm test
```
Expected: PASS

**Step 4: Remove smoke test and commit**

```
rm tests/smoke.test.js
git add tests/
git commit -m "chore: add jest test setup"
```

---

### Task 4: Filename Sanitization

**Files:**
- Create: `tests/sanitize.test.js`
- Create: `tests/helpers/sanitize.js`
- Modify: `content.js`

**Step 1: Write failing tests**

`tests/sanitize.test.js`:
```js
const { sanitizeFilename } = require('./helpers/sanitize');

test('removes characters invalid in filenames', () => {
  expect(sanitizeFilename('Hello: World/Test?')).toBe('Hello World Test');
});

test('trims leading and trailing whitespace', () => {
  expect(sanitizeFilename('  Hello World  ')).toBe('Hello World');
});

test('collapses multiple spaces', () => {
  expect(sanitizeFilename('Hello   World')).toBe('Hello World');
});

test('handles empty string', () => {
  expect(sanitizeFilename('')).toBe('untitled');
});

test('handles string with only invalid chars', () => {
  expect(sanitizeFilename('???:::')).toBe('untitled');
});
```

**Step 2: Create test helper**

`tests/helpers/sanitize.js`:
```js
function sanitizeFilename(title) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}

module.exports = { sanitizeFilename };
```

**Step 3: Run tests**

```
cd tests && npm test sanitize
```
Expected: 5 tests PASS

**Step 4: Add sanitizeFilename to content.js**

Add at the top of `content.js`:
```js
function sanitizeFilename(title) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}
```

**Step 5: Commit**

```
git add content.js tests/sanitize.test.js tests/helpers/sanitize.js
git commit -m "feat: add filename sanitization"
```

---

### Task 5: Image Collection and Path Rewriting

**Files:**
- Create: `tests/images.test.js`
- Create: `tests/helpers/images.js`
- Modify: `content.js`

**Step 1: Write failing tests**

`tests/images.test.js`:
```js
const { collectImages, buildUrlMap, rewriteImagePaths } = require('./helpers/images');

test('collects absolute image URLs from markdown', () => {
  const md = '![a](https://example.com/a.png)\n![b](https://example.com/b.jpg)';
  expect(collectImages(md)).toEqual([
    'https://example.com/a.png',
    'https://example.com/b.jpg',
  ]);
});

test('ignores data: URIs', () => {
  const md = '![a](data:image/png;base64,abc)\n![b](https://example.com/b.jpg)';
  expect(collectImages(md)).toEqual(['https://example.com/b.jpg']);
});

test('rewrites image URLs to local paths', () => {
  const md = '![a](https://example.com/path/photo.png)';
  const urlToLocal = { 'https://example.com/path/photo.png': 'photo.png' };
  const result = rewriteImagePaths(md, 'My Page', urlToLocal);
  expect(result).toBe('![a](./My Page/photo.png)');
});

test('handles duplicate filenames by appending index', () => {
  const urls = ['https://a.com/img.png', 'https://b.com/img.png'];
  const urlToLocal = buildUrlMap(urls);
  expect(urlToLocal['https://a.com/img.png']).toBe('img.png');
  expect(urlToLocal['https://b.com/img.png']).toBe('img_1.png');
});
```

**Step 2: Create test helper**

`tests/helpers/images.js`:
```js
function collectImages(markdown) {
  const regex = /!\[.*?\]\(((?!data:)[^)]+)\)/g;
  const urls = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function buildUrlMap(urls) {
  const seen = {};
  const urlToLocal = {};
  for (const url of urls) {
    const base = url.split('/').pop().split('?')[0] || 'image';
    let name = base;
    if (seen[name] !== undefined) {
      seen[name]++;
      const dotIdx = name.lastIndexOf('.');
      name = dotIdx >= 0
        ? name.slice(0, dotIdx) + '_' + seen[base] + name.slice(dotIdx)
        : name + '_' + seen[base];
    } else {
      seen[base] = 0;
    }
    urlToLocal[url] = name;
  }
  return urlToLocal;
}

function rewriteImagePaths(markdown, folderName, urlToLocal) {
  return markdown.replace(/!\[(.*?)\]\(([^)]+)\)/g, (match, alt, url) => {
    if (urlToLocal[url]) {
      return '![' + alt + '](./' + folderName + '/' + urlToLocal[url] + ')';
    }
    return match;
  });
}

module.exports = { collectImages, buildUrlMap, rewriteImagePaths };
```

**Step 3: Run tests**

```
cd tests && npm test images
```
Expected: all PASS

**Step 4: Add the three functions to content.js**

Append to `content.js` (after sanitizeFilename):
```js
function collectImages(markdown) {
  const regex = /!\[.*?\]\(((?!data:)[^)]+)\)/g;
  const urls = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function buildUrlMap(urls) {
  const seen = {};
  const urlToLocal = {};
  for (const url of urls) {
    const base = url.split('/').pop().split('?')[0] || 'image';
    let name = base;
    if (seen[name] !== undefined) {
      seen[name]++;
      const dotIdx = name.lastIndexOf('.');
      name = dotIdx >= 0
        ? name.slice(0, dotIdx) + '_' + seen[base] + name.slice(dotIdx)
        : name + '_' + seen[base];
    } else {
      seen[base] = 0;
    }
    urlToLocal[url] = name;
  }
  return urlToLocal;
}

function rewriteImagePaths(markdown, folderName, urlToLocal) {
  return markdown.replace(/!\[(.*?)\]\(([^)]+)\)/g, (match, alt, url) => {
    if (urlToLocal[url]) {
      return '![' + alt + '](./' + folderName + '/' + urlToLocal[url] + ')';
    }
    return match;
  });
}
```

**Step 5: Commit**

```
git add content.js tests/images.test.js tests/helpers/images.js
git commit -m "feat: add image collection and path rewriting"
```

---

### Task 6: HTML to Markdown Conversion Test

**Files:**
- Create: `tests/convert.test.js`

**Step 1: Write tests (Turndown works in Node.js)**

`tests/convert.test.js`:
```js
const TurndownService = require('../lib/turndown');

test('converts heading', () => {
  const td = new TurndownService();
  expect(td.turndown('<h1>Hello</h1>')).toBe('# Hello');
});

test('converts bold', () => {
  const td = new TurndownService();
  expect(td.turndown('<strong>Bold</strong>')).toBe('**Bold**');
});

test('converts link', () => {
  const td = new TurndownService();
  expect(td.turndown('<a href="https://example.com">Link</a>')).toBe('[Link](https://example.com)');
});

test('converts image', () => {
  const td = new TurndownService();
  expect(td.turndown('<img src="https://example.com/img.png" alt="photo">')).toBe('![photo](https://example.com/img.png)');
});
```

**Step 2: Run tests**

```
cd tests && npm test convert
```
Expected: all PASS

**Step 3: Implement the full content script message handler**

Replace all of `content.js` with:

```js
// content.js — injected into the active tab by popup.js

function sanitizeFilename(title) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}

function collectImages(markdown) {
  const regex = /!\[.*?\]\(((?!data:)[^)]+)\)/g;
  const urls = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function buildUrlMap(urls) {
  const seen = {};
  const urlToLocal = {};
  for (const url of urls) {
    const base = url.split('/').pop().split('?')[0] || 'image';
    let name = base;
    if (seen[name] !== undefined) {
      seen[name]++;
      const dotIdx = name.lastIndexOf('.');
      name = dotIdx >= 0
        ? name.slice(0, dotIdx) + '_' + seen[base] + name.slice(dotIdx)
        : name + '_' + seen[base];
    } else {
      seen[base] = 0;
    }
    urlToLocal[url] = name;
  }
  return urlToLocal;
}

function rewriteImagePaths(markdown, folderName, urlToLocal) {
  return markdown.replace(/!\[(.*?)\]\(([^)]+)\)/g, (match, alt, url) => {
    if (urlToLocal[url]) {
      return '![' + alt + '](./' + folderName + '/' + urlToLocal[url] + ')';
    }
    return match;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'convert') return;

  const td = new TurndownService();
  const rawMarkdown = td.turndown(document.body.innerHTML);
  const title = sanitizeFilename(document.title);
  const imageUrls = collectImages(rawMarkdown);
  const urlToLocal = buildUrlMap(imageUrls);
  const markdown = rewriteImagePaths(rawMarkdown, title, urlToLocal);

  sendResponse({ title, markdown, imageUrls, urlToLocal });
  return true;
});
```

**Step 4: Commit**

```
git add content.js tests/convert.test.js
git commit -m "feat: implement content script HTML to Markdown conversion"
```

---

### Task 7: Background Service Worker

**Files:**
- Modify: `background.js`

**Step 1: Implement background.js**

```js
// background.js — Manifest V3 service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'download') return;

  const { title, markdown, imageUrls, urlToLocal } = message;

  // Download the .md file via data URL (Blob not available in service worker)
  const encoded = encodeURIComponent(markdown);
  const mdDataUrl = 'data:text/markdown;charset=utf-8,' + encoded;

  chrome.downloads.download({ url: mdDataUrl, filename: title + '.md', saveAs: false });

  const total = imageUrls.length;

  if (total === 0) {
    sendResponse({ done: true, completed: 0, total: 0 });
    return true;
  }

  let completed = 0;

  for (const url of imageUrls) {
    const localName = urlToLocal[url];
    chrome.downloads.download(
      { url: url, filename: title + '/' + localName, saveAs: false },
      () => {
        completed++;
        sendResponse({ done: completed === total, completed, total });
      }
    );
  }

  return true;
});
```

**Step 2: Commit**

```
git add background.js
git commit -m "feat: implement background service worker download coordination"
```

---

### Task 8: Popup UI

**Files:**
- Modify: `popup/popup.js`

**Step 1: Implement popup/popup.js**

```js
// popup.js

const btn = document.getElementById('save-btn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = '⏳ 正在转换页面…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject Turndown.js and content.js into the active tab
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['lib/turndown.js', 'content.js'],
  });

  // Ask content script to convert the page
  const response = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'convert' }, resolve);
  });

  const { title, markdown, imageUrls, urlToLocal } = response;

  status.textContent = imageUrls.length === 0
    ? '⏳ 正在下载…'
    : '⏳ 正在下载图片… 0/' + imageUrls.length;

  // Ask background service worker to download everything
  chrome.runtime.sendMessage(
    { action: 'download', title, markdown, imageUrls, urlToLocal },
    function onProgress(progress) {
      if (!progress) return;
      if (progress.done) {
        status.textContent = '✓ 已保存';
        btn.disabled = false;
      } else {
        status.textContent = '⏳ 正在下载图片… ' + progress.completed + '/' + progress.total;
      }
    }
  );
});
```

**Step 2: Commit**

```
git add popup/popup.js
git commit -m "feat: implement popup UI with progress feedback"
```

---

### Task 9: Manual End-to-End Testing

**Step 1: Load the extension in Chrome**

1. Open Chrome → navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle top right)
3. Click "Load unpacked" → select the `2md/` project root
4. Verify the extension icon appears with no error badge

**Step 2: Test on a content-rich page**

1. Navigate to `https://en.wikipedia.org/wiki/Markdown`
2. Click the 2md extension icon
3. Click "保存为 Markdown"
4. Watch progress indicator update
5. Open Downloads folder — verify `Markdown - Wikipedia.md` and `Markdown - Wikipedia/` folder with images

**Step 3: Open the .md file and verify**

- Headings render as `# H1`, `## H2`
- Images reference `./Markdown - Wikipedia/filename.png` (not the original URL)
- Links are preserved

**Step 4: Test a page with no images**

Navigate to a plain text page — verify only `.md` downloads with no delay.

**Step 5: Commit any fixes found during testing**

```
git add -A
git commit -m "fix: manual testing adjustments"
```

---

## Summary of Commits

| Task | Commit Message |
|------|----------------|
| 1 | `chore: scaffold extension structure` |
| 2 | `chore: add turndown.js v7.2.0` |
| 3 | `chore: add jest test setup` |
| 4 | `feat: add filename sanitization` |
| 5 | `feat: add image collection and path rewriting` |
| 6 | `feat: implement content script HTML to Markdown conversion` |
| 7 | `feat: implement background service worker download coordination` |
| 8 | `feat: implement popup UI with progress feedback` |
| 9 | `fix: manual testing adjustments` (if needed) |
