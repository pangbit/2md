// content.js — injected into the active tab by popup.js
if (typeof window.__2md_loaded !== 'undefined') {
  // Already injected; skip re-declaration
} else {
window.__2md_loaded = true;

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

// Downloadable image formats (including SVG, which we convert to PNG).
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg)(\?|#|$)/i;
const SVG_EXT = /\.svg(\?|#|$)/i;
// 1x1 transparent GIF — used as iframe placeholder image for Readability
const PIXEL_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

function svgToPngDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || 300;
      const h = img.naturalHeight || 150;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('SVG img load failed'));
    img.src = url;
  });
}

// Convert serialized SVG string to PNG data URL using Blob URL (same-origin, no CORS).
function serializeSvgToPng(svgStr, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const w = width || img.naturalWidth || 300;
      const h = height || img.naturalHeight || 150;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('SVG load failed'));
    };
    img.src = blobUrl;
  });
}

// Extract dimensions from an SVG element's width/height/viewBox attributes.
// Returns { w, h } or null if the SVG is too small (icon) or has no dimensions.
function getSvgDimensions(svg) {
  let w = parseFloat(svg.getAttribute('width'));
  let h = parseFloat(svg.getAttribute('height'));
  const vb = svg.getAttribute('viewBox');
  if (vb && (!w || !h)) {
    const parts = vb.split(/[\s,]+/);
    w = w || parseFloat(parts[2]);
    h = h || parseFloat(parts[3]);
  }
  if (w && h && (w < 64 || h < 64)) return null; // icon or logo
  return (w && h) ? { w, h } : null;
}

