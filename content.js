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

// Only download common raster image formats; skip SVG icons, tracking pixels, etc.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'convert') return;

  // Prefer main content element to skip nav/sidebar
  const contentEl = document.querySelector('main, article, [role="main"]') || document.body;

  // Clone and strip noise elements that produce garbage in markdown
  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="complementary"]')
    .forEach(el => el.remove());

  // Normalize img srcs to absolute URLs before Turndown sees them
  clone.querySelectorAll('img').forEach(img => {
    img.setAttribute('src', img.src);
  });

  // Collect only raster image URLs (absolute, deduplicated)
  const imageUrls = [...new Set(
    Array.from(clone.querySelectorAll('img'))
      .map(img => img.getAttribute('src'))
      .filter(src => src && IMAGE_EXT.test(src))
  )];

  const title = sanitizeFilename(document.title);
  const urlToLocal = buildUrlMap(imageUrls);

  // Custom Turndown rule: write local path directly during conversion
  // so there's no URL-matching post-processing step that can misfire
  const td = new TurndownService({ headingStyle: 'atx' });
  td.addRule('localImages', {
    filter: 'img',
    replacement: (content, node) => {
      const src = node.getAttribute('src') || '';
      const alt = (node.getAttribute('alt') || '').trim();
      const localName = urlToLocal[src];
      if (localName) return '![' + alt + '](./' + title + '/' + localName + ')';
      if (IMAGE_EXT.test(src)) return '![' + alt + '](' + src + ')';
      return ''; // skip icons / tracking pixels
    }
  });

  const markdown = td.turndown(clone.innerHTML);

  sendResponse({ title, markdown, imageUrls, urlToLocal });
});
