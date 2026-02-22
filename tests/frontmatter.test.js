const { buildFrontmatter } = require('./helpers/frontmatter');

test('generates frontmatter with all fields', () => {
  const result = buildFrontmatter({
    title: 'My Article',
    author: 'Jane Doe',
    source: 'https://example.com/post',
    date: '2026-02-22',
  });
  expect(result).toBe(
    '---\ntitle: "My Article"\nauthor: "Jane Doe"\nsource: "https://example.com/post"\ndate: "2026-02-22"\n---\n'
  );
});

test('omits fields with empty values', () => {
  const result = buildFrontmatter({
    title: 'My Article',
    author: null,
    source: 'https://example.com/post',
    date: '',
  });
  expect(result).toBe(
    '---\ntitle: "My Article"\nsource: "https://example.com/post"\n---\n'
  );
});

test('returns empty string when all fields are empty', () => {
  const result = buildFrontmatter({
    title: null,
    author: '',
    source: undefined,
    date: '',
  });
  expect(result).toBe('');
});

test('escapes double quotes in values', () => {
  const result = buildFrontmatter({
    title: 'He said "hello"',
    author: 'Jane',
    source: '',
    date: '',
  });
  expect(result).toBe(
    '---\ntitle: "He said \\"hello\\""\nauthor: "Jane"\n---\n'
  );
});
