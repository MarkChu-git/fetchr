# Universal Social Media Extractor

## 0. 项目目标

构建一个 Cloudflare-native、TypeScript-native 的通用社交媒体解析与下载系统。

项目核心不是“视频下载网站”，而是：

> 一个可复用的 Universal Social Media Extraction Engine（通用社交媒体解析引擎）。

第一阶段主要支持：

1. 小红书 Xiaohongshu
2. 抖音 Douyin
3. Instagram
4. TikTok
5. 快手 Kuaishou
6. YouTube
7. Bilibili
8. X / Twitter

未来能够继续加入：

- Facebook
- Threads
- Reddit
- Vimeo
- Pinterest
- Twitch Clips
- SoundCloud
- Bluesky
- 其他公开社交媒体

系统必须支持：

- 视频帖子
- 图文帖子
- 多图 / Carousel
- Audio
- Thumbnail / Cover
- 作者信息
- Caption / Description
- 多清晰度
- 音视频分离
- HLS / DASH
- 短链接解析
- 平台内部重定向
- Direct download
- Worker proxy
- Client-side mux

项目只处理公开可访问媒体。

明确不实现：

- DRM 绕过
- Widevine / FairPlay / PlayReady 破解
- 付费内容绕过
- 私有账户绕过
- 登录权限绕过
- CAPTCHA 绕过

遇到 DRM 或需要权限的内容，应返回明确的 typed error。

---

# 1. 核心设计原则

必须始终遵守以下原则。

### 1.1 Extract，而不是 Download

核心 API 是：

```text
extract(url)
```

而不是：

```text
download(url)
```

解析结果包含媒体信息和交付方式。

下载只是建立在 extraction result 上的客户端功能。

---

### 1.2 Cloudflare 尽量不承载媒体流量

优先级：

```text
Direct CDN download
        ↓
Client-side processing
        ↓
Worker streaming proxy
        ↓
Heavy backend fallback
```

目标：

> 尽可能让 Browser ↔ Origin CDN 直接通信。

不要默认：

```text
Origin
→ Cloudflare
→ R2
→ User
```

第一版禁止引入 R2。

---

### 1.3 Server 不做媒体转码

第一版 Cloudflare Worker 只负责：

```text
resolve
identify
extract
normalize
validate
authorize
sign
proxy when required
```

不要在 Worker 中：

```text
transcode
encode
store media
download full media into RAM
```

---

### 1.4 Platform logic 必须插件化

不能出现：

```ts
if (platform === "douyin") ...
else if (platform === "instagram") ...
else if ...
```

散落在应用各处。

所有平台差异必须存在于：

```text
packages/platform/*
```

中。

---

# 2. 技术栈

## Runtime / Language

```text
TypeScript
```

全项目 strict mode。

禁止 `any`，除非第三方库边界没有其他合理方案，并必须立即 validate / narrow。

---

## Local tooling

统一使用：

```text
Bun
```

用于：

```text
package management
workspace
scripts
testing
development tooling
```

不要引入：

```text
pnpm
yarn
npm lockfile
```

仓库只保留：

```text
bun.lock
```

---

## Production runtime

```text
Cloudflare Workers / workerd
```

注意：

> Bun 只是本地工具链，不是线上 runtime。

所有会部署到 Worker 的 package：

禁止依赖：

```text
Bun.file
Bun.spawn
Bun.serve
node:child_process
native binaries
filesystem assumptions
```

核心代码应尽可能基于：

```text
Web APIs
fetch
Request
Response
ReadableStream
crypto.subtle
URL
```

---

# 3. Web Framework

使用：

```text
React
TanStack Start
Vite
Cloudflare Vite Plugin
```

明确禁止：

```text
Next.js
NestJS
Express
Fastify
```

TanStack Start 同时负责：

```text
SSR
routing
server functions
frontend
Worker deployment
```

---

# 4. Effect

核心 domain logic 使用：

```text
Effect TS
```

优先采用 Effect 4 RC。

要求：

- 锁定确切版本
- 不使用 `latest`
- 不自动升级 Effect RC
- 升级需要单独 commit

如果 Effect 4 RC 与关键依赖发生不可解决的兼容问题，才允许降至 Effect 3 stable，并在 ADR 中记录原因。

