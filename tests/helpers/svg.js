// Keep in sync with getSvgDimensions() in content.js
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

module.exports = { getSvgDimensions };
