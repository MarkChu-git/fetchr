# Fetchr

[English](README.md)

Fetchr 把一条公开的社交链接变成页面上的预览，以及一份可以保存的文件。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

这个按钮就是模板。Cloudflare 把本仓库克隆到访问者自己的 GitHub 或 GitLab 账号里，按[配置](#配置)询问密钥，再用 Workers Builds 部署成一个 Worker。仓库公开之后，别的人才能使用这个按钮。链接指向仓库根目录，因为 `apps/web` 依赖旁边的 workspace 包。如果按钮指向 `apps/web`，克隆出来的只有那个子目录，这些包会丢掉。

合并进 `main` 是另一条路。GitHub Actions 部署的是**这个**仓库的 Worker。按钮部署的是别人账号里的一份副本。

## 它做什么

贴一条公开分享链接，或者整段分享文案。Fetchr 解析出帖子并显示在页面上。视频用浏览器自带的播放器。图文打开成画廊。每个文件都可以下载。

页面上列出的是抖音、哔哩哔哩、YouTube 和 X。

- 抖音的公开视频和图文不需要保存登录态。应用分享文案，以及网页上只带 `modal_id` 的复制地址，都可以解析。
- 哔哩哔哩的公开视频可以解析。画面和声音分开时，由浏览器在设备上合成。
- YouTube 的公开视频可以解析。
- X 的公开帖子，在平台愿意把内容返回给未登录访客时，可以解析。

仓库里还有小红书、Instagram、TikTok、快手的提取器。平台返回登录墙或验证码时，Fetchr 给出明确的错误并停下来。

页面上的说法：

| 情况 | 文案 |
| --- | --- |
| 这条链接不是 Fetchr 能读的公开帖子 | 这个链接不支持 |
| 帖子是私密的 | 这条内容是私密的 |
| 平台要求登录 | 需要登录才能查看 |
| 找不到这条内容 | 没有找到这条内容 |
| 请求太多 | 请求太频繁，请稍后再试 |
| DRM 或版权限制 | 这条内容有版权保护，不能下载 |
| 当前地区不能播放 | 这个地区看不了这条内容 |
| 抓取失败 | 解析失败 |

## 怎么用

1. 打开 Fetchr 页面。
2. 把分享文案或 URL 贴进「粘贴链接」。整段文案可以直接贴。紧挨着短链的文字不会被算进地址。
3. 按「解析」。
4. 看预览，再按「下载」。

贴到页面上的输入框里。浏览器地址栏只放 Fetchr 自己的地址。

## 部署这个仓库

这个产品是一个 Cloudflare Worker。合并到 `main` 之后会构建 `apps/web` 并执行 `wrangler deploy`。切换是一次 Worker 版本发布。在 `apps/web` 里回滚：

```sh
bunx wrangler rollback
```

工作流随后写入 `FETCHR_PROXY_SECRET`，并请求部署出来的 `*.workers.dev` 首页，直到正文里出现「粘贴链接」。

这个工作流用到的仓库密钥：

| 密钥 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 可以编辑该账号 Workers 的 API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 id |
| `FETCHR_PROXY_SECRET` | HMAC 密钥，至少 16 个字符 |

Deploy 不是 pull request 的必过检查。缺 token 不会挡住代码评审。

使用按钮时，Workers Builds 的根目录保持在仓库根。根上的 `build` 和 `deploy` 脚本会在装好 workspace 之后进入 `apps/web`。

## 本地开发

Bun 是本地工具链。部署之后的运行时是 Worker。

```sh
bun install
bun run --cwd apps/web dev
```

打开 http://127.0.0.1:5174/。

`bun run typecheck` 检查包和网页应用。`bun test` 跑测试。`bun run build` 构建 Worker。

## 配置

`FETCHR_PROXY_SECRET` 用来给下载地址签名。生产环境里，这个值缺失或短于 16 个字符时，代理会拒绝启动。用 `openssl rand -hex 32` 生成，每次部署用不同的值。`.dev.vars.example` 故意留空。本地开发用内置的开发值，这样页面可以在没有密钥时启动。不要把开发值带到生产。

`TURNSTILE_SECRET` 可选。留空时，超过限额的请求会被拒绝。

`VITE_TURNSTILE_SITE_KEY` 是构建时读取的公开站点密钥，来自 `import.meta.env`。把它设成 Workers Builds 的构建变量，或写进 Vite 能读到的本地 env 文件。它不是 Worker 运行时密钥。没有它时，页面不显示验证组件，超额请求仍然被拒绝。

## 流水线

| 检查 | 何时运行 | 做什么 |
| --- | --- | --- |
| `verify` | pull request，以及推送到 `main` | 锁定版本安装、类型检查、测试、构建 Worker |
| `branch-name` | pull request | 头分支形如 `feat/public-media`，或以前缀 `dependabot/` 开头 |
| `codeql` | pull request、推送到 `main`、每周一 | 分析 JavaScript 和 TypeScript |
| `deploy` | 推送到 `main`，以及手动触发 | 部署 Worker，并做首页冒烟检查 |

pull request 要先通过 `verify` 和 `branch-name` 才能合并。`codeql` 在这个仓库上真的能跑过之后，才会变成必过检查。Deploy 在合并之后运行。

## 分支和合并

`main` 保持可以部署。改动通过 pull request 进入。

```
feat/public-media
fix/paste-label
```

前缀是 `feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`、`perf`、`ci`、`revert`、`build`、`hotfix` 之一。后面是用 `-` 或 `/` 分开的小写单词。

合并进 `main` 只允许 squash。必过检查要通过。需要两个批准的 reviewer。只有仓库 owner 可以绕过这些规则。协作者只有一个人时，要合并自己的 pull request，就得使用这个绕过，或者再加 reviewer。对 `main` 的强制推送，以及删除 `main`，都会被拒绝。

## 架构

`extract(url)` 返回一份 `MediaPost`。平台代码只放在 `packages/platform/*`。网页应用是一个 Worker。

一份帖子说明每个文件怎么交给用户：

- **Direct。** 浏览器自己就能取到文件。
- **Mux。** 画面和声音是分开的。浏览器两边都读，在设备上合成。Worker 不做转码。
- **Proxy。** 浏览器自己取不到文件，由 Worker 把上游流转过去。地址由 Worker 签名。浏览器不能自己指定上游。这不是开放代理。
- **Playlist。** 媒体是一份 HLS 或 DASH 清单。清单和分片沿用同一条 Direct 或 Proxy 规则。

限额记在每个 Worker 实例自己的内存里：每分钟 10 次解析，每分钟 60 次下载。文字元数据缓存 10 分钟。媒体字节不进缓存。

平台返回的外部 JSON 用 Effect Schema 解码。

## 边界

Fetchr 只读公开媒体。DRM、登录墙、验证码、私密账号和付费内容会返回明确的错误。Worker 不做转码，这一版也不把媒体存进 R2。
