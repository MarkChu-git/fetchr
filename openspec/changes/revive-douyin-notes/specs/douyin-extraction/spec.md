# Spec Delta

## Purpose

抖音作品解析能力:把用户粘贴的分享文本或链接解析为规范作品资源,取出视频或图文详情并产出 MediaPost;对私密、删除、签名失效等情形返回类型化错误。

## ADDED Requirements

### Requirement: 图文作品解析

系统 SHALL 能解析抖音图文(note)作品并产出包含全部图片资产的 MediaPost。图文详情 SHALL 从带签名的 Web detail 接口获取;系统 MUST NOT 再依赖 slidesinfo 匿名接口。

#### Scenario: 短链解析图文作品

- **WHEN** 用户粘贴的短链重定向到图文作品
- **THEN** 系统返回该作品的 MediaPost,media 为全部图片资产,顺序与原作品一致

#### Scenario: note 长链直接解析

- **WHEN** 输入为 `www.douyin.com/note/{id}` 或 `iesdouyin.com/share/note|slides/{id}` 形式的链接
- **THEN** 系统经 Web detail 获取详情并返回图片 MediaPost,canonicalUrl 为 `/note/{id}` 形式

#### Scenario: modal_id 指向图文作品

- **WHEN** 输入链接只有 modal_id 且对应图文作品,公开视频 feed 中不存在该 id
- **THEN** 系统经 Web detail 确认其为图文并返回图片 MediaPost

### Requirement: 请求签名与凭证引导

系统 SHALL 在平台包内完成 Web detail 请求的 a_bogus 签名与 ttwid cookie 引导,不向 core 或其他平台包暴露 cookie 或签名细节。每个外部响应载荷 MUST 经 schema 解码,拒绝未校验的强转。

#### Scenario: 签名请求返回详情

- **WHEN** 持有有效 ttwid cookie 且签名参数正确
- **THEN** Web detail 接口返回作品详情载荷,schema 解码成功

#### Scenario: 签名或凭证失效

- **WHEN** 签名被拒绝、ttwid 引导失败或接口返回空响应
- **THEN** 系统返回 `UPSTREAM_BLOCKED` 类型化错误,MUST NOT 把空载荷当作"作品不存在"

### Requirement: 视频兜底路径

当公开 feed 未包含目标视频时,系统 SHALL 经 Web detail 再确认一次,以区分"作品不存在/已删除"与"feed 漏收"。

#### Scenario: feed 漏收但作品存在

- **WHEN** 公开 feed 两个主机均未返回目标视频,但 Web detail 返回有效视频详情
- **THEN** 系统返回该视频的 MediaPost

#### Scenario: 作品确已不存在

- **WHEN** feed 与 Web detail 均无法取得作品详情
- **THEN** 系统返回 `SOURCE_UNAVAILABLE` 或 `MEDIA_NOT_FOUND` 类型化错误

### Requirement: 访问控制边界不破

签名与 cookie 引导 MUST NOT 用于绕过登录墙、私密、付费或 DRM 内容。作品标记为私密时系统 MUST 返回 `PRIVATE_MEDIA`。

#### Scenario: 私密作品

- **WHEN** Web detail 返回的作品 `private_status` 为私密
- **THEN** 系统返回 `PRIVATE_MEDIA`,不返回任何媒体地址
