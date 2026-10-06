# Tasks

## 1. 新 logo 与图标源文件

- [x] 1.1 写入 `apps/web/public/logo.svg` 并替换 `apps/web/public/favicon.svg`（内容见 design.md 附录 A）。先写 `apps/web/src/brand-mark.test.ts`，断言：两份 SVG 自包含（无 `<text>`、`<script>`、`<image>`、`href`、`@import`）；`logo.svg` 的底板、F、圆点颜色为字面值；`favicon.svg` 与 `logo.svg` 的图形位置与尺寸完全一致；`#e9592a` 对 `#f3f3f5` 与对 `#25252a` 的对比度均不低于 3:1；`favicon.svg` 的深色模式规则把底板与 F 对调且圆点不变。测试先失败，写入 SVG 后 `bun test apps/web/src/brand-mark.test.ts` 通过。

## 2. 文案字段

- [x] 2.1 在 `apps/web/src/i18n.ts` 的 `PageCopy` 与中英文文案里新增 `title`、`shareHeadline`、`shareImageAlt`，取值见 design.md D10。改动前对 `PageCopy`、`pageCopy` 跑 GitNexus `impact` 并记录结果。在 `i18n.test.ts` 里为三个新字段各加一条断言（取值与 D10 一致），验证：`i18n.parity.test.ts` 与 `i18n.test.ts` 通过，`bun run verify:fast` 通过。

## 3. 生成器

- [x] 3.1 把 `scripts/**/*.ts` 加进 `apps/web/tsconfig.json` 的 `include`。先写 `apps/web/scripts/og/png.test.ts`：合成一张含 `#25252a`、`#f3f3f5`、`#ffffff`、`#e9592a` 与抗锯齿过渡色的图，量化后调色板包含这四个精确值且不超过 64 个条目；输出的 PNG 签名、IHDR（8 位索引色）、PLTE、IDAT、IEND 依次出现且每个块的 CRC 正确；用 `node:zlib` 解压并反滤波后与量化得到的索引一致；扁平图的体积明显小于未量化的 RGBA PNG。测试先失败，再实现 `apps/web/scripts/og/png.ts`（量化器加索引色编码）。验证：`bun test apps/web/scripts/og/png.test.ts`、`bun run typecheck`、`bun run lint` 通过。
- [x] 3.2 字体。先写测试：文案里出现字体未覆盖的字符时报错并列出字符；字体文件 sha256 与锁文件不符时报错并指出文件名；锁文件缺字段或类型不对时（Effect Schema 解码）报错；取字体的辅助命令在注入的 fetch 返回非 200 时非零退出且不改动字体目录与锁文件，映射表格式不符时失败。实现后运行辅助命令，按当前文案从固定版本 `@fontsource/noto-sans-sc@5.3.0` 取回所需切片，提交切片、`fonts.lock.json` 与取自该包 LICENSE 的 OFL 许可证文本。验证：`apps/web/scripts/og/` 下字体相关测试通过，锁文件里每个 sha256 与对应文件内容一致。
- [ ] 3.3 在 `apps/web/package.json` 加 `satori@0.35.0`、`@resvg/resvg-wasm@2.6.2`（devDependencies，精确版本）以及 `og`、`og:fonts` 两个脚本，并在 `knip.json` 的 apps/web 入口里登记两个命令脚本。实现 `apps/web/scripts/og/templates.ts`：宽图（中文、英文）与方图的元素树，版式见 design.md 附录 B，叶子节点不带 `children` 字段，logo 用 `public/logo.svg` 的 data URI 嵌入。先写测试：渲染冒烟（Satori 加 resvg 渲出的 PNG 头声明 1200×630 与 600×600）；文案来自 `pageCopy`（改一个字段，元素树随之变化）；整棵树里没有 `children: []`。验证：`bun test`、`bun run knip`（新依赖被引用）、`bun run typecheck`、`bun run lint` 通过，干净检出里 `bun install --frozen-lockfile` 成功。
- [ ] 3.4 实现 `apps/web/scripts/og/generate.ts`：渲染、量化、写 `public/share/og-zh.png`、`og-en.png`、`square.png`；用 resvg 渲 `favicon-32.png` 与 `apple-touch-icon.png`；写 `src/share-assets.gen.ts`（形状见 design.md D12，版本取内容 sha256 前 8 位，含输入哈希）。先写测试（临时目录夹具）：全量生成后文件都在、尺寸正确、版本与内容哈希一致；两个独立进程连续生成两次，输出逐字节相同；宽图不超过 25 KB、方图不超过 8 KB；量化后超过体积上限或调色板上限时非零退出、指出是哪张图且不写入这张图；缺字时非零退出且不写任何图片。验证：`bun test apps/web/scripts/og/generate.test.ts` 通过。
- [ ] 3.5 给 `generate.ts` 加 `--check`（只比输入哈希与已提交 PNG 的内容哈希，不渲染）和 `--verify-render`（重渲染并逐字节比较，不改文件）。先写测试：改文案不重新生成时 `--check` 非零并提示 `bun run generate`；刚生成完时通过；替换 `og-zh.png` 后非零并指出该文件；产物最新时 `--verify-render` 通过且工作区无改动。验证：测试通过。
- [ ] 3.6 首次真实生成并提交产物：运行 `bun run --cwd apps/web og`，提交 `apps/web/public/share/*.png`、`favicon-32.png`、`apple-touch-icon.png` 与 `src/share-assets.gen.ts`。新增 `apps/web/src/share-assets.test.ts`：已提交 PNG 的尺寸正确（`favicon-32.png` 含 alpha，`apple-touch-icon.png` 四角为不透明的 `#25252a`）；`share-assets.gen.ts` 里每个版本等于对应文件内容哈希的前 8 位；三张分享图满足调色板与体积上限。验证：测试通过，并把中英文宽图与方图同对话里已获批的样图目视比对（版式、字体、橙点），三张图放进 PR 描述。

