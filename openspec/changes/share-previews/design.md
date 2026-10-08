# Design

## Context

动机见 proposal.md 的 Why。这里只写会影响做法的现状与约束。

**现状**
- 生产是一个 Cloudflare Worker（TanStack Start、Vite、Cloudflare Vite 插件），域名 `fetchr.hanyang.app`。根路由 `apps/web/src/routes/__root.tsx` 的 `head()` 只给 `charSet`、`viewport`、`title: "Fetchr"` 和 `description`，图标是旧旗标的 `favicon.svg`、`favicon-32.png`、`apple-touch-icon.png`。没有 `og:*` 与 `twitter:*`。
- 语言：默认中文，`?lang=en` 为英文（`localeFromSearch`），文案在 `apps/web/src/i18n.ts`，`i18n.parity.test.ts` 强制中英文字段齐全。
- Worker 现有 JS 约 4.1 MB（gzip 约 0.9 MB），不含任何 wasm。客户端 `dist/client` 的 gzip 总量本地实测 525 KB，基线 514.47 KB，5% 警告线 540 KB，10% 失败线 566 KB，绝对上限 650 KB。

**约束（来自 config.yaml、AGENTS.md 与现有脚本）**
- Worker 代码只用 Web API。`apps/web/src/**` 属于 shipped source，`scripts/ci/boundaries.ts` 与 semgrep 禁止它引用 `node:` 和 `bun`。`apps/web/scripts/` 与测试不属于 shipped source，可以用 node 和 bun。
- 仓库一贯精确锁版本，只用 `bun.lock`。`*.gen.ts` 被 lint、semgrep、边界扫描排除，惯例是「生成产物提交，`generate:check` 在 CI 里守门」（`compatibility.yml` 已在跑）。
- 预算基线只能在「新成本是有意的」时用 `bundle:check -- --write` 上调；不为过 CI 削弱预算。
- 外部载荷必须经 schema 解码（Effect Schema），不做未经校验的类型断言。
- 本变更没有难以回退的 Effect、存储或交付决策，不需要 ADR。

