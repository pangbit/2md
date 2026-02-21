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

const { gfm } = require('../lib/turndown-plugin-gfm');

describe('GFM plugin', () => {
  function makeTd() {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    gfm(td);
    return td;
  }

  test('converts simple table', () => {
    const td = makeTd();
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    const result = td.turndown(html);
    expect(result).toContain('| A | B |');
    expect(result).toContain('| 1 | 2 |');
  });

  test('converts fenced code block with language', () => {
    const td = makeTd();
    const html = '<pre><code class="language-python">print("hello")</code></pre>';
    const result = td.turndown(html);
    expect(result).toContain('```python');
    expect(result).toContain('print("hello")');
    expect(result).toContain('```');
  });

  test('converts fenced code block without language', () => {
    const td = makeTd();
    const html = '<pre><code>plain code</code></pre>';
    const result = td.turndown(html);
    expect(result).toContain('```');
    expect(result).toContain('plain code');
  });
});
