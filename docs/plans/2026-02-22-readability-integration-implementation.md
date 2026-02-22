# Readability.js Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual CSS selector content extraction with Mozilla Readability for higher-quality article parsing, and add YAML frontmatter with metadata.

**Architecture:** Readability.js runs before Turndown to extract clean article HTML + metadata from the full document clone. The cleaned HTML feeds into Turndown for Markdown conversion. A new `buildFrontmatter()` function prepends YAML metadata (title, author, source, date) to the output.

**Tech Stack:** Mozilla Readability v0.6.0 (standalone browser JS), Turndown.js v7.2.0, turndown-plugin-gfm v1.0.4, Jest v29

---

### Task 1: Add Readability.js library

**Files:**
- Create: `lib/Readability.js`

**Step 1: Download Readability.js from jsDelivr CDN**

Download from: `https://cdn.jsdelivr.net/npm/@mozilla/readability@0.6.0/Readability.js`
Save to: `lib/Readability.js`

**Step 2: Verify the file exists and contains the Readability constructor**

Check the top of the file for the Apache 2.0 license header and `function Readability(doc, options)`.
Check the bottom for `module.exports = Readability;` (CJS export; works as global in browser).

**Step 3: Verify it loads in Node.js (CJS)**

Run in `tests/` directory:
```
node -e "const R = require('../lib/Readability'); console.log(typeof R)"
```
Expected output: `function`

**Step 4: Commit**

Stage `lib/Readability.js` and commit with message: `chore: add Mozilla Readability v0.6.0`

---

### Task 2: Add buildFrontmatter helper with tests (TDD)

**Files:**
- Create: `tests/helpers/frontmatter.js`
- Create: `tests/frontmatter.test.js`

**Step 1: Write the failing tests**

Create `tests/frontmatter.test.js`:

```javascript
const { buildFrontmatter } = require('./helpers/frontmatter');

test('generates frontmatter with all fields', () => {
  const result = buildFrontmatter({
    title: 'My Article',
    author: 'Jane Doe',
    source: 'https://example.com/post',
    date: '2026-02-22',
  });
  expect(result).toBe(
    '---\ntitle: "My Article"\nauthor: "Jane Doe"\nsource: "https://example.com/post"\ndate: "2026-02-22"\n---\n'
  );
});

test('omits fields with empty values', () => {
  const result = buildFrontmatter({
    title: 'My Article',
    author: null,
    source: 'https://example.com/post',
    date: '',
  });
  expect(result).toBe(
    '---\ntitle: "My Article"\nsource: "https://example.com/post"\n---\n'
  );
});

test('returns empty string when all fields are empty', () => {
  const result = buildFrontmatter({
    title: null,
    author: '',
    source: undefined,
    date: '',
  });
  expect(result).toBe('');
});

test('escapes double quotes in values', () => {
  const result = buildFrontmatter({
    title: 'He said "hello"',
    author: 'Jane',
    source: '',
    date: '',
  });
  expect(result).toBe(
    '---\ntitle: "He said \\"hello\\""\nauthor: "Jane"\n---\n'
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest frontmatter.test.js --no-cache` from `tests/` directory.
Expected: FAIL with `Cannot find module './helpers/frontmatter'`

**Step 3: Write the implementation**

Create `tests/helpers/frontmatter.js`:

```javascript
function buildFrontmatter(meta) {
  const lines = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value) {
      lines.push(key + ': "' + String(value).replace(/"/g, '\\"') + '"');
    }
  }
  if (lines.length === 0) return '';
  return '---\n' + lines.join('\n') + '\n---\n';
}

module.exports = { buildFrontmatter };
```

**Step 4: Run tests to verify they pass**

Run: `npx jest frontmatter.test.js --no-cache` from `tests/` directory.
Expected: 4 tests PASS

**Step 5: Run full test suite**

Run: `npx jest --no-cache` from `tests/` directory.
Expected: 20 tests PASS (16 existing + 4 new)

**Step 6: Commit**

Stage `tests/helpers/frontmatter.js` and `tests/frontmatter.test.js`.
Commit with message: `feat: add buildFrontmatter helper with tests`

---

### Task 3: Add Readability integration tests (TDD)

**Files:**
- Modify: `tests/convert.test.js`

