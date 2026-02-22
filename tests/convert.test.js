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

const Readability = require('../lib/Readability');
const { TextEncoder, TextDecoder } = require('util');
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
const { JSDOM } = require('jsdom');

describe('Readability integration', () => {
  function parseArticle(html) {
    const dom = new JSDOM(html, { url: 'https://example.com/article' });
    return new Readability(dom.window.document).parse();
  }

  test('extracts article content and strips nav/sidebar', () => {
    const html = `<html><head><title>Test</title></head><body>
      <nav><a href="/">Home</a></nav>
      <article>
        <h1>Hello</h1>
        <p>World is a wonderful place with many interesting things to explore and discover every single day of our lives.</p>
        <p>The quick brown fox jumps over the lazy dog. This sentence is a well-known pangram that contains every letter of the alphabet at least once.</p>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
        <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
        <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
      </article>
      <aside>Sidebar junk</aside>
    </body></html>`;
    const article = parseArticle(html);
    expect(article).not.toBeNull();
    expect(article.content).toContain('Hello');
    expect(article.content).toContain('World');
    expect(article.content).not.toContain('Home');
    expect(article.content).not.toContain('Sidebar junk');
  });

  test('extracts title and byline metadata', () => {
    const html = `<html><head>
      <title>My Post - Blog</title>
      <meta name="author" content="Alice">
    </head><body>
      <article>
        <h1>My Post</h1>
        <p>Content here is substantial enough for Readability to detect this as a real article worth parsing and extracting.</p>
        <p>We need multiple paragraphs of meaningful text so that the content density is high enough for the algorithm.</p>
        <p>This third paragraph adds even more content to ensure Readability is confident this is an article.</p>
        <p>And a fourth paragraph for good measure, because Readability uses content length as a key heuristic.</p>
        <p>Finally, a fifth paragraph to make absolutely sure the content is detected as a proper article by the parser.</p>
      </article>
    </body></html>`;
    const article = parseArticle(html);
    expect(article).not.toBeNull();
    expect(article.title).toContain('My Post');
  });

  test('returns null for unparseable pages', () => {
    const html = '<html><head><title>X</title></head><body></body></html>';
    const article = parseArticle(html);
    expect(article).toBeNull();
  });
});
