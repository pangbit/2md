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
});
