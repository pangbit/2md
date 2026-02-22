# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复代码审查报告中 Important 级别的 4 个问题，整理 Minor 级别的代码质量问题，并为 `getSvgDimensions` 补充测试。

**Architecture:** 所有修改集中在 `content.js`、`iframe-capture.js` 和 `tests/` 目录。不引入新依赖，不改变运行时行为，只修正代码规范、错误消息一致性、注释和死代码。

**Tech Stack:** Chrome MV3 Content Script（vanilla JS）、Jest（测试）、jsdom（DOM 测试环境）

---

## Task 1: Fix `parseInt` missing radix（content.js:221, 239）

**Files:**
- Modify: `content.js:221,239`

**Background:** `parseInt` 缺少第二参数（radix）违反 ESLint `radix` 规则。统一加 `, 10`。

**Step 1: 修改两处 parseInt 调用**

`content.js` 第 221 行：
```js
// 改前
const chartIdx = parseInt(placeholder.getAttribute('data-2md-iframe'));
// 改后
const chartIdx = parseInt(placeholder.getAttribute('data-2md-iframe'), 10);
```

`content.js` 第 239 行：
```js
// 改前
const idx = parseInt(marker.getAttribute('data-2md-svg'));
// 改后
const idx = parseInt(marker.getAttribute('data-2md-svg'), 10);
```

**Step 2: 运行测试确认无回归**

```bash
cd tests && npx jest --no-coverage
```
Expected: 34 passed

**Step 3: Commit**

```bash
git add content.js
git commit -m "fix: add radix 10 to all parseInt calls"
```

---

## Task 2: Fix `img.onerror` 传入 ErrorEvent 而非 Error（content.js:50）

**Files:**
- Modify: `content.js:50`

**Background:** `svgToPngDataUrl` 中 `img.onerror = reject` 把浏览器 ErrorEvent 对象直接传给 Promise reject，错误消息不可读。`serializeSvgToPng`（content.js:77-79）已正确包装为 `new Error(...)`，两者保持一致。

**Step 1: 修改 onerror 处理**

`content.js` 第 50 行：
```js
// 改前
img.onerror = reject;

// 改后
img.onerror = () => reject(new Error('SVG img load failed'));
```

**Step 2: 运行测试确认无回归**

```bash
cd tests && npx jest --no-coverage
```
Expected: 34 passed

**Step 3: Commit**

```bash
git add content.js
git commit -m "fix: wrap img.onerror with Error in svgToPngDataUrl for consistent rejection"
```

---

## Task 3: 安全注释 + Minor 代码风格修复

**Files:**
- Modify: `content.js:29,165,229-230,312-314`
- Modify: `iframe-capture.js:6`

**Step 1: PIXEL_GIF 提升到文件顶部**

在 `content.js` 第 29 行（SVG_EXT 常量后）添加：
```js
// 1x1 transparent GIF — used as iframe placeholder image for Readability
const PIXEL_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
```

然后删除 `content.js` 第 165 行的旧定义（`const PIXEL_GIF = ...`）。

**Step 2: 添加安全注释**

在 `content.js` 第 229-230 行（wrapper 创建处），在 `wrapper.` 赋值语句前加注释：
```js
      const wrapper = parsedDoc.createElement('blockquote');
      // SAFETY: wrapper lives in an inert DOMParser document — scripts never execute.
      // Do NOT move this node into the live document.
      wrapper.innerHTML = html;
```

**Step 3: 添加 img.src base 依赖注释**

`content.js` 第 312 行注释更新：
```js
    // Normalize img srcs to absolute URLs.
    // img.src resolves against the <base href> injected at parsedDoc creation time.
    container.querySelectorAll('img').forEach(img => {
      img.setAttribute('src', img.src);
    });
```

**Step 4: 修复 iframe-capture.js 缩进**

`iframe-capture.js` 第 6 行，将缩进 0 改为 2 格：
```js
if (window !== window.top && !window.__2md_iframe_loaded) {
  window.__2md_iframe_loaded = true;
```

**Step 5: 运行测试确认无回归**

```bash
cd tests && npx jest --no-coverage
```
Expected: 34 passed

**Step 6: Commit**

```bash
git add content.js iframe-capture.js
git commit -m "refactor: hoist PIXEL_GIF, add safety and base-dependency comments, fix indent"
```

---

## Task 4: 移除 content.js 中的死代码

**Files:**
- Modify: `content.js:382-421`

**Background:** `collectImages` 和 `rewriteImagePaths` 在 content.js 中声明但从未被调用。测试通过 `tests/helpers/images.js` 中的独立实现验证，移除 content.js 中的副本消除双维护风险。

**Step 1: 确认未被调用**

```bash
grep -n "collectImages\|rewriteImagePaths" content.js
```
Expected: 只出现在函数定义行，无其他调用。

**Step 2: 删除死代码**

在 `content.js` 中删除以下内容（382-421 行）：
- `// --- Shared helpers (also used by tests/helpers/) ---` 注释
- 完整的 `collectImages` 函数定义
- 完整的 `rewriteImagePaths` 函数定义

将注释替换为：
```js
// --- URL mapping helpers ---
```
（`buildUrlMap` 和 `remapKeys` 是真正在用的 helper，保留它们和这个注释）

**Step 3: 运行测试确认无回归**

```bash
cd tests && npx jest --no-coverage
```
Expected: 34 passed（tests/helpers/images.js 的实现不受影响）

**Step 4: Commit**

```bash
git add content.js
git commit -m "refactor: remove dead code collectImages and rewriteImagePaths from content.js"
```

---

## Task 5: 提取 getSvgDimensions helper 并添加测试

**Files:**
- Create: `tests/helpers/svg.js`
- Create: `tests/svg.test.js`

**Background:** `getSvgDimensions` 有复杂的 viewBox 解析和尺寸过滤逻辑，目前无测试。该函数只用 `getAttribute`，不依赖浏览器渲染，可在 jsdom 中测试。在 `tests/helpers/svg.js` 中维护与 content.js 完全相同的副本并测试。

**Step 1: 创建 tests/helpers/svg.js**

```js
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
```

**Step 2: 运行以确认 helper 可以被 require**

```bash
node -e "const { getSvgDimensions } = require('./tests/helpers/svg'); console.log('ok');"
```
Expected: `ok`

**Step 3: 创建 tests/svg.test.js**

```js
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
```

**Step 4: 运行新测试，确认全部通过**

```bash
cd tests && npx jest --no-coverage svg.test.js
```
Expected: 10 passed

**Step 5: 运行所有测试确认无回归**

```bash
cd tests && npx jest --no-coverage
```
Expected: 44 passed

**Step 6: Commit**

```bash
git add tests/helpers/svg.js tests/svg.test.js
git commit -m "test: extract getSvgDimensions helper and add 10 coverage tests"
```
