# 2md 项目健康度全景审查

> **目标：** 从 UX/功能完整性、技术健壮性、项目结构与文档、可维护性四个维度评估项目当前状态，产出分级改进建议。

**审查时间：** 2026-02-22
**项目版本：** manifest.json v1.0.0（实际迭代版本远高于此）
**测试覆盖：** 5 个测试套件，44 个测试，全部通过

---

## 一、用户体验与功能完整性

### ✅ 优点

- 弹窗极简，一键触发，状态反馈清晰（Converting → Downloading → Saved / Failed）
- 错误后按钮重新激活，不会卡死 UI
- 跨域 iframe SVG 图表自动捕获，用户无需额外操作

### ⚠ 问题

| 问题 | 严重度 |
|---|---|
| **"Saved" 过早显示**：`background.js` 立即 `sendResponse`，但 `chrome.downloads.download()` 是异步的，文件实际仍在下载中 | Important |
| **无下载进度反馈**：图片多的页面，"Downloading images..." 持续时间不定，用户无法判断是否卡住 | Minor |
| **受限页面提示不明确**：`chrome://`、`file://` 等受限页面报 "Unsupported page type"，实际原因是脚本注入失败，提示应更具体 | Minor |
| **Readability 失败无降级**：`article === null` 时直接返回错误，未尝试将原始页面全文转换作为降级方案 | Minor |
| **无键盘快捷键**：`manifest.json` 未配置 `commands`，无法通过快捷键触发转换 | Minor |

---

## 二、技术实现健壮性

### ✅ 已正确处理

- `event.source` 验证（防止恶意 iframe 伪造 postMessage 响应）
- `canvas.getContext('2d')` null 检查
- `parseInt` 统一加 radix 10
- `img.onerror` 包装为 `new Error(...)` 而非直接 reject ErrorEvent
- SVG 转换全部并行化（`Promise.allSettled`）
- MV3 service worker：立即 `sendResponse` 避免 worker 被终止后响应丢失

### ⚠ 问题

| 问题 | 严重度 |
|---|---|
| **data URL 大小限制**：`background.js` 使用 `encodeURIComponent(markdown)` 生成 data URL 下载 `.md` 文件。长文章（大量代码块/表格）可能超过 Chrome data URL 下载限制，导致静默失败或下载空文件 | Important |
| **`sendMessage` 无超时**：`popup.js` 等待 content.js 的 `sendResponse`，若 Readability 处理超大文档时间过长，popup 按钮永久禁用，用户无法重试 | Important |
| **图片下载失败无反馈**：单张图片 404 或网络超时后，`void chrome.runtime.lastError` 静默忽略，用户不知道哪些图片实际未下载成功 | Minor |
| **并行大 SVG 内存压力**：多个高分辨率 SVG 同时创建 canvas，极端情况可能占用大量内存，导致页面卡顿或崩溃 | Minor |
| **iframe 捕获超时固定为 5s**：慢速网络或复杂 SVG 渲染时，5s 可能不足以完成所有 iframe 的 SVG 转换 | Minor |

---

## 三、项目结构与文档

### ✅ 优点

- README 完整：功能特性、安装步骤、使用说明、架构图、跨域 iframe 工作原理、第三方库列表
- `docs/plans/` 保存了完整的设计与实现历史（8 份文档）
- 测试结构清晰，覆盖核心 helper 函数

### ⚠ 问题

| 问题 | 严重度 |
|---|---|
| **README 项目结构过时**：第 102-105 行只列 4 个测试文件，缺少 `svg.test.js`；`tests/helpers/` 目录也未列出 | Minor |
| **无 CI/CD**：无 GitHub Actions，PR 合并无自动测试门控，质量依赖人工 | Minor |
| **版本号停留在 1.0.0**：`manifest.json` 版本未随迭代更新，无法追踪发布历史 | Minor |
| **lib/ 无更新机制**：Readability 0.6.0、Turndown 7.2.0 直接提交到仓库，无 package.json 或脚本自动升级 | Minor |
| **测试与主项目结构分离**：`tests/` 有独立 `node_modules` 和 `package.json`，贡献者需额外 `cd tests && npm install` | Minor |

---

## 四、可维护性

### ✅ 优点

- 关键逻辑有详细注释（两阶段策略原理、安全边界、base 依赖说明）
- 函数职责清晰，单文件体积适中（content.js 418 行）
- 测试覆盖 44 个用例，包含边界条件

### ⚠ 问题

| 问题 | 严重度 |
|---|---|
| **Helper 函数双维护**：`getSvgDimensions`、`buildUrlMap`、`remapKeys` 等在 `content.js` 和 `tests/helpers/` 中各有一份，靠注释"Keep in sync"手工维护，无机制保证一致性 | Important |
| **无 ESLint 配置**：`parseInt` radix、`onerror` 类型等问题依赖人工发现，无静态分析工具保障 | Minor |
| **`SVG_PROPS` 硬编码**：`iframe-capture.js` 中 CSS 属性列表需手工维护，SVG 规范扩展时易遗漏 | Minor |

---

## 整体健康度评分

| 维度 | 评分 | 主要风险 |
|---|---|---|
| UX / 功能完整性 | ⚠ 良好 | "Saved" 过早显示、无进度反馈 |
| 技术健壮性 | ⚠ 良好 | data URL 大小限制、sendMessage 无超时 |
| 项目结构与文档 | ⚠ 良好 | README 过时、无 CI、无版本管理 |
| 可维护性 | ⚠ 良好 | helper 双维护、无 ESLint |

**总体结论：** 项目核心实现架构合理，无 Critical 级别问题。改进空间集中于：
1. **健壮性**：data URL 大小限制（改用 Blob + `URL.createObjectURL`）、sendMessage 超时保护
2. **工程化**：GitHub Actions CI、ESLint 配置、README 同步
3. **UX**：下载进度反馈、"Saved" 显示时机、受限页面提示优化

---

## 改进优先级

| 优先级 | 项目 | 理由 |
|---|---|---|
| P1 | data URL 大小限制修复 | 可能导致长文章静默下载失败 |
| P1 | sendMessage 超时保护 | 可能导致 UI 永久卡死 |
| P2 | GitHub Actions CI | 保证每次提交质量 |
| P2 | README 项目结构更新 | 文档与代码不一致 |
| P3 | ESLint 配置 | 工具化代码规范 |
| P3 | 版本号更新策略 | 发布管理规范化 |
