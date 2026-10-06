# Spec Delta

## Purpose

规定站点页面在被分享时对外呈现的元数据：标题与描述、Open Graph 与 Twitter 标签、分享图的地址与可取性，以及微信内置浏览器里的方图，使链接在各平台的预览里有标题和图片。

## ADDED Requirements

### Requirement: 页面标题按语言给出
站点 SHALL 为每个页面输出带语义的 `<title>`：中文页面为「Fetchr：粘贴链接，下载视频和图片」，英文页面（`?lang=en`）为「Fetchr: paste a link, download videos and images」。标题 SHALL 与 `og:title` 取值一致。本次不为 `/terms` 单独写标题，它沿用同一个标题。

#### Scenario: 中文首页
- **WHEN** 请求 `/`
- **THEN** HTML 的 `<title>` 为「Fetchr：粘贴链接，下载视频和图片」，`og:title` 与之相同

#### Scenario: 英文首页
- **WHEN** 请求 `/?lang=en`
- **THEN** HTML 的 `<title>` 为「Fetchr: paste a link, download videos and images」，`og:title` 与之相同

#### Scenario: 使用条款页
- **WHEN** 请求 `/terms`
- **THEN** `<title>` 与首页同一语言下的标题相同

### Requirement: 输出 Open Graph 与 Twitter 标签
所有页面的服务端渲染 HTML SHALL 包含：`og:type`（取值 `website`）、`og:site_name`（取值 `Fetchr`）、`og:title`、`og:description`、`og:url`、`og:locale`、`og:image`、`og:image:type`（取值 `image/png`）、`og:image:width`、`og:image:height`、`og:image:alt`，以及 `twitter:card`（取值 `summary_large_image`）。`og:description` SHALL 与 `<meta name="description">` 取值一致，沿用现有的语言文案。同一个 `property` 或 `name` SHALL 只出现一次。

#### Scenario: 中文页面的标签
- **WHEN** 请求 `/`
- **THEN** `og:locale` 为 `zh_CN`，`og:url` 为当前 origin 加 `/`，`og:image` 指向中文宽图，`og:image:width` 为 `1200`，`og:image:height` 为 `630`，`twitter:card` 为 `summary_large_image`

#### Scenario: 英文页面的标签
- **WHEN** 请求 `/?lang=en`
- **THEN** `og:locale` 为 `en_US`，`og:url` 带 `?lang=en`，`og:image` 指向英文宽图，`og:image:alt` 为英文描述

#### Scenario: 标签不重复
- **WHEN** 渲染任意页面
- **THEN** 同一个 `og:*` 标签、`twitter:*` 标签和 `description` 标签在 HTML 中恰好出现一次

### Requirement: 分享图与页面地址为绝对地址，origin 取自当前请求
`og:image` 与 `og:url` SHALL 是以当前请求的 origin 开头的绝对 URL。origin MUST NOT 写死：同一份构建部署到其他域名或 preview 地址时，标签指向该部署自己的 origin。

#### Scenario: 生产域名
- **WHEN** 通过 `https://fetchr.hanyang.app` 请求 `/`
- **THEN** `og:image` 以 `https://fetchr.hanyang.app/share/` 开头

#### Scenario: 其他部署
- **WHEN** 通过 preview 地址（例如 workers.dev 域名）请求 `/`
- **THEN** `og:image` 与 `og:url` 使用该 preview 地址的 origin，而不是生产域名

### Requirement: 分享图可被抓取且地址带内容哈希
`og:image` 指向的地址 SHALL 返回 200 与 `Content-Type: image/png`，图片尺寸 SHALL 为 1200×630。地址 SHALL 带 `?v=<内容哈希>` 查询参数，哈希随图片内容变化，使各平台的缓存在换图后失效。

#### Scenario: 请求分享图
- **WHEN** 请求页面 `og:image` 给出的地址
- **THEN** 响应为 200，`Content-Type` 为 `image/png`，PNG 头声明宽 1200、高 630

#### Scenario: 换图后地址变化
- **WHEN** 分享图的内容发生变化并重新生成
- **THEN** `og:image` 的 `v` 参数随之变化

### Requirement: 取不到请求信息时页面照常渲染
服务端取当前请求的 origin 或 User-Agent 失败时，页面 SHALL 照常渲染：省略 `og:url`、`og:image` 及其附属标签，保留标题、描述、`og:title`、`og:description`、`og:type`、`og:site_name`、`og:locale` 与 `twitter:card`。页面 MUST NOT 输出相对路径的分享图地址，也 MUST NOT 向访客展示错误。

#### Scenario: 取不到 origin
- **WHEN** 服务端取不到当前请求的 origin
- **THEN** 响应仍为 200，HTML 里没有 `og:url` 和 `og:image*`，页面内容完整

#### Scenario: 取不到 User-Agent
- **WHEN** 服务端取不到 User-Agent
- **THEN** 页面按非微信浏览器处理，不输出微信方图

### Requirement: 微信内置浏览器里放一张屏外方图
当请求的 User-Agent 含 `MicroMessenger` 时，服务端渲染的 HTML SHALL 在 `<body>` 的第一个元素位置放一张 600×600 的方图 `<img>`，地址为带内容哈希的绝对地址。该图 SHALL 被挪出可视区域而不是用 `display: none` 隐藏，对辅助技术隐藏，`alt` 为空。其他 User-Agent 的 HTML MUST NOT 包含这张图。本需求是对微信默认抓图规则的试探：真机验证无效时，整条需求连同对应实现一并移除，不影响其余需求。

#### Scenario: 微信 User-Agent
- **WHEN** 以含 `MicroMessenger` 的 User-Agent 请求 `/`
- **THEN** `<body>` 的第一个元素是 `<img>`，`src` 指向 `/share/square.png` 并带 `?v=`，宽高均为 600，样式为绝对定位且在屏幕外，`aria-hidden` 为 `true`，`alt` 为空

#### Scenario: 普通浏览器
- **WHEN** 以不含 `MicroMessenger` 的 User-Agent 请求 `/`
- **THEN** HTML 里没有这张 `<img>`，浏览器不会请求 `square.png`
