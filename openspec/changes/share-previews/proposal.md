# Proposal

## Why

站点的分享预览是空的。线上首页 `<title>` 只有 `Fetchr`，没有任何 `og:*` 或 `twitter:*` 标签（2026-10-06 对 fetchr.hanyang.app 实测），链接贴到 X、Telegram、Slack、Discord 里没有预览图。站点默认中文，受众主要在微信里分享，而朋友圈的链接卡片只由「标题 + 一张小方图」构成：微信内置浏览器基本不读 Open Graph，自定义卡片的官方途径是 JS-SDK，要求 ICP 备案域名、微信认证的公众号和签名服务。站点是 Cloudflare Worker 加 `.app` 域名，这条路走不通。

现有 logo（旗标）在杆与旗面交接处有缺口，辨识度差，用户明确不满意；分享图、favicon 都要用到它，所以一起换。

## What Changes

- 新增构建时生成管线：用 Satori 加 `@resvg/resvg-wasm` 渲染 `og-zh.png`、`og-en.png`（1200×630）和 `square.png`（600×600），量化为索引色 PNG（不超过 64 色，锁定品牌色），连同生成的 `share-assets.gen.ts` 一起提交。生成器放在 `apps/web/scripts/og/`，不进 Worker。
- 根路由输出 `og:*` 与 `twitter:card`，`<title>` 改为带语义的中英文标题。`og:image` 与 `og:url` 用绝对地址，origin 取自当前请求，图片地址带内容哈希 `?v=`。
- 仅当 User-Agent 含 `MicroMessenger` 时，在 `<body>` 首位渲染一张挪出屏幕的 600×600 方图，赌微信「取页面第一张大图」的规则。资料互相矛盾，必须真机验证；不灵就整段删除，不影响其余部分。
- 新 logo：F 加橙色圆点（`#e9592a`）。新增 `logo.svg`，替换 `favicon.svg`（深色模式反相）、`favicon-32.png`、`apple-touch-icon.png`。
- `i18n.ts` 新增 `title`、`shareHeadline`、`shareImageAlt`；分享图里的标签、按钮、平台名直接取自现有的 `pageCopy`，和真实界面保持一致。
- `generate` 与 `generate:check` 覆盖分享图和图标 PNG；`bundle:check` 基线按「有意成本」上调；README（中英）、AGENTS.md、`docs/ci-cd.md` 补说明。
- 不做：微信 JS-SDK；canonical、hreflang 与重复的 `twitter:*` 标签；`/terms` 的单独标题。

## Capabilities

### New Capabilities
- `share-previews`: 页面的标题与描述、Open Graph 与 Twitter 标签、分享图地址与可取性，以及微信内置浏览器里的方图。
- `share-image-generation`: 分享图与图标 PNG 的构建时生成，包括体积与调色板约束、缺字与字体完整性、确定性，以及 `generate:check` 的守门语义。
- `brand-mark`: 新 logo 的几何与配色、favicon 的深色模式行为、图标集的格式与尺寸。

### Modified Capabilities
（无既有 specs，全部为新增）

## Impact

- 代码：`apps/web/src/`（`routes/__root.tsx`、`i18n.ts`、新增 `share-meta.ts`、生成的 `share-assets.gen.ts`）；`apps/web/scripts/og/`（新增生成器、字体切片、锁文件）；`apps/web/public/`（`logo.svg`、`favicon.svg`、`favicon-32.png`、`apple-touch-icon.png`、`share/*.png`）；`apps/web/package.json`、`apps/web/tsconfig.json`；`scripts/generate.ts`；`performance/budgets.json`；`knip.json`（如需）；`README.md`、`README.zh-CN.md`、`AGENTS.md`、`docs/ci-cd.md`。
- 边界：只触及 `apps/web` 与仓库根的脚本、预算和文档，不触及 `packages/*`。Worker 代码仍只用 Web API，生成器及其依赖不进 Worker。
- 依赖：新增 `satori@0.35.0`、`@resvg/resvg-wasm@2.6.2`（devDependencies，MPL-2.0，仅构建期）；提交 Noto Sans SC 字体切片（OFL-1.1，约 630 KB）及其许可证文本。
- 体积：`dist/client` 预计增加约 37 KB gzip（宽图约 15–18 KB 两张，方图约 3 KB）。这是探针里用 ImageMagick 量化得到的估算，自写量化器的实际值要实现后才知道。结果会越过 5% 警告线，需要上调基线。
- 被否方案：
  - Worker 里实时渲染：resvg 的 wasm 约 2.5 MB，加上 satori 与 CJK 字体，Worker 包体（现约 0.9 MB gzip）要翻倍以上；workerd 不允许运行时编译 wasm；收益只有「可动态」，而站点没有 per-post 页面。
  - Vite 插件在 build 时生成、不提交 PNG：往已经很重的 Vite 配置里再加自定义插件，构建变慢，PR 里看不到图。
  - 微信 JS-SDK：要备案域名、认证公众号和签名服务，当前都没有。
- 风险：微信方图是赌注，必须真机验证；生成器跨 macOS 与 Linux 的字节一致性未验证（CI 只比输入哈希）；新依赖要过 OSV 与 dependency-review。
