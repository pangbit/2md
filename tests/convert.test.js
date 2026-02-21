/**
 * @jest-environment jsdom
 */
const TurndownService = require('../lib/turndown');

test('converts heading', () => {
  const td = new TurndownService({ headingStyle: 'atx' });
  expect(td.turndown('<h1>Hello</h1>')).toBe('# Hello');
});

test('converts bold', () => {
  const td = new TurndownService();
  expect(td.turndown('<strong>Bold</strong>')).toBe('**Bold**');
});

test('converts link', () => {
  const td = new TurndownService();
  expect(td.turndown('<a href="https://example.com">Link</a>')).toBe('[Link](https://example.com)');
});

test('converts image', () => {
  const td = new TurndownService();
  expect(td.turndown('<img src="https://example.com/img.png" alt="photo">')).toBe('![photo](https://example.com/img.png)');
});
