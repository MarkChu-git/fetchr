# Fetchr

[中文](README.zh-CN.md)

Fetchr is a Cloudflare Worker that reads a public share link, shows the post, and lets you save the file.

Paste the share text on the page. Fetchr takes the URL out of that text and loads the public post. It stores no login.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

> [!WARNING]
> Version 0.0.0. The workspace packages are private. `extract()` lives in this repository, uses Effect 4.0.0-rc.117, and can change.

## Quick Start

This repository pins Bun 1.4.2. From the repository root:

```sh
bun install
bun run --cwd apps/web dev
```

Open http://127.0.0.1:5173/. Vite uses port 5173 unless that port is already taken.

Local development signs downloads with a built-in key. A production deploy needs the signing key in [Configuration](#configuration).

## Usage

Use the field labeled **粘贴链接**. Paste a URL, or the whole share sentence. Fetchr keeps the `http` or `https` URL, strips zero-width characters, and drops trailing punctuation.

Press **解析**. The post replaces the empty state. Press **下载** to save the file. When picture and audio arrive as two files, press **合成并下载**. The browser combines them and saves `fetchr.mp4`. A DASH playlist shows 这是一份 DASH 清单, and **下载** saves the manifest.

Leave the address bar on this page.

The page names 抖音, 哔哩哔哩, YouTube, and X. The same field also accepts 小红书, Instagram, TikTok, and 快手.

A failure replaces the empty state with one of these messages:

| Situation | Message |
| --- | --- |
| The text has no usable URL, or no extractor matches it | 这个链接不支持 |
| The post is private | 这条内容是私密的 |
| The platform requires a login | 需要登录才能查看 |
| The post cannot be found | 没有找到这条内容 |
| The rate limit is exceeded | 请求太频繁，请稍后再试 |
| Digital rights management (DRM) blocks the file | 这条内容有版权保护，不能下载 |
| The region cannot play it | 这个地区看不了这条内容 |
| Any other failure | 解析失败 |

## Features

Fetchr does the following:

- Douyin public videos and image notes load without a saved login. Short links on `v.douyin.com` work, and so do page URLs whose id is only `modal_id`.
- A Douyin video is saved from the original file (`ratio=default`). If that play id is missing, Fetchr prefers a play URL without `playwm`, and rewrites a `playwm` URL to `play` when no other URL is present. An image note is saved from the last non-webp URL in `url_list`. `download_url_list` stays unread because those URLs carry a watermark.
- Bilibili public videos on `www.bilibili.com` and `m.bilibili.com`, and short links on `b23.tv`. The browser combines separate picture and audio.
- YouTube `/watch` URLs on `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, and `youtube-nocookie.com`, plus `youtu.be` links.
- X and Twitter status URLs on `x.com`, `www.x.com`, `twitter.com`, and `www.twitter.com`, when the post is visible without a login.
- 小红书 `/explore/` and `xhslink.com` links, Instagram `/p/` and `/reel/` posts, TikTok video URLs on `tiktok.com` and `vm.tiktok.com`, and 快手 URLs on `v.kuaishou.com` and `www.kuaishou.com/short-video/`.
- One Worker, named `fetchr-web`. It keeps no media file and runs no transcoder.
- An HMAC-SHA256 download token when the browser cannot attach the headers the file host requires. The token expires after 5 minutes. A token that fails verification gets the response 下载链接无效.

## How It Works

```text
Page
  ↓
Worker
  ↓
extract(url, transport, extractors)
  ↓
Platform package
  ↓
Upstream
```

`extract` in `packages/core/src/extract.ts` is the extraction entry. The caller passes the pasted text, a `Transport`, and the extractor list. Each platform package matches its own URLs and returns a `MediaPost`.

```ts
export function extract(
  url: string,
  transport: Transport,
  extractors: readonly Extractor[],
): Effect.Effect<MediaPost, ExtractFailure>
```

Each media file carries one delivery:

- `direct`: the browser fetches the file. When that delivery also carries headers, the Worker signs a proxy token before the browser sees the post.
- `mux`: the browser reads separate picture and audio, then writes one mp4. When those URLs carry headers, the browser receives a same-origin `/download/{token}` URL and still combines the bytes on the device.
- `proxy`: the Worker fetches the file and streams it. A URL sent by the caller is ignored.
- `playlist`: a manifest URL. The protocol field is `hls` or `dash`. Bilibili emits `dash` when the separate streams cannot be combined in the browser. The page saves that manifest.

## Repository Structure

| Directory | Purpose |
| --- | --- |
| `apps/web` | The page and the `fetchr-web` Worker |
| `packages/core` | The `MediaPost` model and `extract()` |
| `packages/delivery` | HMAC proxy tokens and public URL checks |
| `packages/media-browser` | Browser mux of separate picture and audio |
| `packages/platform/*` | One package per platform. `fixture` is a test extractor |
| `scripts/ci` | The Worker publish script and pinned scanner installers |
| `docs/adr` | Design notes, written in Chinese |

## Documentation

The design notes are in Chinese:

- [Glossary](CONTEXT.md)
- [How a delivery is chosen](docs/adr/0001-delivery-selection.md)
- [What stays out of the core model](docs/adr/0002-core-has-no-platform-words.md)
- [Why a MediaPost carries its own delivery](docs/adr/0003-mediapost-owns-delivery.md)
- [How the proxy token is signed](docs/adr/0005-proxy-token.md)

## Development

From the repository root:

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

`bun run lint` runs oxlint and denies warnings. `bun run typecheck` checks this repository, `scripts/ci`, and `apps/web`. `bun test` runs the tests. `bun run build` builds the Worker.

## Configuration

`FETCHR_PROXY_SECRET` signs download URLs. Use at least 16 characters. Generate a value with `openssl rand -hex 32`, and use a different value for each deploy. `apps/web/.dev.vars.example` leaves the variable empty.

When `NODE_ENV` is `production`, signing throws if the value is missing or shorter than 16 characters. Otherwise a missing or short value uses a built-in key. Keep that key out of production.

`TURNSTILE_SECRET` is optional. With an empty secret, an extract over the [limit](#limits) is refused, because the challenge cannot be verified.

`VITE_TURNSTILE_SITE_KEY` is the public Turnstile site key. Vite inlines it from the environment at build time through `import.meta.env`. It is a build input, separate from the Worker secrets above. With no site key, the page shows no challenge widget.

## Limits

Each Worker isolate keeps its own counts. One address can run 10 extracts and 60 downloads per minute. The window is 60 seconds.

Past 10 extracts, the page shows 请求太频繁，请稍后再试. Solve the Turnstile widget and press **解析** again. That request continues when `VITE_TURNSTILE_SITE_KEY` was set at build time and `TURNSTILE_SECRET` is set. Past 60 downloads, the proxy returns HTTP 429 and `{ "code": "RATE_LIMITED" }`.

The cache stores the title, description, and author for 10 minutes. Delivery URLs and file bytes stay out of the cache.

## Deploy

The button at the top clones this repository and deploys one Worker. Keep its URL on the repository root:

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr
```

`apps/web` depends on the workspace packages beside it. A URL that points at `apps/web` clones that directory alone, so those packages are absent. Cloudflare asks for `FETCHR_PROXY_SECRET` and `TURNSTILE_SECRET` before the deploy.

A push to `main` builds `apps/web` and publishes `fetchr-web`. The first publish, when the Worker does not exist yet, runs `wrangler deploy` and then checks the live Worker. Later pushes upload a version, check that version, shift traffic to it, and check the live Worker again. A failed live check rolls that publish back.

`bun run deploy` builds `apps/web` and runs `wrangler deploy` directly. That command skips the version check used on `main`.

To roll back from `apps/web`:

```sh
bunx wrangler rollback
```

The `main` publish reads these GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token that can edit Workers on the account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `FETCHR_PROXY_SECRET` | Signing key from [Configuration](#configuration) |

## Security

This repository has no security policy.

## License

This repository has no license file.