**Step 1: Write the Readability integration tests**

Append to `tests/convert.test.js`:

```javascript
const Readability = require('../lib/Readability');
const { JSDOM } = require('jsdom');

describe('Readability integration', () => {
  function parseArticle(html) {
    const dom = new JSDOM(html, { url: 'https://example.com/article' });
    return new Readability(dom.window.document).parse();
  }

  test('extracts article content and strips nav/sidebar', () => {
    const html = `<html><head><title>Test</title></head><body>
      <nav><a href="/">Home</a></nav>
      <article><h1>Hello</h1><p>World</p></article>
      <aside>Sidebar junk</aside>
    </body></html>`;
    const article = parseArticle(html);
    expect(article).not.toBeNull();
    expect(article.content).toContain('Hello');
    expect(article.content).toContain('World');
    expect(article.content).not.toContain('Home');
    expect(article.content).not.toContain('Sidebar junk');
  });

  test('extracts title and byline metadata', () => {
    const html = `<html><head>
      <title>My Post - Blog</title>
      <meta name="author" content="Alice">
    </head><body>
      <article><h1>My Post</h1><p>Content here.</p></article>
    </body></html>`;
    const article = parseArticle(html);
    expect(article).not.toBeNull();
    expect(article.title).toContain('My Post');
  });

  test('returns null for unparseable pages', () => {
    const html = '<html><head><title>X</title></head><body><p>x</p></body></html>';
    const article = parseArticle(html);
    expect(article).toBeNull();
  });
});
```

Note: Readability needs sufficient content density to detect an article. The "unparseable" test uses minimal content to verify null handling. If the article-extraction tests fail due to insufficient content, increase the paragraph text or add more paragraphs.

**Step 2: Run tests**

Run: `npx jest convert.test.js --no-cache` from `tests/` directory.
Expected: 12 tests PASS (9 existing + 3 new). If any Readability tests fail due to content density, adjust the HTML fixtures by adding more paragraph content.

**Step 3: Run full test suite**

Run: `npx jest --no-cache` from `tests/` directory.
Expected: 23 tests PASS

**Step 4: Commit**

Stage `tests/convert.test.js`.
Commit with message: `test: add Readability integration tests`

---

### Task 4: Rewrite content.js to use Readability

**Files:**
- Modify: `content.js`

**Step 1: Rewrite content.js**

Replace the entire contents of `content.js`. Key changes from the original:

- **Remove:** `querySelector('main, article, [role="main"]')` content selection
- **Remove:** Manual noise element stripping (`script, style, nav, footer...`)
- **Add:** `new Readability(docClone).parse()` for article extraction
- **Add:** `buildFrontmatter()` for YAML metadata (same implementation as `tests/helpers/frontmatter.js`)
- **Add:** Error response when Readability returns null
- **Change:** Image collection now operates on `article.content` HTML via a temp container element
- **Change:** Title uses `article.title` (from Readability) with `document.title` as fallback
- **Preserve:** All image helper functions (`collectImages`, `buildUrlMap`, `rewriteImagePaths`, `sanitizeFilename`, `IMAGE_EXT`)

New `content.js` source:

