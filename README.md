# Fetchr

[中文](README.zh-CN.md)

Fetchr is a Cloudflare Worker that reads a public share link, shows the post, and lets you save the file.

Paste the share text on the page. Fetchr takes the URL out of that text and loads the public post. It stores no login.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

Releases follow semver. A `vX.Y.Z` tag builds, tests, and publishes a GitHub release. See [Releases](https://github.com/MarkChu-git/fetchr/releases).

## Quick Start

This repository pins Bun 1.4.2. From the repository root:

```sh
bun install
bun run --cwd apps/web dev
```

Open http://127.0.0.1:5173/. Vite uses port 5173 unless that port is already taken.

Local development signs downloads with a built-in key. A production deploy needs the signing key in [Configuration](#configuration).

## Usage

The page opens in Chinese. **中文** and **EN** in the top bar switch the language. English also opens at `?lang=en`. The choice is stored in a cookie, so a later download error uses the same language.

Use the field labeled **Paste link**. Paste a URL, or the whole share sentence. Fetchr keeps the `http` or `https` URL, strips zero-width characters, and drops trailing punctuation.

Press **Extract**. The post replaces the empty state. Saving works like this:

- **下载 / Download** opens the quality menu. The first item is the original file with its dimensions and exact size. Douyin videos also list the platform's own renditions (720p, 540p) with an estimated size. The original of a short clip can be thirty times larger than a rendition.
- **保存到相册 / Save to Photos** appears on phones that can share files. It sends the file to the OS share sheet, in the quality you pick.
- **全部下载 / Download all** appears when a post has more than one file. It packs every original into one zip in the browser.
- When picture and audio arrive as two files, press **Combine and download**. The browser combines them and saves an mp4. A DASH playlist shows a manifest note, and **Download** saves the manifest.

Leave the address bar on this page.

The page names Douyin, Bilibili, YouTube, and X. The same field also accepts Xiaohongshu, Instagram, TikTok, and Kuaishou.

A failure replaces the empty state with one of these messages:

| Situation | Message |
| --- | --- |
| The text has no usable URL, or no extractor matches it | This link is not supported |
| The post is private | This post is private |
| The platform requires a login | You need to sign in to view this |
| The post cannot be found | This post was not found |
| The page has no downloadable media data | This page has nothing to download |
| The upstream blocked the request | The upstream blocked this request |
| The page data format changed | The page data format changed |
| The link did not resolve | This link did not resolve |
| The upstream sent no usable page | The upstream sent no usable page |
| The upstream timed out | The upstream did not respond in time |
| The rate limit is exceeded | Too many requests. Try again in a moment. |
| Digital rights management (DRM) blocks the file | This post is protected and cannot be downloaded |
| The region cannot play it | This region cannot play this post |
| Any other failure | Could not parse this link |

## Features

Fetchr does the following:

- Douyin videos and image notes both load without a saved login. The public feed answers only when the request carries the full client parameter set; with it, the feed returns the target work, videos and image notes alike. Short links on `v.douyin.com` resolve, including codes with `-` and `_`. A page URL whose id is only `modal_id` resolves, and the canonical URL becomes a `/note/` link when the work is an image note.
- A Douyin video saves the original (`ratio=default`) by default, with the platform's own 720p and 540p renditions as smaller choices. An image note is saved from the last browser-safe URL in `url_list`, skipping webp previews and HEIC live-photo stills. `download_url_list` stays unread because those URLs carry a watermark.
- Bilibili public videos on `www.bilibili.com` and `m.bilibili.com`, and short links on `b23.tv`. The browser combines separate picture and audio.
- YouTube `/watch` URLs on `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, and `youtube-nocookie.com`, plus `youtu.be` links.
- X and Twitter status URLs on `x.com`, `www.x.com`, `twitter.com`, and `www.twitter.com`, when the post is visible without a login.
- 小红书 `/explore/` and `xhslink.com` links, Instagram `/p/` and `/reel/` posts, TikTok links on `tiktok.com` (`www`, `m`, `vm`, `vt`), including `/t/` short links and `@user/video` or `@user/photo` paths, and 快手 URLs on `v.kuaishou.com` and `www.kuaishou.com/short-video/`.
- One Worker, named `fetchr-web`. It keeps no media file and runs no transcoder.
- An HMAC-SHA256 download token when the browser cannot attach the headers the file host requires. The token expires after 30 minutes. A token that fails verification returns "This download link is not valid" on the English page and 「下载链接无效」 on the Chinese page.

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
| `tests/e2e` | Playwright end-to-end tests over the preview server |
| `.verifier/semgrep` | Policy rules: no `any`, no `@ts-ignore`, no Node/Bun imports in shipped source |
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
bun run verify:fast   # typecheck (TypeScript 7, native) + type-aware oxlint + bun test
bun run verify        # verify:fast + knip + boundary scan + astryx doctor
bun run policy        # Semgrep rules in .verifier/semgrep (pipx install semgrep)
bun run test:e2e      # Playwright over the built preview, offline fixtures
bun run build         # build the Worker
```

Run `verify:fast` after every meaningful change. Run `verify` and `policy` before calling a task done. `arch` is the module boundary scan; dependency-cruiser joins once it supports the TypeScript 7 API.

## Share Previews

The images behind link previews (Open Graph and Twitter cards) are drawn at build time with `satori` and `@resvg/resvg-wasm`, then committed. The Worker serves them as plain static files and never draws anything. The text comes from `apps/web/src/i18n.ts` and the mark from `apps/web/public/logo.svg`.

```sh
bun run generate                           # redraw the share images and icons, then rebuild the route tree
bun run generate:check                     # CI: fail when they are stale. Compares hashes, draws nothing
bun run --cwd apps/web og --verify-render  # local only: draw again and compare with the committed bytes
bun run --cwd apps/web og:fonts            # fetch the font slices a new character needs
```

Never edit the generated files by hand: `apps/web/public/share/og-zh.png`, `og-en.png` and `square.png`, `apps/web/public/favicon-32.png` and `apple-touch-icon.png`, and `apps/web/src/share-assets.gen.ts`, which records the content hash that each image URL carries as `?v=`. After changing the copy, the logo or a template, run `bun run generate` and commit the result.

The Chinese text is set in Noto Sans SC, licensed under the SIL Open Font License 1.1. The slices the cards need are committed in `apps/web/scripts/og/fonts/`, next to `OFL.txt` and `fonts.lock.json`, which holds their checksums. The generator, the renderers and these fonts are build tools. The boundary scan (`bun run arch`) rejects shipped source that imports them, and none of them reaches `dist`.

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

Deploys use the `cf` CLI with `apps/web/cloudflare.config.ts`. `apps/web/wrangler.jsonc` stays because the Cloudflare Vite plugin still reads it at build time.

A push to `main` builds `apps/web` and publishes `fetchr-web`. The first publish, when the Worker does not exist yet, runs `cf deploy` and then checks the live Worker. Later pushes upload a version, check that version, shift traffic to it, and check the live Worker again. A failed live check rolls that publish back.

`bun run deploy` builds `apps/web` and runs `cf deploy` directly. That command skips the version check used on `main`.

To roll back from `apps/web`, deploy the previous version again:

```sh
bunx cf workers deployments list --worker fetchr-web
bunx cf workers deployments create --worker fetchr-web --strategy percentage --versions '[{"version_id":"<previous>","percentage":100}]' --bypass-deployment-checks
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

[AGPL-3.0-or-later](LICENSE).
