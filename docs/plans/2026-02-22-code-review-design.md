# 2md 扩展代码审查报告

> **目标：** 全面审查代码架构合理性、潜在 Bug、安全性、代码质量与测试覆盖，产出分级问题清单并指导后续修复计划。

**范围文件：** `content.js`（434 行）、`iframe-capture.js`（120 行）、`background.js`（33 行）、`popup/popup.js`（68 行）

**审查时间：** 2026-02-22

---

## 一、整体架构

### 合理设计

- MV3 三层职责分离清晰：popup 触发 → content script 转换 → service worker 下载
- 两阶段 Readability 策略（Phase 1 placeholder → Phase 2 注入）正确解决了 Readability 裁剪 iframe 内容的问题
- `Promise.allSettled` 并行 SVG 转换 + 串行 DOM 变更的模式正确

### ⚠ Important — 死代码形成脆弱的双维护模式

`content.js` 382-421 行声明了 `collectImages` 和 `rewriteImagePaths`，但主流程**从未调用它们**（图片路径改写通过 Turndown 的 `localImages` rule 完成）。它们的存在仅为与 `tests/helpers/images.js` 保持同步，是一个脆弱的双维护模式。

**风险：** 两处代码独立演化，测试可能验证的是已死亡的实现。

---

## 二、潜在 Bug

### ⚠ Important — `parseInt` 缺少 radix（content.js:221, 239）

属性值为数字字符串不会触发八进制解析，但违反 ESLint `radix` 规则，属于编码规范问题。应统一加上 `, 10` 参数。

### ⚠ Important — `img.onerror = reject` 传入 ErrorEvent 而非 Error（content.js:50）

`svgToPngDataUrl` 中直接 `img.onerror = reject`，reject 收到的是浏览器 ErrorEvent 对象而非 Error 实例，错误消息不可读。`serializeSvgToPng` 中已正确包装为 `new Error(...)`，两函数行为不一致。

### Minor — `PIXEL_GIF` 常量定义位置（content.js:165）

应提升到文件顶部常量区，与 `IMAGE_EXT`、`SVG_EXT` 并列，避免在函数中间定义常量。

---

## 三、安全性

### 已正确处理

- `event.source` 验证防止恶意 iframe 伪造 `2md-svg-result` 响应（content.js:140）
- `iframe-capture.js` 使用 `event.origin` 缩小 postMessage 目标范围
- iframe 返回的 HTML 赋值给 inert DOMParser 文档中的节点，不会执行脚本

### ⚠ Important — 安全假设缺少注释（content.js:230）

`wrapper` 的 html 属性赋值处，安全性依赖"DOMParser 文档是 inert 的"这一隐性前提。若未来代码误将 `wrapper` adoptNode 到 live 文档，将引入 XSS 风险。需加注释明确安全边界，说明此 wrapper 不能插入 live DOM。

---

## 四、代码质量

| 文件 | 行号 | 问题 | 级别 |
|---|---|---|---|
| `content.js` | 325 | `const svgToPng = {}` 与 `iframe-capture.js` 中的函数名 `svgToPng` 重名，跨文件阅读混淆 | Minor |
| `content.js` | 31-83 | `svgToPngDataUrl` 与 `serializeSvgToPng` 逻辑高度相似，可提取公共 canvas 渲染函数 | Minor |
| `content.js` | 313 | `img.setAttribute('src', img.src)` 依赖 `<base>` 标签解析绝对 URL，此依赖无注释 | Minor |
| `iframe-capture.js` | 6 | `window.__2md_iframe_loaded = true` 缩进为 0，与 if 块其他代码不一致 | Minor |

---

## 五、测试覆盖

### 已覆盖

- `sanitizeFilename`、`buildFrontmatter`（含边界）
- `buildUrlMap`（含 3+ 重名、无扩展名、query string）
- `collectImages`（含角括号 URL、空 alt、无图片）
- `rewriteImagePaths`（含 URL 不在映射、多图片、角括号源 URL）
- `remapKeys`
- GFM 表格、代码块转换
- Readability 集成（文章提取、元数据、空页面）

### 测试缺口

| 缺口 | 说明 |
|---|---|
| `getSvgDimensions` | viewBox 解析、尺寸过滤逻辑复杂，可提取为独立 helper 并测试 |
| `svgToPngDataUrl` / `serializeSvgToPng` | 依赖浏览器 Canvas API，需 browser test 环境（Playwright/Puppeteer） |
| 端到端集成测试 | 完整 HTML → Markdown + frontmatter + 图片路径改写 |

---

## 修复优先级汇总

| 级别 | 数量 | 典型项 |
|---|---|---|
| **Important** | 4 | 死代码双维护、parseInt radix、onerror 不一致、安全注释缺失 |
| **Minor** | 5 | 常量位置、变量命名冲突、函数重复、缩进、img.src 依赖注释 |
| **缺口** | 3 | getSvgDimensions 测试、Canvas 测试、端到端测试 |