**微信的事实与分歧**
- 官方：JS 接口安全域名需要 ICP 备案（[域名管理](https://developers.weixin.qq.com/doc/oplatform/developers/basic_func/domain.html)）；`updateTimelineShareData` 只有 `title`、`link`、`imgUrl`，没有描述；分享接口权限只有微信认证的账号才有（[JS-SDK 说明与权限对照表](https://developers.weixin.qq.com/doc/subscription/guide/h5/jssdk.html)）。所以朋友圈卡片本质是「标题 + 一张小方图」，自定义它的官方途径不可行。
- 没接 JS-SDK 时微信的默认行为，开发者实测互相矛盾：[2019](https://www.cnblogs.com/rgyj/p/11460251.html) 在朋友圈没测到缩略图；[2020](https://juejin.cn/post/6844904105375170573) 与 [2023](https://m.okjike.com/originalPosts/64d7665a96f1897a9e1a4fad) 说会取 `<title>` 加页面里第一张 ≥300×300 的可见图；[2022](https://juejin.cn/post/7103445901892386846) 说点聊天里的纯链接进页面再分享只会发出链接，二维码或收藏进入才出卡片。
- Open Graph：[2024 年一篇](https://feng.moe/posts/202407-pages-share-and-open-graph)说内置浏览器不读 OG，但 iOS Safari 系统分享会带 OG 到微信好友；[另一篇](https://juejin.cn/post/7517486807892033588)说从 QQ 浏览器分享到微信好友按 OG 生成卡片，朋友圈没测。
- 2026-10-08 补充：[腾讯云上一篇](https://developer.cloud.tencent.com/article/1928547)的作者在微信里试了好几次隐藏图片，没有成功，并认为「取第一张图」是 QQ 的旧逻辑；[V2EX 2023 年的讨论](https://www.v2ex.com/t/961962)里没有一个验证过的免 JS-SDK 办法，唯一明确有好卡片的例子（豆瓣）在微信 UA 下加载的是 JS-SDK。
- 结论：方图是赌注，真机验证没有生效（见 D9）；OG 图对其余平台与 QQ 浏览器这类接了微信 SDK 的 App 有效。

**探针结果**（Bun 1.4.2、`satori@0.35.0`、`@resvg/resvg-wasm@2.6.2`，临时目录，未改仓库）
- 导入约 30 ms，wasm 初始化约 5 ms，单张图 20–110 ms。两个独立进程渲染的 PNG 字节完全一致（同一台机器）。
- 原始 PNG：宽图 46–50 KB，方图 5–10 KB。量化到 8 位调色板（ImageMagick 估算）：宽图 15–18 KB，方图 2–3 KB。ImageMagick 的 32 色会把 `#ffffff` 的卡片并进 `#f3f3f5` 的底色，所以品牌色必须锁定。
- 中文字体：29 个字符（含标点）需要 8 个 Noto Sans SC 切片，每个字重约 310 KB。
- Satori 能把 SVG 文件当 `<img>` 的 data URI 嵌入；0.35 拒绝非 flex 叶子节点上的 `children: []`，叶子节点要省略 `children` 字段。

## Goals / Non-Goals

**Goals:**
- 提交进仓库的分享图与图标始终与文案、logo、字体一致，过期会在 CI 里被发现。
- 分享元数据永远不会让页面失败；origin 随部署而变。
- 新增成本可控：Worker 零增量，`dist/client` 约 +37 KB gzip。

**Non-Goals:**
- 微信 JS-SDK、签名服务、备案域名。
- 按页面或按帖子动态出图（站点没有 per-post 页面）。
- canonical、hreflang、重复的 `twitter:*` 标签，`/terms` 单独标题。
- 横版 logo 与纯字形版进仓库（用到时再放）。

## Decisions

**D1 构建时生成并提交 PNG**
- 生成器放 `apps/web/scripts/og/`，产物提交进 `apps/web/public/share/`，另生成 `apps/web/src/share-assets.gen.ts`。
- 替代：Worker 实时渲染（wasm 约 2.5 MB，加 satori 与字体，Worker 包体要翻倍以上，workerd 不允许运行时编译 wasm，还得用 `@cf-wasm/*` 一类封装，冷启动与 CPU 上升，收益只有「可动态」）；Vite 插件构建时生成不提交（构建更重，PR 里看不到图，CI 每次带字体与 wasm）。
- 选这个：Worker 零增量，PR 里直接看图，符合仓库「生成产物提交 + `generate:check`」的惯例。

**D2 渲染链：Satori → SVG → resvg-wasm → 像素 → 量化 → 索引色 PNG**
- 依赖 `satori@0.35.0`、`@resvg/resvg-wasm@2.6.2`，精确锁版本，放 `apps/web` 的 devDependencies，仅构建期使用（MPL-2.0，不随产物分发）。选 wasm 版而不是 `@resvg/resvg-js`，因为 wasm 版在 macOS 与 Linux CI 上是同一份实现，没有平台原生二进制。
- 元素树用普通对象（带 `key: null`，标注为 `ReactElement`），不引入 JSX 配置；叶子节点不带 `children` 字段。
- 图标 PNG（`favicon-32.png`、`apple-touch-icon.png`）由同一个生成器直接用 resvg 渲染 `logo.svg`，不量化。

**D3 单一来源**
- 文案：标签与按钮取 `pageCopy` 的 `pasteLabel`、`submit`，平台名取 `platforms`，大标题取新增的 `shareHeadline`。分享图上的字和真实界面永远一致。
- 标志：模板把 `public/logo.svg` 当 `<img>` 的 data URI 嵌入，不在代码里重画。方图是墨色底（`#25252a`）上把 `logo.svg` 放大，底板与背景同色，圆角自然消失，所以不需要单独的纯字形文件；`apple-touch-icon.png` 同理。
- `favicon.svg` 因为要用 CSS 做深色反相，必须单独存在，几何与 `logo.svg` 重复；用一个测试比较两者的图形属性来防漂移。

**D4 字体：Figtree 取自已安装的包，中文用提交进仓库的 Noto Sans SC 切片**
- Figtree 的 `.woff` 取自 apps/web 已有的 `@fontsource/figtree`。中文切片来自固定版本 `@fontsource/noto-sans-sc@5.3.0`（OFL-1.1），按文案用到的字符选切片，提交进 `apps/web/scripts/og/fonts/`（约 630 KB），附 OFL 许可证文本和 `fonts.lock.json`（文件名、sha256、来源版本，读入时用 Effect Schema 解码）。
- 每个切片注册成独立的字体族，在 `fontFamily` 里串成回退链，让 Satori 逐字回退（探针已验证）。
- 缺字时生成失败并列出字符；辅助命令 `og:fonts` 按当前文案下载所需切片并更新锁文件，下载非 200 或映射表格式不符就失败，不改动已有文件。
- 替代：先子集化（要多一个 wasm 依赖，以后嫌大再换）；把整个 `@fontsource/noto-sans-sc` 当 devDependency（解包 74.5 MB）；生成时联网取 Google Fonts（构建依赖网络）。

**D5 自写量化器与索引色 PNG 编码，不加依赖**
- 调色板不超过 64 色：先把渲染结果里精确出现的品牌色（`#25252a`、`#f3f3f5`、`#ffffff`、`#e9592a`）钉成条目，其余像素用中位切分补足，逐像素映射到最近的条目；用 `node:zlib` 压缩，逐行选滤波器。图为不透明，不写 `tRNS`。
- 理由：锁定品牌色是硬要求，ImageMagick 的通用量化做不到；量化能把三张图从约 105 KB 降到约 37 KB，避免吃掉 650 KB 绝对上限里相当一块，且让基线上调幅度小很多。
- 替代：`upng-js`（2018 年后无更新，量化不锁色）；`pngquant` 或 ImageMagick（CI 里不保证有）；不量化（体积见上）。

**D6 CI 只比输入哈希，不重新渲染**
- 输入哈希覆盖：分享文案字段、`logo.svg`、模板与量化器源码、字体锁文件、`satori` 与 `@resvg/resvg-wasm` 的版本。`generate:check` 比较它与 `share-assets.gen.ts` 里记录的值，并校验已提交 PNG 的内容哈希与记录一致，不渲染。
- 理由：不受 macOS 与 Linux 光栅、zlib 实现差异影响。另提供本地 `--verify-render` 重渲染并逐字节比较，作为不进 CI 的额外保险。
- `scripts/generate.ts` 扩成：`generate` 先生成分享资源，再走原有的 routeTree 构建；`generate:check` 先跑快速的输入哈希检查，再走原有的 `git diff` 检查。

**D7 体积预算：保持预算脚本不动，上调基线**
- 构建后用 `bun run bundle:check -- --write` 上调基线，并在 PR 里写明「分享图是有意成本」。
- 替代：把 `share/` 排除出 `bundle-budget.ts` 的统计。这在道理上站得住（这些图只被爬虫抓取，不是页面体积），但它改的是验证器本身，按 AGENTS.md 该由维护者拍板，所以不选。

**D8 页面接入：纯函数 `share-meta.ts` + 根路由 loader**
- `apps/web/src/share-meta.ts`（只用 Web API）输入语言、origin、路径与 `share-assets.gen.ts` 的图片信息，输出 `title`、`description` 与全部 `og:*`、`twitter:card` 标签。所有对外文案在一处。
- 根路由新增 loader，调用一个 `createServerFn`，在请求内用 `getRequestUrl()`，返回 `{ origin }`。TanStack Start 在服务端渲染时直接执行它，loader 数据自动 dehydrate 到客户端，水合一致。根路由设 `staleTime: Infinity`。实测默认设置下语言切换和客户端跳转也不会重新请求（根 match 在跳转间保留），所以它只是兜底；端到端测试守的是行为，即水合之后没有 `_serverFn` 请求（让 loader 重跑时该测试会变红，已验证）。
- 整个 server fn 包 try/catch，失败返回 `{ origin: null }`；`origin` 为空时 `share-meta` 省略 `og:url` 与 `og:image*`。
- 不写死域名：README 有一键部署按钮，fork 与 preview 的域名都不同。替代：`VITE_SITE_URL`（构建期常量，对 fork 与 preview 不对）；相对路径（爬虫不可靠）。
- 请求信息只在请求内读取，不放模块作用域（Workers 上 env 与请求按次注入）。

**D9 微信方图（已删除）**
- 做法：仅当 UA 含 `MicroMessenger` 时，`RootDocument` 在 `<body>` 第一个元素渲染一张 600×600 的屏外 `<img>`（`position: absolute; left: -9999px`），赌微信取页面第一张大图作朋友圈缩略图。
- 2026-10-08 真机验证：用二维码打开 PR 的 preview，在微信内置浏览器里分享到朋友圈。站点能打开，卡片出现，缩略图框里是微信默认的链接图标，不是方图，也不是 favicon 或 OG 图。方图没有生效，按 tasks 6.4 删除。
- 没有试的：收藏进入；原定的备选（`visibility: hidden` 或 `clip` 的隐藏方式，`<meta itemprop="image">`）；留在视口内但透明的写法。决定直接删除，因为没找到免 JS-SDK 指定缩略图的可靠资料（见上），而能控制缩略图的 JS-SDK 是本变更的 Non-Goal。
- 以后要再试，只动 `RootDocument` 里的一块和 loader 的 `wechat` 字段，其余不受影响。删除前的实现在 git 历史里。

**D10 文案**

| | 中文 | English |
| --- | --- | --- |
| `title`、`og:title` | Fetchr：粘贴链接，下载视频和图片 | Fetchr: paste a link, download videos and images |
| `shareHeadline`（卡片大标题） | 粘贴链接，下载视频和图片 | Paste a link, save the media |
| `description`、`og:description` | 沿用现有 | 沿用现有 |
| `shareImageAlt`（`og:image:alt`） | Fetchr 的粘贴链接输入框与解析按钮，支持小红书、抖音、Instagram、哔哩哔哩、YouTube 和 X | Fetchr's paste-link field and Extract button, supporting Xiaohongshu, Douyin, Instagram, Bilibili, YouTube and X |

**D11 logo**
- 几何与配色见 brand-mark spec。橙色用 `#e9592a` 而不是更亮的 `#ee6a3c`：后者在纸色底上只有 2.80:1，前者是 3.20:1，在墨色底上是 4.31:1。
- `apple-touch-icon.png` 用无圆角的整块墨底，iOS 自己裁圆角。

**D12 `share-assets.gen.ts` 的形状**
- 导出常量对象：`inputsHash`，以及 `ogZh`、`ogEn`、`square`，每项含 `path`、`version`（内容 sha256 的前 8 位）、`width`、`height`。`share-meta` 用 `path` 加 `?v=version` 拼地址。文件头注明由生成器产出、不要手改，沿用 `routeTree.gen.ts` 的惯例。

**测试策略**（任务拆分见 tasks.md）
- 单元：`share-meta`（中英文、origin 为空、无重复标签）、量化器（锁色、不超过 64 色、PNG 结构与 CRC、解码回读）、字体（缺字、哈希不符、锁文件格式）、输入哈希与 `--check`、已提交 PNG 的尺寸与版本哈希、`logo.svg` 与 `favicon.svg` 几何一致与对比度。
- e2e（Playwright，本地 preview，离线）：`/` 与 `/?lang=en` 的 `og:image` 为绝对地址且可取、尺寸正确。
- 真机（只能人来做）：见 Migration Plan。

## Risks / Trade-offs

- [微信按域名拦截解析下载类站点（「已停止访问该网页」）] → 真机验证第一步就是确认能否打开；被拦则朋友圈这条线先别投入，申诉不在本变更范围。2026-10-08：workers.dev 的 preview 能在微信里打开；生产域名 `fetchr.hanyang.app` 还没测。
- [自写量化器出错或画质不佳] → 测试锁定品牌色、结构与回读；肉眼对比样图；回退方案是不量化并上调更大的基线。
- [macOS 与 Linux 光栅、Bun 的 zlib 版本差异] → CI 只比输入哈希，不比字节；`--verify-render` 仅本地可选；`packageManager` 已锁 Bun 版本。
- [新依赖的漏洞或许可证] → 仅 devDependencies、仅构建期；PR 上过 OSV 与 dependency-review；MPL-2.0 的代码不随产物分发。
- [字体切片约 630 KB 进仓库] → 一次性成本；以后可换成子集化。
- [平台缓存旧图] → 地址带 `?v=` 内容哈希；已缓存的旧预览要等各平台下次抓取。
- [`/terms` 沿用全站标题，与页面主题略不符] → 接受，后续单独处理。
- [Satori 对元素树的格式要求苛刻（如空 `children`）] → 辅助函数统一构造，单测覆盖。

## Migration Plan

1. 按 tasks.md 的切片实现，分支名 `feat/share-previews`，一个切片一个可单独评审的提交。
2. PR 的 CI 全绿（`verify`、`bundle:check`、`generate:check`、e2e、OSV、dependency-review）；基线上调在 PR 描述里写明理由。
3. PR 的 preview 部署出来后做真机验证：在手机微信里用二维码打开 preview 地址（不要点聊天里的纯链接），点「…」→「分享到朋友圈」，别发表，看预览里的标题与缩略图；再用「收藏」进入重复一次。微信按 URL 缓存，反复测试时给地址加不同的 `&t=1`、`&t=2`。另在 Telegram、Slack、iMessage、X 里贴链接看 OG 预览，用 QQ 浏览器分享到微信好友看卡片。
4. 方图没出现：已删除，经过见 D9。
5. 合并后走现有的 main 推送流程（preview 冒烟、100%、线上冒烟、失败自动回滚）。
6. 回滚：revert。产物是静态资源加 head 标签，没有数据迁移。

## Open Questions

- 自写量化器的实际体积是否满足 25 KB 与 8 KB 的上限（实现后实测，阈值可据此调整）。
- 字体是否改为子集化（仅当 630 KB 被嫌大时）。

## 附录 A：定稿的 SVG 源

对话里已获批的版本，实现时原样写入。

`apps/web/public/logo.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <title>Fetchr</title>
  <rect width="64" height="64" rx="15" fill="#25252a"/>
  <rect x="17" y="11" width="11" height="42" rx="5.5" fill="#f3f3f5"/>
  <rect x="17" y="11" width="30" height="10" rx="5" fill="#f3f3f5"/>
  <rect x="17" y="27" width="22" height="10" rx="5" fill="#f3f3f5"/>
  <circle cx="40" cy="47.5" r="5.5" fill="#e9592a"/>
</svg>
```

`apps/web/public/favicon.svg`（深色模式反相，几何与 `logo.svg` 一致）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <title>Fetchr</title>
  <style>
    .bg { fill: #25252a }
    .fg { fill: #f3f3f5 }
    .dot { fill: #e9592a }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #f3f3f5 }
      .fg { fill: #17171b }
    }
  </style>
  <rect class="bg" width="64" height="64" rx="15"/>
  <g class="fg">
    <rect x="17" y="11" width="11" height="42" rx="5.5"/>
    <rect x="17" y="11" width="30" height="10" rx="5"/>
    <rect x="17" y="27" width="22" height="10" rx="5"/>
  </g>
  <circle class="dot" cx="40" cy="47.5" r="5.5"/>
</svg>
```

## 附录 B：分享图的版式参数

对话里已获批的两张样图（宽图「产品卡」、方图「旗标加字标」）的参数。品牌色取自 Stone 主题：墨 `#25252a`、纸 `#f3f3f5`、次级文字 `#5e5e63`、边框 `#e2e2e8`。字体：Figtree 500、600、700（拉丁），Noto Sans SC 500、700（中文，经回退链）。

**宽图 1200×630**，底 `#f3f3f5`，左右内边距 80，纵向间距 30。探针样图的内容贴着上沿、底部偏空，正式模板要让整块内容在画布内垂直居中。
- 品牌行：`logo.svg` 48×48，右侧字标「Fetchr」32px、字重 600、Figtree，间距 16。
- 大标题：`shareHeadline`，一行，68px、字重 700、`#25252a`。中文用 Noto Sans SC 700，英文用 Figtree 700。
- 卡片：白底 `#ffffff`，1px 边框 `#e2e2e8`，圆角 28，内边距 32，内部纵向间距 22。
  - 标签：`pasteLabel`，24px、字重 500、`#5e5e63`。
  - 输入行（间距 16）：输入框 flex 1、高 84、左右内边距 28、2px 边框 `#d4d4da`、圆角 16，内容是装饰性的示例链接 `https://v.douyin.com/iR8aXk2/`（Figtree、28px、字重 500、`#5e5e63`）；按钮 176×84、底 `#25252a`、圆角 16，文字 `submit`（32px、字重 700、`#f3f3f5`）。
  - 平台行（间距 12）：`platforms` 逐个做药丸，内边距 8px 20px、全圆角、底 `rgba(37,37,42,0.07)`、24px、字重 500、`#25252a`。
- 英文版同一版式，标签、按钮、平台名取英文文案。

**方图 600×600**，底 `#25252a`。
- `logo.svg` 放大到 427×427、水平居中，使 F 高约 280、F 顶边距画布顶 96（底板与背景同色，圆角随之消失，所以只需要这一份 SVG）。
- 字标「Fetchr」92px、字重 600、`#f3f3f5`、Figtree，位于 F 底边下方约 40，水平居中。整组内容的墨迹上下留白相等：字标的行盒比字形高，所以 F 顶边取 96 而不是按行盒估算的 85。

**图标 PNG**
- `favicon-32.png`：用 resvg 把 `logo.svg` 渲到 32×32，保留圆角与透明角。
- `apple-touch-icon.png`：180×180，先铺满 `#25252a`，再叠 `logo.svg` 渲到 180×180，圆角处露出同色底，得到不透明的整块墨底。
