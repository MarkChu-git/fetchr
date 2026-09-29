# Fetchr

[English](README.md)

贴一条公开分享链接。Fetchr 在页面上显示这条内容，并给出可保存的文件。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

这个按钮把本仓库克隆到你的 GitHub 或 GitLab 账号。Cloudflare 按[配置](#配置)询问密钥，然后部署一个 Worker。本仓库公开之后，别人才能使用这个按钮。链接保持在仓库根目录。`apps/web` 需要旁边的包。指向 `apps/web` 的链接只会克隆那个目录，旁边的包不会进来。

## 使用页面

可以贴 URL，也可以贴整段分享文案：

1. 打开 Fetchr 页面。
2. 贴进 **粘贴链接**。紧挨短链的文字不算进地址。
3. 按 **解析**。
4. 看预览，再按 **下载**。

贴在页面上的输入框里。地址栏只放 Fetchr 自己的地址。

页面列出这些来源：

- 抖音的公开视频和图文不需要保存登录态。分享文案可以解析。只有 `modal_id` 的网页地址也可以。
- 哔哩哔哩的公开视频可以播放。画面和声音分开时，由你的浏览器合成。
- YouTube 的公开视频可以播放。
- X 在帖子对未登录访客可见时可以播放。

小红书、Instagram、TikTok、快手在网站要求登录或验证码时返回错误。

页面显示其中一条：

| 情况 | 文案 |
| --- | --- |
| 这条链接不是 Fetchr 能读的公开帖子 | 这个链接不支持 |
| 帖子是私密的 | 这条内容是私密的 |
| 平台要求登录 | 需要登录才能查看 |
| 找不到这条内容 | 没有找到这条内容 |
| 请求太多 | 请求太频繁，请稍后再试 |
| 数字版权管理（DRM）或版权限制 | 这条内容有版权保护，不能下载 |
| 当前地区不能播放 | 这个地区看不了这条内容 |
| 抓取失败 | 解析失败 |

## 在本机运行

安装依赖，然后启动开发服务器：

```sh
bun install
bun run --cwd apps/web dev
```

打开 http://127.0.0.1:5174/。

`bun run lint` 运行 oxlint。`bun run typecheck` 检查类型。`bun test` 运行测试。`bun run build` 构建 Worker。

## 配置

生产环境要先有 `FETCHR_PROXY_SECRET`，才会给下载地址签名。值缺失或短于 16 个字符时，Fetchr 拒绝启动代理。用 `openssl rand -hex 32` 生成，每次部署换一个新值。`.dev.vars.example` 把这项留空。本地开发用内置值启动。不要把这个值复制到生产环境。

`TURNSTILE_SECRET` 可选。密钥为空时，Fetchr 拒绝超过限额的请求。

`VITE_TURNSTILE_SITE_KEY` 是公开站点密钥。Vite 在构建时从 `import.meta.env` 读取。把它设成 Workers Builds 的构建变量，或写进 Vite 能读到的本地文件。它不是 Worker 运行时密钥。没有这个密钥时，页面不显示验证组件。超额请求仍然被拒绝。

## 部署

推送到 `main` 会构建 `apps/web` 并发布 Worker。Worker 已经存在之后，后续推送会先检查新版本，再替换正在运行的版本。在 `apps/web` 里回滚：

```sh
bunx wrangler rollback
```

部署需要这些仓库密钥：

| 密钥 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 可以编辑该账号 Workers 的 token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 id |
| `FETCHR_PROXY_SECRET` | [配置](#配置)里的签名密钥 |

## 边界

Fetchr 读取公开帖子。DRM、登录墙、验证码、私密账号或付费内容会返回上表中的一条文案。Worker 不做转码。这一版不把媒体存进 R2。

每个 Worker 每分钟允许 10 次解析、60 次下载。Fetchr 把帖子文字缓存 10 分钟，不缓存文件字节。

浏览器自己取不到文件时，由 Worker 把文件流传过去。Fetchr 给地址签名。浏览器不能指定上游地址。画面和声音分成两个文件时，由浏览器合成。
