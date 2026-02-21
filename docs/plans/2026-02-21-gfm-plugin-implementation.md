# GFM Plugin Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `turndown-plugin-gfm` to enable proper table, fenced code block, and strikethrough conversion in the 2md Chrome extension.

**Architecture:** Download the GFM plugin JS file into `lib/`, inject it between `turndown.js` and `content.js` in popup.js, then activate it with `gfm(td)` inside content.js alongside `codeBlockStyle: 'fenced'`.

**Tech Stack:** turndown-plugin-gfm v1.0.4, existing Turndown.js v7.2.0, Jest + jsdom for unit tests.

---

## Context

- Project root: `/Users/xubochen/Workspace/2md`
- Tests live in `tests/` with Jest installed (`cd tests && npx jest`)
- `lib/turndown.js` already has a CJS export shim at the bottom
- `tests/convert.test.js` already tests Turndown with `@jest-environment jsdom`

---

### Task 1: Download turndown-plugin-gfm.js

**Files:**
- Create: `lib/turndown-plugin-gfm.js`

**Step 1: Download the plugin**

```
curl -L https://unpkg.com/turndown-plugin-gfm@1.0.4/dist/turndown-plugin-gfm.js -o /Users/xubochen/Workspace/2md/lib/turndown-plugin-gfm.js
```

**Step 2: Verify it contains the gfm export**

```
grep -c "gfm" /Users/xubochen/Workspace/2md/lib/turndown-plugin-gfm.js
```
Expected: number > 0

**Step 3: Check if it has a CJS export (needed for Jest tests)**

```
grep "module.exports" /Users/xubochen/Workspace/2md/lib/turndown-plugin-gfm.js
```
If the output is empty, append a CJS shim the same way turndown.js was fixed:
```
echo 'if (typeof module !== "undefined") { module.exports = { gfm: gfm, strikethrough: strikethrough, tables: tables, taskListItems: taskListItems }; }' >> /Users/xubochen/Workspace/2md/lib/turndown-plugin-gfm.js
```
(If grep already finds `module.exports`, skip the echo.)

**Step 4: Commit**

```
git add lib/turndown-plugin-gfm.js && git commit -m "chore: add turndown-plugin-gfm v1.0.4"
```

---

### Task 2: Add GFM tests to convert.test.js

**Files:**
- Modify: `tests/convert.test.js`

**Step 1: Read the existing file**

```
cat /Users/xubochen/Workspace/2md/tests/convert.test.js
```

**Step 2: Append GFM tests at the bottom of the file**

Add these tests after the existing 4 tests:

```js
/** @jest-environment jsdom */
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
```

**Step 3: Run only the new tests to confirm they FAIL (gfm not yet activated in content.js)**

```
cd /Users/xubochen/Workspace/2md/tests && npx jest convert.test.js --verbose 2>&1 | tail -20
```
Expected: the 3 new GFM tests FAIL (gfm is imported but convert.test.js uses `new TurndownService()` without `gfm(td)` in the existing tests — the new tests use `makeTd()` which calls `gfm(td)`, so they should PASS if the plugin loaded correctly).

If they pass at this point, that's fine — the plugin loaded correctly. Move on.

**Step 4: Run full test suite to confirm no regressions**

```
cd /Users/xubochen/Workspace/2md/tests && npx jest --verbose
```
Expected: all tests PASS (original 4 convert tests + 3 new GFM tests + 5 sanitize + 4 images = 16 total).

**Step 5: Commit**

```
cd /Users/xubochen/Workspace/2md && git add tests/convert.test.js && git commit -m "test: add GFM table and code block conversion tests"
```

---

### Task 3: Activate GFM plugin in content.js

**Files:**
- Modify: `content.js` (lines around the TurndownService instantiation)

**Step 1: Read the current content.js**

```
cat /Users/xubochen/Workspace/2md/content.js
```

**Step 2: Find the TurndownService instantiation**

It currently looks like:
```js
const td = new TurndownService({ headingStyle: 'atx' });
td.addRule('localImages', { ... });
```

**Step 3: Replace it with GFM-enabled version**

Change:
```js
const td = new TurndownService({ headingStyle: 'atx' });
```

To:
```js
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
gfm(td);
```

The `gfm` function is available globally because `turndown-plugin-gfm.js` is injected before `content.js` by popup.js (see Task 4). In the browser context, the plugin sets `gfm` as a global — same as how `TurndownService` is a global from `turndown.js`.

**Step 4: Run full test suite to confirm still passing**

```
cd /Users/xubochen/Workspace/2md/tests && npx jest --verbose
```
Expected: 16 tests PASS.

**Step 5: Commit**

```
cd /Users/xubochen/Workspace/2md && git add content.js && git commit -m "feat: activate GFM plugin for table and code block support"
```

---

### Task 4: Inject turndown-plugin-gfm.js in popup.js

**Files:**
- Modify: `popup/popup.js`

**Step 1: Read the current popup.js**

```
cat /Users/xubochen/Workspace/2md/popup/popup.js
```

**Step 2: Find the executeScript call**

It currently looks like:
```js
await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['lib/turndown.js', 'content.js'],
});
```

**Step 3: Add the GFM plugin between turndown.js and content.js**

Change to:
```js
await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'content.js'],
});
```

Order matters: turndown.js must load first (defines TurndownService), then gfm plugin (defines gfm function), then content.js (calls both).

**Step 4: Commit**

```
cd /Users/xubochen/Workspace/2md && git add popup/popup.js && git commit -m "feat: inject turndown-plugin-gfm before content script"
```

---

### Task 5: Manual verification in Chrome

**Step 1: Reload the extension**

1. Open `chrome://extensions`
2. Find **2md** → click the refresh icon ⟳

**Step 2: Test table conversion**

Navigate to a page with HTML tables, e.g.:
- `https://developer.mozilla.org/en-US/docs/Web/HTML/Element/table`
- Or any Wikipedia article with a table

Click the 2md icon → "保存为 Markdown" → open the downloaded `.md` file.

Verify: tables appear as `| col | col |` with `|---|---|` separators.

**Step 3: Test code block conversion**

Navigate to a page with `<pre><code>` blocks, e.g.:
- Any GitHub README page
- `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array`

Verify: code blocks appear as fenced ``` blocks, not inline code or raw text.

**Step 4: Commit any fixes**

```
cd /Users/xubochen/Workspace/2md && git add -A && git commit -m "fix: manual testing adjustments"
```

---

## Summary of Commits

| Task | Commit |
|------|--------|
| 1 | `chore: add turndown-plugin-gfm v1.0.4` |
| 2 | `test: add GFM table and code block conversion tests` |
| 3 | `feat: activate GFM plugin for table and code block support` |
| 4 | `feat: inject turndown-plugin-gfm before content script` |
| 5 | `fix: manual testing adjustments` (if needed) |