Effect 主要承担：

```text
typed errors
dependency injection
resource management
retry
timeout
concurrency
logging
schema validation
service composition
```

不要为了 Effect 而 Effect。

UI component、纯 format function、简单同步映射不必包装 Effect。

---

# 5. Schema

不要引入 Zod。

统一使用：

```text
Effect Schema
```

所有来自平台的外部 JSON：

```text
YouTube API
Douyin API
XHS embedded state
Instagram API
Kuaishou API
```

进入 domain model 之前必须经过 schema decoding。

禁止：

```ts
const data = await res.json() as SomeType
```

必须 validate。

---

# 6. Repo Architecture

创建 Bun workspace monorepo：

```text
/
├── apps/
│   └── web/
│
├── packages/
│   ├── core/
│   ├── extractor/
│   ├── transport/
│   ├── session/
│   ├── delivery/
│   ├── media-browser/
│   ├── platform/
│   │   ├── xiaohongshu/
│   │   ├── douyin/
│   │   ├── kuaishou/
│   │   ├── instagram/
│   │   ├── tiktok/
│   │   ├── youtube/
│   │   ├── bilibili/
│   │   └── twitter/
│   └── testing/
│
├── package.json
├── bun.lock
├── tsconfig.json
└── wrangler.jsonc
```

不要第一版拆 microservices。

整个 Web/API 部署为一个 Worker。

以后真正遇到容量边界以后再拆。

---

# 7. Core Domain Model

核心对象禁止叫：

```text
VideoInfo
```

因为小红书、Instagram、抖音均存在：

```text
images
carousel
video
audio
mixed media
```

核心对象使用：

```ts
MediaPost
```

设计：

```ts
interface MediaPost {
  readonly platform: Platform
  readonly id: string

  readonly canonicalUrl: string

  readonly author?: Author

  readonly title?: string
  readonly description?: string

  readonly thumbnail?: string

  readonly publishedAt?: string

  readonly media: readonly MediaAsset[]
}
```

Author：

```ts
interface Author {
  readonly id?: string
  readonly name?: string
  readonly username?: string
  readonly avatar?: string
  readonly profileUrl?: string
}
```

MediaAsset：

```ts
type MediaAsset =
  | ImageAsset
  | VideoAsset
  | AudioAsset
```

---

# 8. Video Asset

```ts
interface VideoAsset {
  readonly type: "video"

  readonly id: string

  readonly width?: number
  readonly height?: number
  readonly fps?: number

  readonly codec?: string
  readonly container?: string

  readonly bitrate?: number

  readonly thumbnail?: string

  readonly delivery: Delivery
}
```

Image：

```ts
interface ImageAsset {
  readonly type: "image"

  readonly id: string

  readonly width?: number
  readonly height?: number

  readonly delivery: Delivery
}
```

---

# 9. Delivery Model

Extraction 和 Download 必须完全解耦。

定义：

```ts
type Delivery =
  | DirectDelivery
  | ProxyDelivery
  | MuxDelivery
  | PlaylistDelivery
```

## Direct

```ts
interface DirectDelivery {
  readonly type: "direct"

  readonly url: string

  readonly headers?: Readonly<Record<string, string>>
}
```

表示客户端可以直接访问 CDN。

---

## Proxy

```ts
interface ProxyDelivery {
  readonly type: "proxy"

  readonly token: string
}
```

用户访问：

```text
/download/:token
```

Worker streaming 上游。

---

## Mux

用于音视频分离：

```ts
interface MuxDelivery {
  readonly type: "mux"

  readonly video: MediaSource
  readonly audio: MediaSource

  readonly outputContainer: "mp4" | "webm"
}
```

---

## Playlist

```ts
interface PlaylistDelivery {
  readonly type: "playlist"

  readonly protocol: "hls" | "dash"

  readonly url: string
}
```

---

# 10. Extractor Architecture

定义：

```ts
interface Extractor {
  readonly platform: Platform

  readonly capabilities: ExtractorCapabilities

  readonly match: (
    url: URL
  ) => boolean

  readonly resolve: (
    url: URL
  ) => Effect.Effect<
    CanonicalResource,
    ResolveError,
    ResolverServices
  >

  readonly extract: (
    resource: CanonicalResource
  ) => Effect.Effect<
    MediaPost,
    ExtractError,
    ExtractorServices
  >
}
```