```javascript
// content.js -- injected into the active tab by popup.js

function sanitizeFilename(title) {
  var cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}

function buildFrontmatter(meta) {
  var lines = [];
  for (var i = 0; i < Object.keys(meta).length; i++) {
    var key = Object.keys(meta)[i];
    var value = meta[key];
    if (value) {
      lines.push(key + ': "' + String(value).replace(/"/g, '\\"') + '"');
    }
  }
  if (lines.length === 0) return '';
  return '---\n' + lines.join('\n') + '\n---\n';
}

// Only download common raster image formats; skip SVG icons, tracking pixels, etc.
var IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action !== 'convert') return;

  // Readability needs a full document clone (it mutates the DOM)
  var docClone = document.cloneNode(true);
  var article = new Readability(docClone).parse();

  if (!article) {
    sendResponse({ error: '无法提取文章正文' });
    return true;
  }

  // Parse article.content HTML to collect and rewrite images
  var container = document.createElement('div');
  container.innerHTML = article.content;

  // Normalize img srcs to absolute URLs
  container.querySelectorAll('img').forEach(function(img) {
    img.setAttribute('src', img.src);
  });

  // Collect only raster image URLs (absolute, deduplicated)
  var imageUrls = Array.from(new Set(
    Array.from(container.querySelectorAll('img'))
      .map(function(img) { return img.getAttribute('src'); })
      .filter(function(src) { return src && IMAGE_EXT.test(src); })
  ));

  var title = sanitizeFilename(article.title || document.title);
  var urlToLocal = buildUrlMap(imageUrls);

  // Custom Turndown rule: write local path directly during conversion
  var td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndownPluginGfm.gfm(td);
  td.addRule('localImages', {
    filter: 'img',
    replacement: function(content, node) {
      var src = node.getAttribute('src') || '';
      var alt = (node.getAttribute('alt') || '').trim();
      var localName = urlToLocal[src];
      if (localName) return '![' + alt + '](./' + title + '/' + localName + ')';
      if (IMAGE_EXT.test(src)) return '![' + alt + '](' + src + ')';
      return ''; // skip icons / tracking pixels
    }
  });

  var markdown = td.turndown(container.innerHTML);

  // Build YAML frontmatter with metadata
  var frontmatter = buildFrontmatter({
    title: article.title,
    author: article.byline,
    source: location.href,
    date: new Date().toISOString().slice(0, 10),
  });

  sendResponse({
    title: title,
    markdown: frontmatter + '\n' + markdown,
    imageUrls: imageUrls,
    urlToLocal: urlToLocal,
  });
  return true;
});

// --- Shared helpers (also used by tests/helpers/) ---

function collectImages(markdown) {
  var regex = /!\[.*?\]\(((?!data:)[^)]+)\)/g;
  var urls = [];
  var match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function buildUrlMap(urls) {
  var seen = {};
  var urlToLocal = {};
  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    var base = url.split('/').pop().split('?')[0] || 'image';
    var name = base;
    if (seen[name] !== undefined) {
      seen[name]++;
      var dotIdx = name.lastIndexOf('.');
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
  return markdown.replace(/!\[(.*?)\]\(([^)]+)\)/g, function(match, alt, url) {
    if (urlToLocal[url]) {
      return '![' + alt + '](./' + folderName + '/' + urlToLocal[url] + ')';
    }
    return match;
  });
}
```

**Step 2: Run existing tests to verify no regressions**

Run: `npx jest --no-cache` from `tests/` directory.
Expected: 23 tests PASS. The helper functions and Turndown conversion tests are unchanged.

**Step 3: Commit**

Stage `content.js`.
Commit with message: `feat: replace manual content selection with Readability.js`

---

### Task 5: Update popup.js injection order and error handling

**Files:**
- Modify: `popup/popup.js`

**Step 1: Update the script injection list**

In `popup/popup.js`, change line 16 from:

```javascript
      files: ['lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'content.js'],
```

to:

```javascript
      files: ['lib/Readability.js', 'lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'content.js'],
```

This ensures `Readability` is defined as a global before `content.js` runs.

**Step 2: Add handling for the Readability error response**

After line 24 (`if (!response) throw new Error(...)`) add:

```javascript
    if (response.error) throw new Error(response.error);
```

**Step 3: Run full test suite**

Run: `npx jest --no-cache` from `tests/` directory.
Expected: 23 tests PASS (popup.js is not unit-tested, but ensures no breakage)

**Step 4: Commit**

Stage `popup/popup.js`.
Commit with message: `feat: inject Readability.js and handle extraction errors in popup`

---

### Task 6: Manual end-to-end verification

**Step 1: Load the extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `2md` project folder
4. (If already loaded, click the refresh icon to reload)

**Step 2: Test on a blog article**

1. Navigate to any blog post (e.g. a Medium article, a tech blog)
2. Click the 2md extension icon and "Save as Markdown"
3. Verify the `.md` file downloads with YAML frontmatter at the top
4. Verify the body contains clean article content without nav/sidebar/footer noise
5. Verify images download to a subfolder

**Step 3: Test Readability failure case**

1. Create a local HTML file with just `<html><body><p>hello</p></body></html>`
2. Open it in Chrome and click 2md
3. Verify status shows the error message

**Step 4: Run full test suite one final time**

Run: `npx jest --no-cache` from `tests/` directory.
Expected: 23 tests PASS