// Convert an SVG element to a PNG data URL. Returns null on failure.
async function convertSvgElement(svg) {
  const dims = getSvgDimensions(svg);
  if (!dims) return null;
  const svgStr = new XMLSerializer().serializeToString(svg);
  return serializeSvgToPng(svgStr, dims.w, dims.h);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'convert') return;

  (async () => {
    // --- Capture SVG charts from cross-origin iframes (e.g. Cloudflare Radar) ---
    const iframeResults = {}; // iframe index -> { title, pngs }
    const chartIframes = Array.from(document.querySelectorAll('iframe'))
      .filter(f => f.src && f.offsetWidth > 100 && f.offsetHeight > 100);

    if (chartIframes.length > 0) {
      await new Promise(resolve => {
        // Only count iframes we can actually reach; cross-origin or detached
        // iframes throw on postMessage, so track sent vs expected separately.
        let sent = 0;
        chartIframes.forEach((iframe, i) => {
          try {
            iframe.contentWindow.postMessage({ type: '2md-capture-svg', id: i }, '*');
            sent++;
          } catch (e) { /* cross-origin or detached — skip */ }
        });

        if (sent === 0) { resolve(); return; }

        let pending = sent;
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve();
        }, 5000);

        function handler(event) {
          if (event.data?.type !== '2md-svg-result') return;
          // Ignore messages not originating from one of our captured iframes.
          if (!chartIframes.some(f => f.contentWindow === event.source)) return;
          iframeResults[event.data.id] = {
            title: event.data.title || '',
            html: event.data.html || '',
            pngs: event.data.pngs || [],
          };
          pending--;
          if (pending <= 0) {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve();
          }
        }

        window.addEventListener('message', handler);
      });
    }

    // --- Phase 1: Before Readability ---
    // Replace captured iframes with minimal placeholders so Readability preserves
    // their position. Full iframe content is injected AFTER Readability (Phase 2)
    // to prevent Readability from stripping titles, legends, and labels.
    const docClone = document.cloneNode(true);
    const inlineSvgMap = {}; // placeholder URL -> PNG data URL
    let svgIdx = 0;
    const cloneIframes = Array.from(docClone.querySelectorAll('iframe'));
    const origIframes = Array.from(document.querySelectorAll('iframe'));
    for (let i = 0; i < origIframes.length && i < cloneIframes.length; i++) {
      const chartIdx = chartIframes.indexOf(origIframes[i]);
      if (chartIdx < 0 || !iframeResults[chartIdx]) continue;
      const { title: iframeTitle, html } = iframeResults[chartIdx];
      if (!html) continue;

      // Minimal placeholder: <figure> with text + tiny image keeps Readability happy
      const fig = docClone.createElement('figure');
      const cap = docClone.createElement('figcaption');
      cap.textContent = iframeTitle || 'chart';
      fig.appendChild(cap);
      const img = docClone.createElement('img');
      img.setAttribute('src', PIXEL_GIF);
      img.setAttribute('data-2md-iframe', String(chartIdx));
      img.setAttribute('alt', iframeTitle || 'chart');
      fig.appendChild(img);
      cloneIframes[i].replaceWith(fig);
    }

    // Also convert any inline <svg> in the main document (non-iframe).
    // Run all conversions in parallel, then apply DOM mutations sequentially.
    const cloneSvgs = Array.from(docClone.querySelectorAll('svg'));
    const cloneSvgResults = await Promise.allSettled(cloneSvgs.map(svg => convertSvgElement(svg)));
    for (let i = 0; i < cloneSvgs.length; i++) {
      const r = cloneSvgResults[i];
      if (r.status !== 'fulfilled' || !r.value) continue;
      const placeholder = 'https://2md.invalid/chart-' + (++svgIdx) + '.png';
      inlineSvgMap[placeholder] = r.value;
      const img = docClone.createElement('img');
      img.setAttribute('src', placeholder);
      img.setAttribute('alt', cloneSvgs[i].getAttribute('aria-label') || cloneSvgs[i].getAttribute('title') || 'chart');
      cloneSvgs[i].replaceWith(img);
    }

    const article = new Readability(docClone).parse();

    if (!article) {
      sendResponse({ error: '无法提取文章正文' });
      return;
    }

    // Parse article.content into an inert document (DOMParser does NOT trigger
    // resource loading, so placeholder URLs won't cause network errors).
    const parsedDoc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><head><base href="' + location.href.replace(/"/g, '&quot;') +
      '"></head><body>' + article.content + '</body></html>', 'text/html');
    const container = parsedDoc.body;

    // --- Phase 2: After Readability ---
    // Replace iframe placeholders with full iframe content (bypasses Readability
    // so titles, legends, labels, and footer text are all preserved).
    container.querySelectorAll('[data-2md-iframe]').forEach(placeholder => {
      const chartIdx = parseInt(placeholder.getAttribute('data-2md-iframe'), 10);
      const result = iframeResults[chartIdx];
      if (!result) return;
      const { title: iframeTitle, html, pngs } = result;

      // Parse iframe HTML in the inert parsedDoc (no resource loading).
      // Use <blockquote> so Turndown renders it as a "> " quoted block,
      // visually distinguishing embedded iframe content from the main article.
      const wrapper = parsedDoc.createElement('blockquote');
      // SAFETY: wrapper lives in an inert DOMParser document — scripts never execute.
      // Do NOT move this node into the live document.
      wrapper.innerHTML = html;

      // Strip non-content elements that would pollute the markdown
      wrapper.querySelectorAll('script, style, link, noscript, iframe, svg').forEach(el => el.remove());
      // Remove hidden elements
      wrapper.querySelectorAll('[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]').forEach(el => el.remove());

      // Replace <span data-2md-svg="N"> markers with tracked placeholder URLs
      wrapper.querySelectorAll('[data-2md-svg]').forEach(marker => {
        const idx = parseInt(marker.getAttribute('data-2md-svg'), 10);
        if (pngs[idx]) {
          const placeholderUrl = 'https://2md.invalid/chart-' + (++svgIdx) + '.png';
          inlineSvgMap[placeholderUrl] = pngs[idx];
          const img = parsedDoc.createElement('img');
          img.setAttribute('src', placeholderUrl);
          img.setAttribute('alt', marker.getAttribute('data-2md-alt') || iframeTitle || 'chart');
          marker.replaceWith(img);
        }
      });

      // Remove non-chart images from iframe content (logos, icons, etc.)
      // Only keep our placeholder chart images; everything else is auxiliary.
      wrapper.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (!src.startsWith('https://2md.invalid/')) img.remove();
      });

      // Replace the placeholder (or its parent <figure>) with full content
      const parentFig = placeholder.closest('figure');
      if (parentFig) {
        parentFig.replaceWith(wrapper);
      } else {
        placeholder.replaceWith(wrapper);
      }
    });

    // Convert any remaining <svg> elements that survived Readability.
    // Run all conversions in parallel, then apply DOM mutations sequentially.
    const containerSvgs = Array.from(container.querySelectorAll('svg'));
    const containerSvgResults = await Promise.allSettled(containerSvgs.map(svg => convertSvgElement(svg)));
    for (let i = 0; i < containerSvgs.length; i++) {
      const r = containerSvgResults[i];
      if (r.status !== 'fulfilled' || !r.value) continue;
      const placeholder = 'https://2md.invalid/chart-' + (++svgIdx) + '.png';
      inlineSvgMap[placeholder] = r.value;
      const img = parsedDoc.createElement('img');
      img.setAttribute('src', placeholder);
      img.setAttribute('alt', containerSvgs[i].getAttribute('aria-label') || containerSvgs[i].getAttribute('title') || 'chart');
      containerSvgs[i].replaceWith(img);
    }

    // Strip whitespace-only text nodes inside table structure elements.
    // They break the GFM plugin which iterates childNodes to build the separator row.
    container.querySelectorAll('table, thead, tbody, tfoot, tr').forEach(el => {
      Array.from(el.childNodes).forEach(n => {
        if (n.nodeType === 3 && !n.textContent.trim()) n.remove();
      });
    });

    // Promote first-row <td> to <th> in headerless tables so GFM plugin can convert them
    container.querySelectorAll('table').forEach(table => {
      const firstRow = table.rows && table.rows[0];
      if (!firstRow) return;
      const hasTheadOrTh = table.querySelector('thead') ||
        firstRow.querySelector('th');
      if (hasTheadOrTh) return;
      Array.from(firstRow.cells).forEach(td => {
        const th = parsedDoc.createElement('th');
        while (td.firstChild) th.appendChild(td.firstChild);
        td.replaceWith(th);
      });
    });

    // Unwrap block elements (<p>, <div>) and <br> inside table cells.
    // Markdown tables are single-line per cell; block elements break formatting.
    container.querySelectorAll('td, th').forEach(cell => {
      cell.querySelectorAll('p, div').forEach(block => {
        block.replaceWith(...block.childNodes);
      });
      cell.querySelectorAll('br').forEach(br => br.replaceWith(' '));
    });

    // Normalize img srcs to absolute URLs.
    // img.src resolves against the <base href> injected at parsedDoc creation time.
    container.querySelectorAll('img').forEach(img => {
      img.setAttribute('src', img.src);
    });

    // Collect image URLs (absolute, deduplicated)
    const imageUrls = [...new Set(
      Array.from(container.querySelectorAll('img'))
        .map(img => img.getAttribute('src'))
        .filter(src => src && IMAGE_EXT.test(src))
    )];

    // Convert SVG images to PNG data URLs (all in parallel)
    const svgToPng = {};
    const svgImageUrls = imageUrls.filter(url => SVG_EXT.test(url));
    const svgImageResults = await Promise.allSettled(svgImageUrls.map(url => svgToPngDataUrl(url)));
    svgImageUrls.forEach((url, i) => {
      if (svgImageResults[i].status === 'fulfilled') svgToPng[url] = svgImageResults[i].value;
    });

    const title = sanitizeFilename(article.title || document.title);
    const urlToLocal = buildUrlMap(imageUrls);

    // Rename .svg to .png in local filenames for converted SVGs
    for (const url of Object.keys(svgToPng)) {
      if (urlToLocal[url]) {
        urlToLocal[url] = urlToLocal[url].replace(/\.svg$/i, '.png');
      }
    }

    // Custom Turndown rule: write local path directly during conversion
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    turndownPluginGfm.gfm(td);
    td.addRule('localImages', {
      filter: 'img',
      replacement: (content, node) => {
        const src = node.getAttribute('src') || '';
        const alt = (node.getAttribute('alt') || '').trim();
        const localName = urlToLocal[src];
        if (localName) return '![' + alt + '](<./' + title + '/' + localName + '>)';
        if (IMAGE_EXT.test(src)) return '![' + alt + '](' + src + ')';
        return ''; // skip icons / tracking pixels
      }
    });

    const markdown = td.turndown(container);

    // Build YAML frontmatter with metadata
    const frontmatter = buildFrontmatter({
      title: article.title,
      author: article.byline,
      source: location.href,
      date: new Date().toISOString().slice(0, 10),
    });

    // Replace SVG URLs and inline SVG placeholders with PNG data URLs for download
    const allSvgMappings = Object.assign({}, svgToPng, inlineSvgMap);
    const downloadUrls = imageUrls.map(url => allSvgMappings[url] || url);

    sendResponse({
      title,
      markdown: frontmatter + '\n' + markdown,
      imageUrls: downloadUrls,
      urlToLocal: remapKeys(urlToLocal, allSvgMappings),
    });
  })();

  return true;
});

// --- URL mapping helpers ---

function buildUrlMap(urls) {
  const seen = {};
  const urlToLocal = {};
  for (const url of urls) {
    const base = url.split('/').pop().split('?')[0] || 'image';
    let name = base;
    if (seen[base] !== undefined) {
      seen[base]++;
      const dotIdx = base.lastIndexOf('.');
      name = dotIdx >= 0
        ? base.slice(0, dotIdx) + '_' + seen[base] + base.slice(dotIdx)
        : base + '_' + seen[base];
    } else {
      seen[base] = 0;
    }
    urlToLocal[url] = name;
  }
  return urlToLocal;
}

// Remap urlToLocal keys: replace original SVG URLs with their PNG data URLs
// so background.js can look up local filenames by the download URL.
function remapKeys(urlToLocal, svgToPng) {
  const result = {};
  for (const [url, localName] of Object.entries(urlToLocal)) {
    const newKey = svgToPng[url] || url;
    result[newKey] = localName;
  }
  return result;
}

} // end if (__2md_loaded)