---

# 11. Resolver

Resolver 与 Extractor 必须拆开。

原因：

大量社交媒体分享链接是短链。

例如：

```text
xhslink.com
↓
xiaohongshu.com/explore/...
```

```text
v.douyin.com
↓
douyin.com/video/...
```

```text
v.kuaishou.com
↓
kuaishou canonical resource
```

统一流程：

```text
Input URL
   ↓
URL normalization
   ↓
short-link resolver
   ↓
redirect resolver
   ↓
canonical resource
   ↓
extractor
```

CanonicalResource：

```ts
interface CanonicalResource {
  readonly platform: Platform

  readonly id?: string

  readonly url: URL
}
```

---

# 12. Extraction Strategy

平台不能只允许一种 extraction 方法。

定义策略：

```ts
type ExtractionStrategy =
  | "embedded-data"
  | "public-api"
  | "internal-api"
  | "browser"
```

典型流程：

```text
Embedded page state
        ↓ fail
Internal API
        ↓ fail
Browser fallback
```

但是 Browser fallback 第一版不实现，只保留接口。

---

# 13. Extractor Registry

创建：

```ts
ExtractorRegistry
```

提供：

```ts
findExtractor(url: URL)
extract(url: string)
supports(url: string)
```

使用 registry，不允许业务代码 import 所有 platform 然后自己判断。

类似：

```ts
const extractor = yield* registry.resolve(url)

const post = yield* extractor.extract(resource)
```

---

# 14. Platform Package Structure

每个平台保持统一结构：

```text
platform/douyin/
├── index.ts
├── extractor.ts
├── resolver.ts
├── api.ts
├── schema.ts
├── parser.ts
├── signer.ts
├── session.ts
├── errors.ts
└── fixtures/
```

如果不需要某个模块，可以省略。

但不要创建一个：

```text
douyin.ts
```

然后塞 3000 行。

---

# 15. Session Layer

Core 不导出 Session。

Cookie、匿名态和签名只存在于对应的平台包里。Core 注入 Transport。平台 parser 不持有 session 的生命周期。

---

# 16. HTTP / Transport Layer

所有平台不能直接无规则地调用：

```ts
fetch()
```

创建：

```text
Transport
```

Effect Service：

```ts
interface Transport {
  request(...)
  get(...)
  post(...)
}
```

它负责统一处理：

```text
timeout
retry
headers
redirects
metrics
abort
error normalization
```

禁止平台 extractor 自己实现 retry loop。

---

# 17. Retry Policy

只允许 transient errors 自动 retry：

例如：

```text
429
502
503
network failure
timeout
```

这些不能 retry：

```text
PrivateMedia
LoginRequired
DRMProtected
UnsupportedUrl
MediaNotFound
GeoBlocked
```

默认：

```text
max attempts: 3
exponential backoff
jitter
```

---

# 18. Error Model

建立 typed error hierarchy。

至少包括：

```text
UnsupportedUrl
InvalidUrl
ResolveFailed
MediaNotFound
PrivateMedia
LoginRequired
GeoBlocked
RateLimited
SourceUnavailable
ExtractorBroken
SchemaChanged
DRMProtected
UpstreamTimeout
```

禁止把平台内部错误直接暴露给用户。

API 统一映射成：

```json
{
  "error": {
    "code": "PRIVATE_MEDIA",
    "message": "This post is private."
  }
}
```

---

# 19. YouTube

YouTube 不自己从零实现。

使用：

```text
youtubei.js/cf-worker
```

只把它作为：

```text
YouTubeExtractor
```

的 implementation detail。

其他包不能直接依赖 youtubei.js。

流程：

```text
YouTube URL
↓
YouTubeResolver
↓
youtubei.js
↓
normalize
↓
MediaPost
```

---

# 20. 小红书

第一优先级平台。

必须支持：

```text
xhslink.com short links
xiaohongshu.com/explore/*
video note
image note
multi-image note
author
title
description
cover
original images where publicly available
```

