const { collectImages, buildUrlMap, rewriteImagePaths, remapKeys } = require('./helpers/images');

test('collects absolute image URLs from markdown', () => {
  const md = '![a](https://example.com/a.png)\n![b](https://example.com/b.jpg)';
  expect(collectImages(md)).toEqual([
    'https://example.com/a.png',
    'https://example.com/b.jpg',
  ]);
});

test('ignores data: URIs', () => {
  const md = '![a](data:image/png;base64,abc)\n![b](https://example.com/b.jpg)';
  expect(collectImages(md)).toEqual(['https://example.com/b.jpg']);
});

test('rewrites image URLs to local paths', () => {
  const md = '![a](https://example.com/path/photo.png)';
  const urlToLocal = { 'https://example.com/path/photo.png': 'photo.png' };
  const result = rewriteImagePaths(md, 'My Page', urlToLocal);
  expect(result).toBe('![a](<./My Page/photo.png>)');
});

test('handles duplicate filenames by appending index', () => {
  const urls = ['https://a.com/img.png', 'https://b.com/img.png'];
  const urlToLocal = buildUrlMap(urls);
  expect(urlToLocal['https://a.com/img.png']).toBe('img.png');
  expect(urlToLocal['https://b.com/img.png']).toBe('img_1.png');
});

test('handles three or more duplicate filenames correctly', () => {
  const urls = [
    'https://a.com/img.png',
    'https://b.com/img.png',
    'https://c.com/img.png',
  ];
  const urlToLocal = buildUrlMap(urls);
  expect(urlToLocal['https://a.com/img.png']).toBe('img.png');
  expect(urlToLocal['https://b.com/img.png']).toBe('img_1.png');
  expect(urlToLocal['https://c.com/img.png']).toBe('img_2.png');
});

test('handles filenames without extensions', () => {
  const urls = ['https://a.com/image', 'https://b.com/image'];
  const urlToLocal = buildUrlMap(urls);
  expect(urlToLocal['https://a.com/image']).toBe('image');
  expect(urlToLocal['https://b.com/image']).toBe('image_1');
});

test('strips query strings from filenames', () => {
  const urls = ['https://cdn.com/photo.jpg?w=800&h=600'];
  const urlToLocal = buildUrlMap(urls);
  expect(urlToLocal['https://cdn.com/photo.jpg?w=800&h=600']).toBe('photo.jpg');
});

test('remapKeys replaces original URL keys with data URL keys', () => {
  const urlToLocal = {
    'https://2md.invalid/chart-1.png': 'chart-1.png',
    'https://example.com/photo.jpg': 'photo.jpg',
  };
  const svgToPng = {
    'https://2md.invalid/chart-1.png': 'data:image/png;base64,ABC',
  };
  const result = remapKeys(urlToLocal, svgToPng);
  expect(result['data:image/png;base64,ABC']).toBe('chart-1.png');
  expect(result['https://example.com/photo.jpg']).toBe('photo.jpg');
  expect(result['https://2md.invalid/chart-1.png']).toBeUndefined();
});

test('remapKeys keeps original key when no mapping exists', () => {
  const urlToLocal = { 'https://example.com/a.png': 'a.png' };
  const result = remapKeys(urlToLocal, {});
  expect(result['https://example.com/a.png']).toBe('a.png');
});
