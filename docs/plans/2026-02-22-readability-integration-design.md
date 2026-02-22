# Readability.js 集成设计

## 背景

当前 2md 使用简单的 CSS 选择器（`main, article, [role="main"]`）选取正文区域，再手动移除噪音元素。该方案在不同网站上表现不稳定，噪音过滤不彻底，缺少元信息提取能力。

## 目标

- 用 Mozilla Readability 替代手动内容选区，提升正文提取质量
- 自动提取元信息（标题、作者、摘要等），输出为 YAML frontmatter
- 保持现有图片收集、路径重写、文件名清理等逻辑不变

## 方案选择

评估了三个方案：

| 方案 | 描述 | 结论 |
|------|------|------|
| A. Readability 提取正文 | 引入 Mozilla Readability 做通用正文提取 | **选定** |
| B. 增强规则 + 站点适配器 | 为不同网站写专用选择器和规则 | 维护成本高，通用性差 |
| C. Readability + 站点适配器 | 混合方案 | 过度设计，YAGNI |

## 架构设计

### 转换流程

```
用户点击 -> popup 注入脚本 -> content.js:
  1. document.cloneNode(true)
  2. new Readability(clonedDoc).parse()
     -> { title, byline, content, excerpt, siteName, lang }
  3. 从 article.content 中收集图片 URL
  4. TurndownService 将 content 转 Markdown
  5. 拼接 YAML frontmatter
  6. 返回给 popup -> background.js 下载
```

### 脚本注入顺序（popup.js）

```
lib/Readability.js -> lib/turndown.js -> lib/turndown-plugin-gfm.js -> content.js
```

### Markdown 输出格式

```markdown
---
title: "文章标题"
author: "作者名"
source: "https://example.com/article"
date: "2026-02-22"
---

正文内容...
```

## 详细设计

### content.js 主流程

- 用 `document.cloneNode(true)` 克隆完整文档供 Readability 使用
- Readability 返回 `article` 对象含 title, byline, content 等字段
- `article.content` 是清洗后的 HTML 字符串，用于图片收集和 Turndown 转换
- Readability 解析失败（返回 null）时直接返回错误，不降级
- `article.title` 优先于 `document.title`

### 新增函数：buildFrontmatter

- 接收 meta 对象 `{ title, author, source, date }`
- 生成 YAML frontmatter 字符串
- 只包含有值的字段，跳过空值

### 关键决策

- Readability 解析失败时返回错误，不降级到旧逻辑
- 图片收集改为从 `article.content` HTML 字符串中操作
- frontmatter 中只包含有值的字段

## 依赖管理

- 下载 `@mozilla/readability` standalone 版本到 `lib/Readability.js`
- 与 turndown.js 同样方式管理，不引入 npm/bundler

## 文件变动

| 文件 | 变化 |
|------|------|
| `lib/Readability.js` | 新增 |
| `content.js` | 重写主流程，新增 `buildFrontmatter()` |
| `popup.js` | 注入列表增加 `lib/Readability.js` |
| `background.js` | 不变 |
| `manifest.json` | 不变 |

## 测试计划

- 保留现有 16 个测试
- 新增 `buildFrontmatter()` 单元测试
- 新增 Readability 正文提取集成测试
- 新增 Readability 返回 null 的错误处理测试