策略顺序：

```text
resolve short URL
↓
canonical URL
↓
fetch page
↓
embedded state
↓
normalize
```

如果 embedded state 不足：

```text
internal/public API fallback
```

不要第一版为了某些极端内容上 Browser Run。

---

# 21. 抖音

支持：

```text
v.douyin.com
douyin.com/video/*
video
image posts
author
description
cover
available media variants
```

必须把：

```text
resolver
session
signer
parser
```

分开。

任何签名逻辑只能存在：

```text
signer.ts
```

---

# 22. 快手

同样支持：

```text
v.kuaishou.com
canonical resource
video
image/carousel when available
metadata
```

不要假定 Kuaishou 数据结构与 Douyin 一致。

---

# 23. Instagram

第一阶段只支持：

```text
public posts
public reels
public carousel
```

不支持：

```text
private account
stories requiring login
DM
Close Friends
```

统一输出：

```text
image[]
video[]
```

而不是 Instagram-specific structure。

---

# 24. TikTok

独立于 Douyin。

禁止：

```text
TikTokExtractor extends DouyinExtractor
```

即便两者部分机制类似，也应视为不同平台实现。

共享能力应提取到：

```text
shared/
```

而不是 inheritance。

优先 composition。

---

# 25. Browser Media Processing

使用：

```text
Mediabunny
```

不要默认使用：

```text
ffmpeg.wasm
```

Mediabunny 负责客户端：

```text
mux
remux
stream handling
container conversion when lossless
```

第一阶段禁止客户端 transcoding。

也就是说允许：

```text
video stream + audio stream
→ MP4
```

但不要：

```text
AV1 → H264
```

除非未来明确需要。

---

# 26. Browser Processing Worker

所有媒体 assembly 放入：

```text
Web Worker
```

不要堵 React UI thread。

目录：

```text
media-browser/
├── mux.ts
├── downloader.ts
├── stream.ts
└── media.worker.ts
```

---

# 27. Memory Safety

禁止：

```ts
await response.arrayBuffer()
```

用于完整大视频。

禁止：

```text
download 2GB
→ Blob
→ mux
```

尽量使用：

```text
ReadableStream
TransformStream
streaming output
```

整个架构从第一天按大文件设计。

---

# 28. Download Strategy

统一：

```text
Direct
↓
如果可直接下载
→ Origin CDN
```

否则：

```text
Mux
↓
Browser processing
```

否则：

```text
Proxy
↓
Worker streaming
```

Direct 只在浏览器能直接下载完整文件、且不需要平台 Referer、Cookie 或 User-Agent 时使用。Mux 只在浏览器能读到两边的字节时使用。其余走 Proxy。见 `docs/adr/0001-delivery-selection.md`。

未来最后才增加：

```text
Heavy Fallback
↓
yt-dlp Container
```

---

# 29. Worker Proxy

Endpoint：

```text
GET /download/:token
```

禁止：

```text
/proxy?url=https://anything.com
```

否则会变成开放代理。

token 必须：

```text
signed
short-lived
tamper-resistant
```

建议：

```text
HMAC-SHA256
```

TTL：

```text
30 minutes
```

token 用 HMAC-SHA256 签。里面只有上游 URL、Worker 要代附的请求头、过期时间和平台。客户端传入的 URL 不算数。见 `docs/adr/0005-proxy-token.md`。

---

# 30. SSRF Protection

这是强制要求。

Proxy 不允许访问任意 URL。

至少执行：

```text
scheme validation
host validation
extractor-issued token verification
private IP blocking
localhost blocking
metadata endpoint blocking
```

拒绝：

```text
127.0.0.1
localhost
169.254.*
10.*
172.16-31.*
192.168.*
::1
private IPv6 ranges
```

不要信任客户端传入的 upstream URL。

---

# 31. API

主要 endpoint：

```text
POST /api/extract
```

Request：

```json
{
  "url": "https://..."
}
```

Response：

```json
{
  "platform": "xiaohongshu",
  "id": "...",
  "canonicalUrl": "...",
  "author": {},
  "title": "...",
  "description": "...",
  "media": []
}
```

另外：

```text
GET /api/platforms
GET /api/health
GET /download/:token
```

