# Spec Delta

## Purpose

规定站点页面在被分享时对外呈现的元数据：标题与描述、Open Graph 与 Twitter 标签、分享图的地址与可取性，使链接在各平台的预览里有标题和图片。

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
所有页面的服务端渲染 HTML SHALL 包含：`og:type`（取值 `website`）、`og:site_name`（取值 `Fetchr`）、`og:title`、`og:description`、`og:url`、`og:locale`、`og:image`、`og:image:type`（取值 `image/png`）、`og:image:width`、`og:image:height`、`og:image:alt`，以及 `twitter:card`（取值见下一条：`summary_large_image` 或 `summary`）。`og:description` SHALL 与 `<meta name="description">` 取值一致，沿用现有的语言文案。同一个 `property` 或 `name` SHALL 只出现一次。

#### Scenario: 中文页面的标签
- **WHEN** 已知的链接预览爬虫请求 `/`
- **THEN** `og:locale` 为 `zh_CN`，`og:url` 为当前 origin 加 `/`，`og:image` 指向中文宽图，`og:image:width` 为 `1200`，`og:image:height` 为 `630`，`twitter:card` 为 `summary_large_image`

#### Scenario: 英文页面的标签
- **WHEN** 已知的链接预览爬虫请求 `/?lang=en`
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

### Requirement: 分享图按请求方选择
服务端 SHALL 按请求的 `User-Agent` 选择 `og:image`：已知的链接预览爬虫得到当前语言的宽图，其余所有请求得到 `square.png`。已知爬虫指 UA 含 `facebookexternalhit`、`facebot`、`twitterbot`、`slackbot`、`telegrambot`、`whatsapp`、`discordbot`、`linkedinbot`、`applebot` 之一（不区分大小写）。两种请求得到的标签 SHALL 只在图片相关标签与 `twitter:card` 上不同，页面响应 SHALL 带 `Vary: User-Agent`。

#### Scenario: 已知爬虫
- **WHEN** 以 `Twitterbot/1.0` 作为 UA 请求 `/`
- **THEN** `og:image` 指向 `og-zh.png`，`og:image:width` 为 `1200`，`og:image:height` 为 `630`，`og:image:alt` 为分享图的描述，`twitter:card` 为 `summary_large_image`

#### Scenario: 微信内置浏览器
- **WHEN** 以含 `MicroMessenger` 的 UA 请求 `/` 或 `/?lang=en`
- **THEN** `og:image` 指向 `square.png`，`og:image:width` 与 `og:image:height` 均为 `600`，`og:image:alt` 为 `Fetchr`，`twitter:card` 为 `summary`

#### Scenario: 微信的链接抓取器
- **WHEN** 微信抓取页面，且它的 UA 不含名单里的任何名字
- **THEN** 它按不在名单里的请求方处理，得到方图；朋友圈会把 `og:image` 居中裁成方形，方图不受影响

#### Scenario: 不在名单里的请求方
- **WHEN** 请求不带 UA，或 UA 不含名单里的任何名字
- **THEN** 得到与微信内置浏览器相同的方图和 `summary`

#### Scenario: 两种请求方只差图片
- **WHEN** 分别以已知爬虫和其他 UA 请求同一页面
- **THEN** 两份标签除 `og:image`、`og:image:width`、`og:image:height`、`og:image:alt` 与 `twitter:card` 之外完全相同

#### Scenario: 缓存按 UA 区分
- **WHEN** 请求任一页面，包括不存在的路径
- **THEN** 响应的 `Vary` 包含 `User-Agent`

### Requirement: 分享图可被抓取且地址带内容哈希
`og:image` 指向的地址 SHALL 返回 200 与 `Content-Type: image/png`，图片尺寸 SHALL 与同页的 `og:image:width` 和 `og:image:height` 一致（宽图 1200×630，方图 600×600）。地址 SHALL 带 `?v=<内容哈希>` 查询参数，哈希随图片内容变化，使各平台的缓存在换图后失效。

#### Scenario: 请求分享图
- **WHEN** 请求页面 `og:image` 给出的地址
- **THEN** 响应为 200，`Content-Type` 为 `image/png`，PNG 头声明的宽高等于同页的 `og:image:width` 与 `og:image:height`

#### Scenario: 换图后地址变化
- **WHEN** 分享图的内容发生变化并重新生成
- **THEN** `og:image` 的 `v` 参数随之变化

### Requirement: 取不到请求信息时页面照常渲染
服务端取当前请求的 origin 失败时，页面 SHALL 照常渲染：省略 `og:url`、`og:image` 及其附属标签，保留标题、描述、`og:title`、`og:description`、`og:type`、`og:site_name`、`og:locale` 与 `twitter:card`。页面 MUST NOT 输出相对路径的分享图地址，也 MUST NOT 向访客展示错误。

#### Scenario: 取不到 origin
- **WHEN** 服务端取不到当前请求的 origin
- **THEN** 响应仍为 200，HTML 里没有 `og:url` 和 `og:image*`，页面内容完整

#### Scenario: 读不到 UA
- **WHEN** 服务端读不到请求信息
- **THEN** 该请求按不在名单里的请求方处理，`twitter:card` 为 `summary`

