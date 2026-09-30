# Fetchr

[English](README.md)

Fetchr 是一个 Cloudflare Worker。它读取公开分享链接，在页面上显示帖子，并让你保存文件。

把分享文案贴进页面。Fetchr 从文案里取出 URL，再读取公开帖子。它不保存登录态。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

> [!WARNING]
> 版本 0.0.0。工作区里的包是私有的。`extract()` 在本仓库内，使用 Effect 4.0.0-rc.117，接口可能改变。

## 快速开始

本仓库固定 Bun 1.4.2。在仓库根目录执行：

```sh
bun install
bun run --cwd apps/web dev
```

打开 http://127.0.0.1:5173/。5173 被占用时，Vite 会换一个端口。

本地开发用内置密钥给下载地址签名。生产部署需要[配置](#配置)里的签名密钥。

## 使用页面

输入框的标签是 **粘贴链接**。可以贴 URL，也可以贴整段分享文案。Fetchr 保留其中的 `http` 或 `https` 地址，去掉零宽字符，并去掉末尾标点。

按 **解析**。帖子会换掉空白状态。按 **下载** 保存文件。画面和声音分成两个文件时，按 **合成并下载**。浏览器合成后保存 `fetchr.mp4`。DASH 播放列表会显示「这是一份 DASH 清单」，**下载** 保存的是这份清单。

地址栏保持在这个页面上。

页面上列出的来源是抖音、哔哩哔哩、YouTube 和 X。同一个输入框也接受小红书、Instagram、TikTok 和快手。

失败时，空白状态换成下面的一条文案：

| 情况 | 文案 |
| --- | --- |
| 文案里没有可用地址，或没有提取器能匹配 | 这个链接不支持 |
| 帖子是私密的 | 这条内容是私密的 |
| 平台要求登录 | 需要登录才能查看 |
| 找不到这条内容 | 没有找到这条内容 |
| 页面里没有可下载的媒体数据 | 页面里没有可下载的内容 |
| 上游拦截了这次请求 | 上游暂时拦截了这次请求 |
| 页面数据格式变了 | 页面数据格式变了 |
| 链接没有解析成功 | 这个链接没有解析成功 |
| 上游没有返回可用页面 | 上游没有返回可用页面 |
| 上游没有及时响应 | 上游没有及时响应 |
| 超过限额 | 请求太频繁，请稍后再试 |
| 数字版权管理（DRM）拦截了文件 | 这条内容有版权保护，不能下载 |
| 当前地区不能播放 | 这个地区看不了这条内容 |
| 其他失败 | 解析失败 |

## 能力

Fetchr 做这些事：

- 抖音的公开视频和图文不保存登录态也能读取。`v.douyin.com` 短链可以解析。页面地址只带 `modal_id` 时也可以。
- 抖音视频保存的是原文件（`ratio=default`）。没有这个播放 id 时，Fetchr 优先使用不含 `playwm` 的播放地址。只有 `playwm` 地址时，把它改成 `play`。图文保存 `url_list` 里最后一个非 webp 地址。`download_url_list` 不读取，因为那些地址带水印。
- 哔哩哔哩的公开视频来自 `www.bilibili.com` 和 `m.bilibili.com`，短链来自 `b23.tv`。画面和声音分开时，由浏览器合成。
- YouTube 的 `/watch` 地址包括 `www.youtube.com`、`m.youtube.com`、`music.youtube.com` 和 `youtube-nocookie.com`，另外还有 `youtu.be` 链接。
- X 和 Twitter 的状态地址在 `x.com`、`www.x.com`、`twitter.com` 和 `www.twitter.com` 上。帖子对未登录访客可见时可以读取。
- 小红书的 `/explore/` 与 `xhslink.com`，Instagram 的 `/p/` 与 `/reel/`，TikTok 在 `tiktok.com`（含 `www`、`m`、`vm`、`vt`）上的地址，包括 `/t/` 短链和 `@user/video`、`@user/photo` 路径，以及快手在 `v.kuaishou.com` 和 `www.kuaishou.com/short-video/` 上的地址。
- 一个 Worker，名称是 `fetchr-web`。它不保存媒体文件，也不做转码。
- 浏览器附不上文件主机要求的请求头时，下载地址是 HMAC-SHA256 令牌。令牌 5 分钟后过期。校验失败的令牌会得到响应「下载链接无效」。

## 工作方式

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

`packages/core/src/extract.ts` 里的 `extract` 是解析入口。调用方传入粘贴文本、一个 `Transport`，以及提取器列表。每个平台包匹配自己的 URL，并返回一份 `MediaPost`。

```ts
export function extract(
  url: string,
  transport: Transport,
  extractors: readonly Extractor[],
): Effect.Effect<MediaPost, ExtractFailure>
```

每段媒体带一种交付方式：

- `direct`：浏览器自己取文件。这份交付还带请求头时，Worker 会先签一个代理令牌，再把帖子交给浏览器。
- `mux`：浏览器读取分开的画面和声音，再写成一个 mp4。这些地址带请求头时，浏览器拿到的是同源的 `/download/{token}`，合成仍在设备上完成。
- `proxy`：Worker 取文件并流转给浏览器。调用方另外传来的地址会被忽略。
- `playlist`：一份清单地址。协议字段是 `hls` 或 `dash`。分开的流无法在浏览器里合成时，哔哩哔哩返回 `dash`。页面保存的是这份清单。

## 仓库结构

| 目录 | 作用 |
| --- | --- |
| `apps/web` | 页面和 `fetchr-web` Worker |
| `packages/core` | `MediaPost` 模型和 `extract()` |
| `packages/delivery` | HMAC 代理令牌和公开地址检查 |
| `packages/media-browser` | 在浏览器里合成分开的画面和声音 |
| `packages/platform/*` | 每个平台一个包。`fixture` 是测试用提取器 |
| `scripts/ci` | Worker 发布脚本和固定版本的扫描器安装脚本 |
| `docs/adr` | 设计笔记，正文是中文 |

## 文档

设计笔记是中文：

- [词汇表](CONTEXT.md)
- [交付方式怎么选](docs/adr/0001-delivery-selection.md)
- [哪些词不进核心模型](docs/adr/0002-core-has-no-platform-words.md)
- [为什么 MediaPost 自己带着交付方式](docs/adr/0003-mediapost-owns-delivery.md)
- [代理令牌怎么签名](docs/adr/0005-proxy-token.md)

## 开发

在仓库根目录执行：

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

`bun run lint` 运行 oxlint，警告也算失败。`bun run typecheck` 检查本仓库、`scripts/ci` 和 `apps/web`。`bun test` 运行测试。`bun run build` 构建 Worker。

## 配置

`FETCHR_PROXY_SECRET` 给下载地址签名。至少 16 个字符。用 `openssl rand -hex 32` 生成，每次部署换一个新值。`apps/web/.dev.vars.example` 把这项留空。

`NODE_ENV` 为 `production` 时，值缺失或短于 16 个字符，签名会抛错。其他环境遇到缺失或过短的值，会使用内置密钥。内置密钥只留在本地开发。

`TURNSTILE_SECRET` 可选。密钥为空时，超过[限额](#限额)的解析会被拒绝，因为挑战无法通过校验。

`VITE_TURNSTILE_SITE_KEY` 是公开的 Turnstile 站点密钥。Vite 在构建时从环境变量读入，经 `import.meta.env` 写进页面。它是构建输入，和上面的 Worker 密钥分开。没有站点密钥时，页面不显示验证组件。

## 限额

每个 Worker isolate 各自计数。一个地址每分钟可以解析 10 次、下载 60 次。窗口是 60 秒。

解析超过 10 次时，页面显示「请求太频繁，请稍后再试」。完成 Turnstile 组件后，再按一次 **解析**。构建时设置了 `VITE_TURNSTILE_SITE_KEY`，并且设置了 `TURNSTILE_SECRET`，这次请求会继续。下载超过 60 次时，代理返回 HTTP 429 和 `{ "code": "RATE_LIMITED" }`。

缓存保存标题、简介和作者，时间是 10 分钟。交付地址和文件字节不进缓存。

## 部署

页首的按钮会克隆本仓库，并部署一个 Worker。按钮地址保持在仓库根目录：

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr
```

`apps/web` 依赖旁边的工作区包。指向 `apps/web` 的地址只会克隆那个目录，这些包不会进来。Cloudflare 会先询问 `FETCHR_PROXY_SECRET` 和 `TURNSTILE_SECRET`，再部署。

推送到 `main` 会构建 `apps/web` 并发布 `fetchr-web`。Worker 还不存在时，第一次发布执行 `wrangler deploy`，然后检查线上 Worker。之后的推送会上传一个版本、检查它、把流量切过去，再检查一次线上 Worker。线上检查失败时，这次发布会回滚。

`bun run deploy` 会构建 `apps/web` 并直接执行 `wrangler deploy`。这条命令跳过 `main` 上使用的版本检查。

在 `apps/web` 里回滚：

```sh
bunx wrangler rollback
```

`main` 上的发布读取这些 GitHub Actions 密钥：

| 密钥 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 可以编辑该账号 Workers 的 token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 id |
| `FETCHR_PROXY_SECRET` | [配置](#配置)里的签名密钥 |

## 安全

本仓库没有安全策略。

## 许可证

本仓库没有许可证文件。