第一版不要 GraphQL。

REST 足够。

---

# 32. UI

主页面保持极简。

核心 UX：

```text
Paste a link
      ↓
Extract
      ↓
Post Preview
      ↓
Media Assets
      ↓
Download
```

展示：

```text
platform
author
title
thumbnail
media type
resolution
codec when relevant
file/container type
```

不要给普通用户展示内部：

```text
format_id
itag
signatures
internal CDN params
```

高级信息可以放 Advanced。

---

# 33. Frontend Stack

使用：

```text
React 19
TanStack Start
Astryx (@astryxdesign/core)
StyleX
```

界面文案有中文和英文两种。没有 `lang` 时用中文。英文用顶栏的 EN，或地址 `?lang=en`。

Astryx 提供组件和主题。StyleX 写产品自己的布局。不用 Tailwind，不用 shadcn。

外观从 Stone 主题出发，明暗跟随系统。封面和视频是页面上最亮的东西。

Astryx 从源码编译，Worker 只带用到的组件。它只出现在 `apps/web`。不要让组件库进入 core 或平台包。版本钉死。

移动端必须是一等公民。

目标：

```text
mobile first
```

因为这类工具大量用户会直接在手机浏览器使用。

---

# 34. Cache

第一版只缓存：

```text
metadata / extraction result
```

不要缓存媒体。

缓存应该区分：

```text
stable metadata
```

和：

```text
expiring CDN URL
```

如果媒体 URL 有 expiry：

不要长时间缓存整个 `MediaPost`。

领域对象仍然是带着 Delivery 的 MediaPost。缓存可以只存文字和作者、丢掉过期地址。那是缓存记录，不是第二种领域类型。

---

# 35. No Database MVP

第一版禁止：

```text
D1
Postgres
KV user database
```

除非出现真实需求。

系统第一阶段：

```text
stateless
```

---

# 36. No R2 MVP

第一版不使用 R2。

视频和图片：

```text
Origin CDN
→ User
```

不是：

```text
Origin
→ R2
→ User
```

---

# 37. No Container MVP

第一版不使用 Container。

Container 只为未来：

```text
yt-dlp fallback
native binaries
ffmpeg
complex browser automation
```

保留 architectural extension point。

---

# 38. Future yt-dlp Adapter

提前定义：

```ts
interface FallbackExtractor {
  extract(...)
}
```

但第一版不要实现。

未来流程：

```text
Registry
↓
No native extractor
↓
yt-dlp fallback service
↓
normalize
↓
MediaPost
```

yt-dlp 永远不能返回自己的 raw schema 到 frontend。

必须 normalize。

---

# 39. Security

必须：

```text
URL normalization
SSRF protection
rate limiting
request timeout
response size limits for metadata
strict schemas
short-lived download tokens
origin validation
```

不要记录：

```text
cookies
authorization headers
signed CDN URLs
完整用户输入 URL
```

到 production logs。

---

# 40. Turnstile

MVP 初期不要求每次 extract 都弹 CAPTCHA。

设计：

```text
normal traffic
→ no challenge
```

异常：

```text
high frequency
suspicious client
abuse
```

再要求 Turnstile。

---

# 41. Rate Limiting

对：

```text
/api/extract
/download/*
```

分别限流。

Extract endpoint 比 download endpoint 更严格，因为 extraction 容易打 upstream。

---

# 42. Observability

每次 extraction 记录：

```text
platform
extractor version
strategy
success/failure
latency
error code
delivery type
```

不要记录媒体 URL。

典型 metric：

```text
extract_success_rate
extract_latency
schema_failure_rate
upstream_429_rate
proxy_bytes
strategy_fallback_rate
```

---

# 43. Testing

测试分三层。

## Unit

使用：

```text
bun test
```

测试：

```text
URL matching
URL normalization
schema decoding
parser
format ranking
delivery selection
error mapping
signing
```

---

## Fixture Tests

每个平台保存匿名化 fixture：

```text
fixtures/
```

包含：

```text
sample page response
sample API response
expected MediaPost
```

测试：

```text
fixture
→ parser
→ exact normalized result
```

这对 extractor 非常重要。

---

## Worker Integration

