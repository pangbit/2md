/**
 * @jest-environment jsdom
 */
const { getSvgDimensions } = require('./helpers/svg');

function makeSvg(attrs) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  return svg;
}

test('returns dimensions from width/height attributes', () => {
  const svg = makeSvg({ width: '800', height: '600' });
  expect(getSvgDimensions(svg)).toEqual({ w: 800, h: 600 });
});

test('falls back to viewBox when both width and height are missing', () => {
  const svg = makeSvg({ viewBox: '0 0 400 300' });
  expect(getSvgDimensions(svg)).toEqual({ w: 400, h: 300 });
});

test('uses explicit width and viewBox height when only height is missing', () => {
  const svg = makeSvg({ width: '800', viewBox: '0 0 400 300' });
  expect(getSvgDimensions(svg)).toEqual({ w: 800, h: 300 });
});

test('uses explicit height and viewBox width when only width is missing', () => {
  const svg = makeSvg({ height: '600', viewBox: '0 0 400 300' });
  expect(getSvgDimensions(svg)).toEqual({ w: 400, h: 600 });
});

test('returns null for icon-sized SVG (both dimensions < 64)', () => {
  const svg = makeSvg({ width: '32', height: '32' });
  expect(getSvgDimensions(svg)).toBeNull();
});

test('returns null when width < 64 even if height is large', () => {
  const svg = makeSvg({ width: '16', height: '300' });
  expect(getSvgDimensions(svg)).toBeNull();
});

test('returns null when height < 64 even if width is large', () => {
  const svg = makeSvg({ width: '300', height: '16' });
  expect(getSvgDimensions(svg)).toBeNull();
});

test('accepts SVG with exactly 64x64 (boundary: not filtered)', () => {
  const svg = makeSvg({ width: '64', height: '64' });
  expect(getSvgDimensions(svg)).toEqual({ w: 64, h: 64 });
});

test('returns null when no dimensions available', () => {
  const svg = makeSvg({});
  expect(getSvgDimensions(svg)).toBeNull();
});

test('handles comma-separated viewBox values', () => {
  const svg = makeSvg({ viewBox: '0,0,500,400' });
  expect(getSvgDimensions(svg)).toEqual({ w: 500, h: 400 });
});
