const { sanitizeFilename } = require('./helpers/sanitize');

test('removes characters invalid in filenames', () => {
  expect(sanitizeFilename('Hello: World/Test?')).toBe('Hello World Test');
});

test('trims leading and trailing whitespace', () => {
  expect(sanitizeFilename('  Hello World  ')).toBe('Hello World');
});

test('collapses multiple spaces', () => {
  expect(sanitizeFilename('Hello   World')).toBe('Hello World');
});

test('handles empty string', () => {
  expect(sanitizeFilename('')).toBe('untitled');
});

test('handles string with only invalid chars', () => {
  expect(sanitizeFilename('???:::')).toBe('untitled');
});
