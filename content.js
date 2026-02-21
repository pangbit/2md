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

  // Use main content element if available to reduce nav/sidebar noise
  const contentEl = document.querySelector('main, article, [role="main"]') || document.body;

  // Clone to avoid mutating the live page; normalize img srcs to absolute URLs
  // (img.src getter always returns the fully-resolved absolute URL)
  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll('img').forEach(img => {
    img.setAttribute('src', img.src);
  });

  // atx style produces # H1 ## H2 instead of underline-style headings
  const td = new TurndownService({ headingStyle: 'atx' });
  const rawMarkdown = td.turndown(clone.innerHTML);

  // Collect absolute image URLs from the DOM (not from markdown text)
  // so chrome.downloads gets valid URLs regardless of how src was written in HTML
  const imageUrls = [...new Set(
    Array.from(clone.querySelectorAll('img'))
      .map(img => img.getAttribute('src'))
      .filter(src => src && !src.startsWith('data:'))
  )];

  const title = sanitizeFilename(document.title);
  const urlToLocal = buildUrlMap(imageUrls);
  const markdown = rewriteImagePaths(rawMarkdown, title, urlToLocal);

  sendResponse({ title, markdown, imageUrls, urlToLocal });
});