## 4. 页面接入

- [ ] 4.1 新增 `apps/web/src/share-meta.ts`：`shareMeta({ locale, origin, pathname, assets })` 与 `isWeChatUserAgent(ua)`，只用 Web API。先写 `share-meta.test.ts`：中英文的 `title`、`og:*`、`twitter:card`；`og:url` 只有英文带 `?lang=en`；`og:image` 为 origin 加路径加 `?v=`；origin 为空时没有 `og:url` 与 `og:image*`，其余标签仍在；没有重复的 property 或 name；UA 判断用真实的 iOS、Android、桌面微信 UA 做正例，用 Safari、Chrome、QQ 浏览器和空串做反例。验证：`bun test apps/web/src/share-meta.test.ts` 与 `bun run check`（边界扫描）通过。
- [ ] 4.2 根路由接入。改动前对根路由的 `Route` 与 `RootDocument` 跑 GitNexus `impact` 并记录结果。新增 `createServerFn`（请求内用 `getRequestUrl()` 与 `getRequestHeader('user-agent')`，整个包 try/catch，失败返回 `{ origin: null, wechat: false }`）、根路由 loader 与 `staleTime: Infinity`；`head()` 用 `shareMeta` 输出标题与标签，保留现有三个图标链接。先在 `tests/e2e/share.e2e.ts` 写标签部分：`/` 与 `/?lang=en` 的 HTML 含绝对地址的 `og:image`，请求该地址得到 200、`image/png`、PNG 头为 1200×630；`og:locale`、`og:url`、`<title>` 与 spec 一致；`<head>` 仍有三个图标链接。验证：`bun run test:e2e` 的这部分通过，`bun run typecheck` 与 `bun run lint` 通过。
- [ ] 4.3 微信方图。在 `RootDocument` 里按 loader 的 `wechat` 在 `<body>` 第一个元素渲染屏外方图（design.md D9）。先在 `share.e2e.ts` 加用例：含 `MicroMessenger` 的 UA 请求 `/` 时，`<body>` 第一个元素是 `<img>`，`src` 指向 `/share/square.png?v=…`，600×600、绝对定位在屏外、`aria-hidden="true"`、`alt=""`；普通 UA 时 HTML 里没有它。验证：`bun run test:e2e` 与 `bun run verify:fast` 通过。