使用真正 workerd-compatible 测试环境。

测试：

```text
Request/Response
bindings
streaming
download token
proxy
headers
CORS
```

不能只因为：

```text
bun test passes
```

就认为 Worker 可运行。

---

# 44. Contract Tests

所有 extractor 必须通过相同 contract suite：

```text
returns platform
returns canonical id
media array not empty
valid URLs
valid Delivery
no raw platform data leakage
typed errors only
```

新增平台时只需：

```text
runExtractorContract(extractor)
```

---

# 45. Development Fixtures

不要在每次 CI 都请求真实 Instagram / Douyin。

真实平台请求：

```text
manual / scheduled smoke tests
```

普通 CI：

```text
fixtures
```

避免：

```text
rate limits
flaky upstream
platform blocking CI IP
```

---

# 46. CI

GitHub Actions：

```text
bun install --frozen-lockfile
typecheck
lint
bun test
worker integration tests
build
```

PR 必须全绿。

---

# 47. Code Quality

必须启用：

```text
strict TypeScript
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

避免：

```text
class-heavy OOP
inheritance trees
global mutable state
platform-specific conditionals
```

优先：

```text
composition
immutable data
Effect services
small modules
pure parsers
```

---

# 48. Documentation

创建：

```text
/docs
```

至少：

```text
architecture.md
adding-an-extractor.md
delivery-model.md
error-model.md
security.md
```

新增平台应该能够按照：

```text
adding-an-extractor.md
```

完成，而不需要理解整个 repository。

---

# 49. ADR

建立：

```text
docs/adr/
```

已经记录的决定：

```text
0001-delivery-selection.md
0002-core-has-no-platform-words.md
0003-mediapost-owns-delivery.md
0004-astryx-and-stylex.md
0005-proxy-token.md
```

Bun、Effect、单 Worker、MVP 不用 R2、客户端 mux、平台插件，写在本计划里，不再各写一份复述。

---

# 50. 开发阶段

## Phase 0 — Foundation

完成：

```text
Bun workspace
TanStack Start
Cloudflare Worker deployment
Effect setup
strict TypeScript
CI
basic UI
```

验收：

```text
bun install
bun run dev
bun test
bun run build
bun run deploy
```

全部正常。

---

# 51. Phase 1 — Core

实现：

```text
MediaPost
MediaAsset
Delivery
Platform
Extractor
ExtractorRegistry
Resolver
Transport
typed errors
Effect Layers
```

写完整 unit tests。

这个阶段禁止做平台。

---

# 52. Phase 2 — Reference Extractor

首先实现：

```text
YouTubeExtractor
```

不是因为 YouTube 最重要，而是因为：

```text
youtubei.js/cf-worker
```

已经提供可靠底层。

用于验证：

```text
registry
normalization
delivery
frontend
client mux
```

完整链路。

验收：

```text
YouTube URL
→ MediaPost
→ quality picker
→ direct/mux
→ successful user download
```

---

# 53. Phase 3 — Xiaohongshu

实现：

```text
XHS Resolver
XHS Schema
XHS Parser
XHS Extractor
```

支持：

```text
short URL
video
single image
multi-image
metadata
```

这是第一个真正证明 framework 能力的平台。

---

# 54. Phase 4 — Douyin

实现：

```text
short URL
video
image post
metadata
session abstraction
signer abstraction if required
```

不能把 platform quirks 泄漏进 core。

---

# 55. Phase 5 — Instagram + TikTok + Kuaishou

依次实现：

```text
Instagram
TikTok
Kuaishou
```

每个平台必须拥有 fixture tests。

---

# 56. Phase 6 — Bilibili + X

实现：

```text
Bilibili
X / Twitter
```

然后对 Registry 和 Delivery abstraction 做第一次 architecture review。

---

# 57. Phase 7 — Hardening

加入：

```text
rate limiting
Turnstile escalation
download token
SSRF protection
observability
cache
structured logs
```

---

# 58. Phase 8 — Public SDK

把 extractor core 暴露成可独立使用的 library。

目标 API：

```ts
import { extract } from "@fetchr/core"

