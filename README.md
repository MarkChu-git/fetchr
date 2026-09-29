# Fetchr

[中文](README.zh-CN.md)

Fetchr turns a public social link into a preview you can watch on the page and a file you can save.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MarkChu-git/fetchr)

That button is a template. Cloudflare clones this repository into the visitor's GitHub or GitLab account, asks for the secrets in [Configuration](#configuration), and deploys a Worker with Workers Builds. Other people can use the button only when this repository is public. The link points at the repository root, because `apps/web` depends on the workspace packages beside it. A button pointed at `apps/web` would clone that directory alone and drop those packages.

Merging into `main` is a separate path. GitHub Actions deploys this repository's Worker. The button deploys a copy in someone else's account.

## What it does

Paste a public share link, or the whole share sentence. Fetchr resolves the post and shows it on the page. Video plays in the browser's own player. An image post opens as a gallery. Each file has a download.

The page lists 抖音, 哔哩哔哩, YouTube, and X.

- Douyin public video and image notes resolve with no saved login. That includes the app share sentence, and a web copy that only carries `modal_id`.
- Bilibili public videos resolve, including a split picture and audio track that the browser muxes on the device.
- YouTube public videos resolve.
- X public posts resolve when the platform returns them to a logged-out viewer.

Xiaohongshu, Instagram, TikTok, and Kuaishou extractors are in the repository. When a platform answers with a login wall or a captcha, Fetchr returns a typed error and stops.

The page says:

| Situation | Message |
| --- | --- |
| The link is not a public post Fetchr can read | 这个链接不支持 |
| The post is private | 这条内容是私密的 |
| The platform wants a login | 需要登录才能查看 |
| The post is missing | 没有找到这条内容 |
| Too many requests | 请求太频繁，请稍后再试 |
| DRM or a rights block | 这条内容有版权保护，不能下载 |
| The region cannot play it | 这个地区看不了这条内容 |
| The fetch failed | 解析失败 |

## How to use

1. Open the Fetchr page.
2. Paste the share sentence or the URL into 粘贴链接. The whole sentence is fine. Words glued to a short link are left out of the URL.
3. Press 解析.
4. Watch the preview, then press 下载.

Paste into the input on the page. The browser address bar is only the address of Fetchr itself.

## Deploy this repository

This product is one Cloudflare Worker. A merge to `main` builds `apps/web` and runs `wrangler deploy`. The cutover is one Worker version. Roll back from `apps/web` with:

```sh
bunx wrangler rollback
```

The workflow then stores `FETCHR_PROXY_SECRET` and requests the deployed `*.workers.dev` homepage until the body contains 粘贴链接.

Repository secrets for that workflow:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token that can edit this account's Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `FETCHR_PROXY_SECRET` | HMAC key, at least 16 characters |

Deploy is not a pull-request check. A missing token does not block review.

When using the button, leave the Workers Builds root directory at the repository root. The root `build` and `deploy` scripts enter `apps/web` after the workspace is installed.

## Local development

Bun is the local toolchain. The deployed runtime is the Worker.

```sh
bun install
bun run --cwd apps/web dev
```

Open http://127.0.0.1:5174/.

`bun run typecheck` checks the packages and the web app. `bun test` runs the suite. `bun run build` builds the Worker.

## Configuration

`FETCHR_PROXY_SECRET` signs download URLs. Production refuses the proxy when the value is missing or shorter than 16 characters. Generate one with `openssl rand -hex 32`, and use a different value for every deploy. `.dev.vars.example` leaves it empty on purpose. Local development uses a built-in development value so the page can start. Keep that development value off production.

`TURNSTILE_SECRET` is optional. When it is empty, a request over the rate limit is refused.

`VITE_TURNSTILE_SITE_KEY` is a public site key read at build time through `import.meta.env`. Set it as a Workers Builds build variable, or in a local env file that Vite reads. It is not a Worker runtime secret. Without it, the page does not show a challenge widget, and requests over the limit stay refused.

## Pipeline

| Check | When it runs | What it does |
| --- | --- | --- |
| `verify` | Pull requests and pushes to `main` | Frozen install, typecheck, tests, Worker build |
| `branch-name` | Pull requests | Head branch looks like `feat/public-media`, or starts with `dependabot/` |
| `codeql` | Pull requests, pushes to `main`, and Monday | JavaScript and TypeScript analysis |
| `deploy` | Pushes to `main`, and manual dispatch | Deploys the Worker and smoke-checks the homepage |

A pull request needs `verify` and `branch-name` before it can merge. `codeql` joins the required checks once that job can pass on this repository. Deploy runs after the merge.

## Branches and merges

`main` stays deployable. Work lands through a pull request.

```
feat/public-media
fix/paste-label
```

The prefix is one of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `revert`, `build`, `hotfix`. The rest is lowercase words separated by `-` or `/`.

Merges into `main` are squash-only. The required checks have to pass. Two approving reviews are required. Only the repository owner can bypass those rules. With a single collaborator, merging your own pull request means using that bypass or adding reviewers. Force-pushes to `main`, and deletion of `main`, are rejected.

## Architecture

`extract(url)` returns a `MediaPost`. Platform code lives under `packages/platform/*`. The web app is one Worker.

A post describes how each file is delivered:

- **Direct.** The browser can fetch the file itself.
- **Mux.** Picture and audio are separate. The browser reads both and muxes them on the device. The Worker does not transcode.
- **Proxy.** The browser cannot fetch the file, so the Worker streams it. The URL is signed by the Worker. The browser does not choose the upstream. This is not an open proxy.
- **Playlist.** The media is an HLS or DASH manifest. The same Direct or Proxy rule applies to the manifest and its segments.

Limits are counted in memory on each Worker isolate: 10 extractions per minute, 60 downloads per minute. Text metadata is cached for 10 minutes. Media bytes are not cached.

External platform JSON is decoded with Effect Schema.

## Limits

Fetchr reads public media. DRM, a login wall, a captcha, a private account, and paid content come back as a typed error. The Worker does not transcode, and this version does not store media in R2.