## 5. CI、预算与文档

- [ ] 5.1 接入 `scripts/generate.ts`：`generate` 先生成分享资源，再走原有的 routeTree 构建；`generate:check` 先跑快速的 `--check`，再走原有的 `git diff` 检查。验证：手动演示三态（改一个文案字段后 `bun run generate:check` 非零并提示 `bun run generate`；运行 `bun run generate` 后通过；还原改动），且 `scripts/ci/tsconfig.json` 的类型检查通过。
- [ ] 5.2 边界检查：在 `scripts/ci/boundaries.ts` 里禁止 shipped source 引用 `satori` 与 `@resvg/*`，在 `scripts/ci/boundaries.test.ts` 加正反例。验证：`bun test scripts/ci/boundaries.test.ts` 与 `bun run check` 通过；`bun run build` 后确认 `apps/web/dist` 里没有 `.wasm` 与生成器使用的字体文件。
- [ ] 5.3 体积预算。先在未改动的 main 上跑一次 `bun run build && bun run bundle:check`，记录本地基线漂移（探针时本地总量已比基线高约 11 KB）；改动后再跑；用 `bun run bundle:check -- --write` 上调基线，PR 描述里分开写「既有漂移」与「分享图的有意成本」。验证：`bun run bundle:check` 通过，`performance/budgets.json` 里只有 `baseline` 变化，`absolute` 与 `relative` 不动。
- [ ] 5.4 文档。`README.md` 与 `README.zh-CN.md` 各加一段「分享预览」（图怎么重新生成、哪些文件被提交、字体许可证）；`AGENTS.md` 的「Generated code」补一条：`public/share/*`、`favicon-32.png`、`apple-touch-icon.png` 与 `share-assets.gen.ts` 不手改，用 `bun run generate`；`docs/ci-cd.md` 补一行：`generate:check` 现在也覆盖分享资源，并说明预算基线的上调。验证：`bun run verify` 通过，两份 README 的新段落中英对应。

## 6. 收尾与真机验证

- [ ] 6.1 全仓验证：`bun run verify`、`bun run policy`、`bun run test:e2e`、`bun run generate:check`、`bun run bundle:check` 全部通过；GitNexus `detect_changes`（scope all）无意外影响面；运行 `graphify update .`。验证：以上输出的摘要写进 PR 描述。
- [ ] 6.2 开 PR：分支 `feat/share-previews`，提交信息用 `feat:` 前缀。验证：CI 全绿（verify、performance、compatibility、preview、e2e、OSV、dependency-review）。
- [ ] 6.3 真机验证（需要维护者在手机上做，步骤见 design.md 的 Migration Plan）。验证：PR 里有一条记录，写明站点能否在微信里打开；朋友圈预览的标题与缩略图（二维码进入与收藏进入各一次）；Telegram、Slack、iMessage、X 的 OG 预览；QQ 浏览器分享到微信好友的卡片。
- [ ] 6.4 （条件）仅当 6.3 显示方图无效，且 design.md D9 的备选方式也无效时，删除微信方图：移除 `RootDocument` 里的屏外 `<img>`、loader 与 server fn 里的 `wechat` 字段、`isWeChatUserAgent` 及其测试、e2e 里的微信用例，并从 `share-previews` spec 删掉「微信内置浏览器里放一张屏外方图」一条。验证：`bun run verify` 与 `bun run test:e2e` 通过，`openspec validate share-previews --strict` 通过。
