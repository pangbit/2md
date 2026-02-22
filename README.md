# 2md

A Chrome extension that saves any web page as a Markdown file with locally downloaded images.

## Features

- **One-click conversion** — converts the current page to clean Markdown using [Mozilla Readability](https://github.com/mozilla/readability)
- **Local images** — downloads all images alongside the Markdown file, rewrites paths to relative links
- **SVG charts** — converts inline `<svg>` elements and cross-origin iframe charts (e.g. Cloudflare Radar) to PNG
- **GFM tables** — preserves tables using GitHub Flavored Markdown
- **YAML frontmatter** — includes title, author, source URL, and date
- **Fenced code blocks** — preserves code formatting

## Installation

> The extension is not yet published to the Chrome Web Store. Install it in developer mode.

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the repository folder
5. The 2md icon will appear in the toolbar

## Usage

1. Navigate to any article or documentation page
2. Click the **2md** icon in the toolbar
3. Click **Save as Markdown**
4. Chrome will download a `.md` file and an image folder (if the page has images)

The downloaded files look like this:

```
Article Title.md
Article Title/
  image1.png
  chart-1.png
  chart-2.png
```

The Markdown file references images with relative paths:

```markdown
---
title: "Article Title"
author: "Author Name"
source: "https://example.com/article"
date: "2026-02-22"
---

## Introduction

![Screenshot](<./Article Title/screenshot.png>)
```

## How It Works

```
popup.js
  ├── injects iframe-capture.js into ALL frames (cross-origin SVG capture)
  └── injects Readability.js + Turndown + content.js into top frame

content.js
  ├── Phase 1 — captures SVG charts from cross-origin iframes via postMessage
  ├── Phase 2 — clones document, replaces iframes with placeholders
  ├── Readability.parse() — extracts article body
  ├── Phase 3 — injects full iframe HTML (post-Readability, inside <blockquote>)
  ├── TurndownService — converts DOM to Markdown (GFM plugin)
  └── sendResponse — returns markdown + image URLs

background.js (service worker)
  └── chrome.downloads.download() for .md file and each image
```

### Cross-origin iframe charts

Pages like Cloudflare Radar embed charts in `<iframe src="https://radar.cloudflare.com/...">`. Since these are cross-origin, the content script cannot read their DOM directly. The solution:

1. `iframe-capture.js` is injected into every frame via `allFrames: true`
2. Inside each iframe it inlines computed CSS styles, converts SVGs ≥ 64×64 px to PNG data URLs, and replaces them with `<span data-2md-svg="N">` markers (avoiding resource-load side effects)
3. It posts `{ html, pngs }` back to the parent frame via `postMessage`
4. `content.js` receives the results, assigns placeholder URLs (`https://2md.invalid/chart-N.png`), and inserts the full iframe HTML **after** Readability so titles, legends, and labels are preserved

## Project Structure

```
2md/
├── manifest.json          # Extension manifest (MV3)
├── content.js             # Content script: Readability → Turndown → sendResponse
├── iframe-capture.js      # Injected into all frames for SVG chart capture
├── background.js          # Service worker: handles file downloads
├── popup/
│   ├── popup.html
│   └── popup.js           # Injects scripts, triggers conversion
├── lib/
│   ├── Readability.js     # Mozilla Readability v0.6.0
│   ├── turndown.js        # Turndown v7.2.0
│   └── turndown-plugin-gfm.js  # GFM plugin v1.0.4
├── icons/
│   └── icon-{16,32,48,128}.png
└── tests/
    ├── convert.test.js    # HTML → Markdown conversion
    ├── frontmatter.test.js
    ├── images.test.js     # URL deduplication and path mapping
    ├── sanitize.test.js   # Filename sanitization
    ├── svg.test.js        # SVG dimension parsing
    └── helpers/           # Test utilities (kept in sync with content.js)
```

## Development

```bash
cd tests
npm install
npm test
```

Tests run in Node.js with `jest-environment-jsdom` and do not require a browser.

## Third-party libraries

| Library | Version | License |
|---------|---------|---------|
| [Mozilla Readability](https://github.com/mozilla/readability) | 0.6.0 | Apache-2.0 |
| [Turndown](https://github.com/mixmark-io/turndown) | 7.2.0 | MIT |
| [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) | 1.0.4 | MIT |

## License

MIT
