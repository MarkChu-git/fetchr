# Fetchr

[English](README.md)

Fetchr 是一个 Cloudflare Worker：读一条公开分享链接，展示这条作品，让你把文件存下来。

把分享文案贴进页面，Fetchr 取出其中的链接并加载公开作品。它不存任何登录态。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

版本按 semver 命名。推送 `vX.Y.Z` tag 会自动构建、测试并发布 GitHub Release。见 [Releases](https://github.com/MarkChu-git/fetchr/releases)。

## 快速开始

本仓库锁定 Bun 1.4.2。在仓库根目录：

```sh
bun install
bun run --cwd apps/web dev
```

打开 http://127.0.0.1:5173/。Vite 默认用 5173 端口，被占用时会顺延。

本地开发用内置密钥给下载签名。生产部署需要[配置](#配置)里的签名密钥。

## 用法

页面默认中文。顶栏的 **中文** 和 **EN** 切换语言，`?lang=en` 直接打开英文版。选择会存进 cookie，之后下载出错时错误提示也用同一语言。

在「粘贴链接」输入框里贴 URL，或者整段分享文案。Fetchr 保留其中的 `http`/`https` 链接，去掉零宽字符，丢掉首尾的多余标点。

点 **解析**，作品会替换空状态。保存方式：

- **下载**打开画质菜单。第一项是原画文件，带分辨率和精确体积。抖音视频还会列出平台自带的 720p、540p 档位，带预估体积——短视频的原画可能是档位的几十倍大。
- **保存到相册**出现在支持文件分享的手机上，按你选的画质交给系统分享面板。
- **全部下载**在多文件作品上出现，把全部原画在浏览器里打包成一个 zip。
- 画面和声音分成两个文件时，点 **合成并下载**，浏览器在本地合成 mp4。DASH 清单会显示提示，**下载**保存该清单。

不要离开当前页面的地址栏。

页面上写着抖音、哔哩哔哩、YouTube、X。同一个输入框也接受小红书、Instagram、TikTok、快手。

解析失败时，空状态会换成以下之一：

| 情况 | 提示 |
| --- | --- |
| 文案里没有可用链接，或没有对应解析器 | 这个链接不支持 |
| 作品是私密的 | 这条内容是私密的 |
| 平台要求登录 | 需要登录才能查看 |
| 找不到作品 | 没有找到这条内容 |
| 页面没有可下载的媒体数据 | 页面里没有可下载的内容 |
| 上游拦截了请求 | 上游暂时拦截了这次请求 |
| 页面数据格式变了 | 页面数据格式变了 |
| 链接未能解析 | 这个链接没有解析成功 |
| 上游没有返回有效页面 | 上游没有返回可用页面 |
| 上游超时 | 上游没有及时响应 |
| 超过频率限制 | 请求太频繁，请稍后再试 |
| DRM 保护 | 这条内容有版权保护，不能下载 |
| 区域限制 | 这个地区看不了这条内容 |
| 其他失败 | 解析失败 |

## 功能

- 抖音视频和图文都不需要登录。公开 feed 只在请求带齐客户端参数集时才返回目标作品，视频图文都走这条路。`v.douyin.com` 短链可解析，包括含 `-` 和 `_` 的短码。只有 `modal_id` 的页面链接也能解析，作品是图文时 canonical URL 会写成 `/note/` 形式。
- 抖音视频默认保存原画（`ratio=default`），平台自带的 720p、540p 档位作为更小的选择。图文从 `url_list` 里取最后一张浏览器可渲染的图，跳过 webp 预览和实况照片的 HEIC 静态图。带水印的 `download_url_list` 不读。
- 哔哩哔哩公开视频，支持 `www.bilibili.com`、`m.bilibili.com` 和 `b23.tv` 短链。画面和声音分离时浏览器本地合成。
- YouTube 的 `www.youtube.com`、`m.youtube.com`、`music.youtube.com`、`youtube-nocookie.com` 的 `/watch` 链接，以及 `youtu.be` 短链。
- X/Twitter 的 `x.com`、`www.x.com`、`twitter.com`、`www.twitter.com` 状态链接，限免登录可见的帖子。
- 小红书 `/explore/` 和 `xhslink.com` 链接、Instagram `/p/` 和 `/reel/` 帖子、TikTok 的 `tiktok.com`(`www`、`m`、`vm`、`vt`，含 `/t/` 短链和 `@user/video`、`@user/photo` 路径）、快手 `v.kuaishou.com` 和 `www.kuaishou.com/short-video/`。
- 只有一个 Worker，名叫 `fetchr-web`。它不存媒体文件，不做转码。
- 浏览器不能代附文件宿主要求的请求头时，用 HMAC-SHA256 下载令牌。令牌 30 分钟过期。校验失败时英文页显示 "This download link is not valid"，中文页显示「下载链接无效」。

## 工作原理

```text
页面
  ↓
Worker
  ↓
extract(url, transport, extractors)
  ↓
平台包
  ↓
上游
```

`packages/core/src/extract.ts` 的 `extract` 是解析入口。调用方传入粘贴的文本、一个 `Transport` 和解析器列表。每个平台包认自己的 URL，返回 `MediaPost`。

```ts
export function extract(
  url: string,
  transport: Transport,
  extractors: readonly Extractor[],
): Effect.Effect<MediaPost, ExtractFailure>
```

每个媒体文件带一种交付方式：

- `direct`：浏览器直接取文件。交付带请求头时，Worker 先签代理令牌再给页面。
- `mux`：浏览器分别读画面和声音，在本地写成一个 mp4。URL 带请求头时，浏览器拿到同源的 `/download/{token}` 地址，合成仍在设备上完成。
- `proxy`：Worker 取文件并流式转发。调用方传入的 URL 一律忽略。
- `playlist`：清单 URL,protocol 是 `hls` 或 `dash`。哔哩哔哩在浏览器无法合流时给 `dash`，页面保存该清单。

## 仓库结构

| 目录 | 用途 |
| --- | --- |
| `apps/web` | 页面和 `fetchr-web` Worker |
| `packages/core` | `MediaPost` 模型与 `extract()` |
| `packages/delivery` | HMAC 代理令牌与公网 URL 校验 |
| `packages/media-browser` | 浏览器端合流 |
| `packages/platform/*` | 一个平台一个包，`fixture` 是测试解析器 |
| `scripts/ci` | Worker 发布脚本与钉住校验和的扫描器安装脚本 |
| `tests/e2e` | 跑在构建产物上的 Playwright 端到端测试 |
| `.verifier/semgrep` | 策略规则：禁 `any`、禁 `@ts-ignore`、交付代码禁 Node/Bun API |
| `docs/adr` | 设计文档 |

## 文档

- [术语表](CONTEXT.md)
- [交付方式怎么选](docs/adr/0001-delivery-selection.md)
- [什么东西不进核心模型](docs/adr/0002-core-has-no-platform-words.md)
- [为什么 MediaPost 自己持有交付方式](docs/adr/0003-mediapost-owns-delivery.md)
- [代理令牌怎么签](docs/adr/0005-proxy-token.md)

## 开发

在仓库根目录：

```sh
bun run verify:fast   # typecheck(TypeScript 7 原生编译器)+ type-aware oxlint + bun test
bun run verify        # verify:fast + knip + 边界扫描 + astryx doctor
bun run policy        # .verifier/semgrep 策略规则(先 pipx install semgrep)
bun run test:e2e      # 基于构建产物的 Playwright,fixture 链接离线可跑
bun run build         # 构建 Worker
```

每次有效改动后跑 `verify:fast`，宣布完成前跑 `verify` 和 `policy`。`arch` 是模块边界扫描；dependency-cruiser 等它支持 TypeScript 7 的 API 后接入。

## 分享预览

链接预览（Open Graph 与 Twitter 卡片）用的图，在构建时用 `satori` 和 `@resvg/resvg-wasm` 画好，然后提交进仓库。Worker 只把它们当静态文件发出去，自己不画。文案来自 `apps/web/src/i18n.ts`，图标来自 `apps/web/public/logo.svg`。

```sh
bun run generate                           # 重画分享图和图标，再重建路由树
bun run generate:check                     # CI：过期就失败。比的是哈希，不画图
bun run --cwd apps/web og --verify-render  # 仅本地：重画一遍，与已提交的字节逐个比较
bun run --cwd apps/web og:fonts            # 新增了字符时，补取需要的字体切片
```

下面这些是生成出来的文件，不要手改：`apps/web/public/share/` 下的 `og-zh.png`、`og-en.png` 和 `square.png`，`apps/web/public/` 下的 `favicon-32.png` 与 `apple-touch-icon.png`，以及 `apps/web/src/share-assets.gen.ts`（它记着每张图的内容哈希，图片 URL 里的 `?v=` 就是它）。改了文案、logo 或模板之后，运行 `bun run generate` 并提交结果。

中文用 Noto Sans SC，许可证是 SIL Open Font License 1.1。卡片用到的切片随仓库提交，放在 `apps/web/scripts/og/fonts/`，旁边有 `OFL.txt` 和记录校验和的 `fonts.lock.json`。生成器、渲染库和这些字体都只用于构建：边界扫描（`bun run arch`）会拒绝交付代码引用它们，它们也不会进入 `dist`。

## 配置

`FETCHR_PROXY_SECRET` 给下载地址签名。至少 16 个字符，用 `openssl rand -hex 32` 生成，每次部署换一个值。`apps/web/.dev.vars.example` 里该变量留空。

`NODE_ENV` 是 `production` 时，密钥缺失或短于 16 字符会直接抛错。其他环境用内置密钥——别让它进生产。

`TURNSTILE_SECRET` 可选。留空时，超过[限额](#限额)的解析直接拒绝，因为无法校验人机验证。

`VITE_TURNSTILE_SITE_KEY` 是 Turnstile 的公开站点密钥。Vite 在构建时通过 `import.meta.env` 内联它。它是构建输入，和上面的 Worker 密钥是两回事。不配它，页面不出人机验证组件。

## 限额

每个 Worker 实例独立计数。一个地址每分钟可以解析 10 次、下载 60 次，窗口 60 秒。

超过 10 次解析，页面提示「请求太频繁，请稍后再试」。完成 Turnstile 验证后再点一次**解析**即可继续——前提是构建时配了 `VITE_TURNSTILE_SITE_KEY` 且服务端配了 `TURNSTILE_SECRET`。超过 60 次下载，代理返回 HTTP 429 和 `{ "code": "RATE_LIMITED" }`。

缓存只存标题、描述和作者，10 分钟。交付 URL 和文件字节不进缓存。

## 部署

顶部的按钮会克隆这个仓库并部署一个 Worker。按钮 URL 保持在仓库根：

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr
```

`apps/web` 依赖旁边的工作区包。指向 `apps/web` 的地址只会克隆那个目录，包会缺失。Cloudflare 会在部署前询问 `FETCHR_PROXY_SECRET` 和 `TURNSTILE_SECRET`。

部署用 `cf` CLI,读 `apps/web/cloudflare.config.ts`。`apps/web/wrangler.jsonc` 保留,因为 Cloudflare Vite 插件构建时仍读它。

推送到 `main` 会构建 `apps/web` 并发布 `fetchr-web`。Worker 还不存在时，第一次发布执行 `cf deploy`，然后检查线上 Worker。之后的推送会上传一个版本、检查它、把流量切过去，再检查一次线上 Worker。线上检查失败时，这次发布会回滚。

`bun run deploy` 会构建 `apps/web` 并直接执行 `cf deploy`。这条命令跳过 `main` 上使用的版本检查。

在 `apps/web` 里回滚，把上一个版本重新部署到全部流量：

```sh
bunx cf workers deployments list --worker fetchr-web
bunx cf workers deployments create --worker fetchr-web --strategy percentage --versions '[{"version_id":"<上一个版本>","percentage":100}]' --bypass-deployment-checks
```

`main` 上的发布读取这些 GitHub Actions 密钥：

| 密钥 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 能改这个账号 Workers 的令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 id |
| `FETCHR_PROXY_SECRET` | [配置](#配置)里的签名密钥 |

## 安全

本仓库没有安全策略文件。

## 许可

[AGPL-3.0-or-later](LICENSE)。
