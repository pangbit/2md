// iframe-capture.js — injected into all frames to capture SVG charts.
// Listens for a capture request from the parent frame's content script,
// inlines computed styles for visual fidelity, converts SVGs to PNG,
// and returns the full iframe body HTML with SVGs replaced by <img> placeholders.
if (window !== window.top) {

  // SVG presentation properties to inline from computed styles.
  const SVG_PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
    'opacity', 'display', 'visibility',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'color',
  ];

  // Clone the SVG with computed styles inlined so it renders correctly in isolation.
  function inlineStyles(svg) {
    const clone = svg.cloneNode(true);
    const origEls = [svg, ...svg.querySelectorAll('*')];
    const cloneEls = [clone, ...clone.querySelectorAll('*')];
    for (let i = 0; i < origEls.length; i++) {
      const cs = getComputedStyle(origEls[i]);
      for (const prop of SVG_PROPS) {
        const val = cs.getPropertyValue(prop);
        if (val) cloneEls[i].style.setProperty(prop, val);
      }
    }
    return new XMLSerializer().serializeToString(clone);
  }

  function svgToPng(svgStr, w, h) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/png')); }
        catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('SVG img load failed')); };
      img.src = blobUrl;
    });
  }

  window.addEventListener('message', async (event) => {
    if (event.data?.type !== '2md-capture-svg') return;

    // Match original SVGs (for getComputedStyle) with cloned SVGs (for replacement)
    const origSvgs = Array.from(document.querySelectorAll('svg'));
    const bodyClone = document.body.cloneNode(true);
    const cloneSvgs = Array.from(bodyClone.querySelectorAll('svg'));
    const pngs = []; // array of PNG data URLs, indexed to match __2md_svg_N__ placeholders

    for (let i = 0; i < origSvgs.length && i < cloneSvgs.length; i++) {
      const svg = origSvgs[i];
      let w = parseFloat(svg.getAttribute('width'));
      let h = parseFloat(svg.getAttribute('height'));
      const vb = svg.getAttribute('viewBox');
      if (vb && (!w || !h)) {
        const parts = vb.split(/[\s,]+/);
        w = w || parseFloat(parts[2]);
        h = h || parseFloat(parts[3]);
      }
      if (!w || !h || w < 64 || h < 64) continue;

      try {
        const svgStr = inlineStyles(svg);
        const dataUrl = await svgToPng(svgStr, w, h);
        const idx = pngs.length;
        pngs.push(dataUrl);
        // Replace the cloned SVG with a <span> marker (NOT <img>, which would
        // trigger a resource load even when disconnected from the live DOM).
        const marker = document.createElement('span');
        marker.setAttribute('data-2md-svg', String(idx));
        marker.setAttribute('data-2md-alt', svg.getAttribute('aria-label') || svg.getAttribute('title') || 'chart');
        cloneSvgs[i].replaceWith(marker);
      } catch (e) { /* skip unconvertible SVGs */ }
    }

    // Normalize img src to absolute URLs so they resolve correctly
    // when inserted into the parent document (different origin).
    bodyClone.querySelectorAll('img').forEach(img => {
      if (img.getAttribute('src')) img.setAttribute('src', img.src);
    });
    bodyClone.querySelectorAll('a').forEach(a => {
      if (a.getAttribute('href')) a.setAttribute('href', a.href);
    });

    // Extract title for alt text fallback
    const titleEl = document.querySelector('h1, h2, h3, [class*="title"], [class*="Title"]');
    const title = (titleEl ? titleEl.textContent : document.title || '').trim();

    window.parent.postMessage({
      type: '2md-svg-result',
      id: event.data.id,
      title,
      html: bodyClone.innerHTML,
      pngs,
    }, event.origin || '*');
  });
}