const post = await extract(url)
```

或者 Effect-native：

```ts
const program = Extractor.extract(url)
```

不要让 SDK 依赖 React。

---

# 59. MVP Acceptance Criteria

MVP 完成必须满足：

### Platform

至少稳定支持：

```text
Xiaohongshu
Douyin
Instagram
TikTok
Kuaishou
YouTube
```

### Media

支持：

```text
video
image
carousel
audio where available
```

### Architecture

不存在：

```text
R2 dependency
database dependency
container dependency
Node server dependency
```

### Runtime

生产环境：

```text
Cloudflare Workers
```

### Tooling

全部：

```text
Bun
```

### Server

不得下载完整视频进入内存。

### Client

可以：

```text
direct download
client mux
proxy fallback
```

---

# 60. Non-goals for MVP

禁止 agent 自己扩 scope 去做：

```text
accounts
login system
download history
favorites
R2 storage
user library
native apps
browser extensions
desktop apps
yt-dlp containers
FFmpeg servers
AI features
subscriptions
payments
admin dashboard
profiles
playlist bulk downloads
```

这些全部留到 MVP 完成以后。

---

# 61. Research Sources

在实现平台 extractor 时，可以研究：

```text
yt-dlp
Cobalt
btch-downloader
youtubei.js
其他高质量开源平台 downloader
```

用途：

```text
understand platform behavior
compare outputs
discover edge cases
```

不要直接复制许可证不兼容的实现。

尤其注意：

```text
AGPL
GPL
non-commercial licenses
```

目标项目应保留商业化可能。

每个引入的 dependency 都检查 license。

---

# 62. Agent Working Rules

Grok Build 必须遵守：

1. 不要一次实现全部平台。
2. 每完成一个 Phase 必须确保 build/test 通过。
3. 不要为了“先跑起来”破坏 abstraction。
4. 不要加入没有明确需求的 Cloudflare 产品。
5. 不允许自动增加数据库。
6. 不允许自动增加 R2。
7. 不允许自动增加 Container。
8. 不允许用 Next.js。
9. 不允许改回 npm/pnpm。
10. 不允许用大量 `any`。
11. 不允许把平台原始 API response 直接传给前端。
12. 不允许把平台 cookies/signatures 写死在 core。
13. 不允许开放任意 URL proxy。
14. 不允许实现 DRM bypass。
15. 不允许因一个平台需求污染其他平台接口。

---

# 63. Implementation Priority

遇到冲突时优先级：

```text
Correct abstraction
>
Security
>
Reliability
>
Platform compatibility
>
Performance
>
Developer convenience
>
Feature count
```

不要为了支持更多网站牺牲框架质量。

---

# 64. 最终架构

```text
                       Browser
                          │
                   TanStack Start
                          │
                          ▼
                Cloudflare Worker
                          │
                    Effect Core
                          │
                 Extractor Registry
                          │
       ┌──────────────────┼────────────────────┐
       │                  │                    │
       ▼                  ▼                    ▼
 Xiaohongshu           Douyin              Instagram
       │                  │                    │
       ▼                  ▼                    ▼
   Resolver           Resolver             Resolver
       │                  │                    │
       ▼                  ▼                    ▼
   Extractor          Extractor            Extractor
       │                  │                    │
       └──────────────────┼────────────────────┘
                          │
                          ▼
                      MediaPost
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
          Direct         Proxy       Client Mux
             │            │            │
             │       Worker Stream  Mediabunny
             │            │            │
             └────────────┼────────────┘
                          ▼
                        User
```

未来扩展：

```text
             Extractor Registry
                     │
          native extractor failed
                     │
                     ▼
               Fallback API
                     │
               CF Container
                     │
                  yt-dlp
                     │
                     ▼
                 MediaPost
```

但此路径不属于 MVP。

---

# 65. Project Philosophy

整个项目应围绕这个原则实现：

> Parse on the edge. Move media as little as possible.

也就是：

```text
解析留在 Edge
媒体尽量不经过 Edge
计算尽量靠近用户
平台差异封装在 Extractor
```

最终真正有价值的产品不是网站本身，而是：

```text
Universal
TypeScript-native
Cloudflare-native
Social Media Extraction Engine
```

Web downloader 只是这个 engine 的第一个客户端。
