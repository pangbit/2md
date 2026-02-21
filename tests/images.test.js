const { collectImages, buildUrlMap, rewriteImagePaths } = require('./helpers/images');

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
  expect(result).toBe('![a](./My Page/photo.png)');
});

test('handles duplicate filenames by appending index', () => {
  const urls = ['https://a.com/img.png', 'https://b.com/img.png'];
  const urlToLocal = buildUrlMap(urls);
  expect(urlToLocal['https://a.com/img.png']).toBe('img.png');
  expect(urlToLocal['https://b.com/img.png']).toBe('img_1.png');
});
