# Fetchr

[中文](README.zh-CN.md)

Paste a public share link. Fetchr shows the post and gives you the file.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

The button clones this repository into your GitHub or GitLab account. Cloudflare asks for the secrets in [Configuration](#configuration), then deploys one Worker. Other people can use the button after this repository is public. Leave the URL on the repository root. `apps/web` needs the packages beside it. A URL for `apps/web` clones that directory alone and omits those packages.

## Use the page

Paste a URL, or the whole share sentence:

1. Open the Fetchr page.
2. Paste into **粘贴链接**. Characters written against a short link stay out of the URL.
3. Press **解析**.
4. Watch the preview, then press **下载**.

Use the field on the page. The address bar is Fetchr's own address.

The page lists these sources:

- 抖音 public video and image notes need no saved login. Share text works. A page URL that only has `modal_id` works.
- 哔哩哔哩 public video plays. Your browser combines separate picture and audio.
- YouTube public video plays.
- X plays when the post is visible without a login.

小红书, Instagram, TikTok, and 快手 return an error when the site requires a login or a captcha.

The page shows one of these messages:

| Situation | Message |
| --- | --- |
| The link is not a public post Fetchr can read | 这个链接不支持 |
| The post is private | 这条内容是私密的 |
| The platform wants a login | 需要登录才能查看 |
| The post is missing | 没有找到这条内容 |
| Too many requests | 请求太频繁，请稍后再试 |
| Digital rights management (DRM) or a rights block | 这条内容有版权保护，不能下载 |
| The region cannot play it | 这个地区看不了这条内容 |
| The fetch failed | 解析失败 |

## Run it on your machine

Install dependencies, then start the dev server:

```sh
bun install
bun run --cwd apps/web dev
```

Open http://127.0.0.1:5174/.

`bun run typecheck` checks types. `bun test` runs the tests. `bun run build` builds the Worker.

## Configuration

Set `FETCHR_PROXY_SECRET` so production can sign download URLs. Fetchr refuses the proxy when the value is missing or shorter than 16 characters. Generate a value with `openssl rand -hex 32`, and use a new value for each deploy. `.dev.vars.example` leaves it empty. Local development starts with a built-in value. Do not copy that value into production.

`TURNSTILE_SECRET` is optional. With an empty secret, Fetchr refuses requests over the rate limit.

`VITE_TURNSTILE_SITE_KEY` is a public site key. Vite reads it at build time from `import.meta.env`. Set it as a Workers Builds build variable, or in a local file Vite reads. It is not a Worker runtime secret. Without the key, the page shows no challenge widget. Fetchr still refuses requests over the limit.

## Deploy

A push to `main` builds `apps/web` and runs `wrangler deploy`. The publish replaces the live Worker. From `apps/web`, roll back with:

```sh
bunx wrangler rollback
```

Store these repository secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token that can edit Workers on this account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `FETCHR_PROXY_SECRET` | Signing key from [Configuration](#configuration) |

## Limits

Fetchr reads public posts. DRM, a login wall, a captcha, a private account, or paid content returns a message from the table above. The Worker does not transcode. This version does not store media in R2.

Each Worker allows 10 extracts per minute and 60 downloads per minute. Fetchr caches post text for 10 minutes and does not cache file bytes.

When your browser cannot fetch a file, the Worker streams it. Fetchr signs the URL. The browser cannot set the upstream address. When picture and audio arrive as two files, the browser combines them.
