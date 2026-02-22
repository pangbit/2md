// content.js — injected into the active tab by popup.js

function sanitizeFilename(title) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}

// Keep in sync with tests/helpers/frontmatter.js
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

// Only download common raster image formats; skip SVG icons, tracking pixels, etc.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'convert') return;

  // Readability needs a full document clone (it mutates the DOM)
  const docClone = document.cloneNode(true);
  const article = new Readability(docClone).parse();

  if (!article) {
    sendResponse({ error: '无法提取文章正文' });
    return true;
  }

  // Parse article.content HTML to collect and rewrite images
  const container = document.createElement('div');
  container.innerHTML = article.content;

  // Normalize img srcs to absolute URLs
  container.querySelectorAll('img').forEach(img => {
    img.setAttribute('src', img.src);
  });

  // Collect only raster image URLs (absolute, deduplicated)
  const imageUrls = [...new Set(
    Array.from(container.querySelectorAll('img'))
      .map(img => img.getAttribute('src'))
      .filter(src => src && IMAGE_EXT.test(src))
  )];

  const title = sanitizeFilename(article.title || document.title);
  const urlToLocal = buildUrlMap(imageUrls);

  // Custom Turndown rule: write local path directly during conversion
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndownPluginGfm.gfm(td);
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

  const markdown = td.turndown(container.innerHTML);

  // Build YAML frontmatter with metadata
  const frontmatter = buildFrontmatter({
    title: article.title,
    author: article.byline,
    source: location.href,
    date: new Date().toISOString().slice(0, 10),
  });

  sendResponse({
    title,
    markdown: frontmatter + '\n' + markdown,
    imageUrls,
    urlToLocal,
  });
  return true;
});

// --- Shared helpers (also used by tests/helpers/) ---

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
