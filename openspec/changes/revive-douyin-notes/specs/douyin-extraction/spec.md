# Spec Delta

## Purpose

抖音作品解析能力:把用户粘贴的分享文本或链接解析为规范作品资源,经公开 feed(完整客户端参数)取出视频或图文详情并产出 MediaPost;对私密、删除、不存在等情形返回类型化错误。

## ADDED Requirements

### Requirement: 图文作品解析

系统 SHALL 能解析抖音图文(note)作品并产出包含全部图片资产的 MediaPost。图文与视频 SHALL 统一经公开 feed 获取详情,请求 MUST 携带完整客户端参数集;系统 MUST NOT 依赖 slidesinfo 或任何需签名的接口。

#### Scenario: 短链解析图文作品

- **WHEN** 用户粘贴的短链重定向到图文作品
- **THEN** 系统返回该作品的 MediaPost,media 为全部图片资产,顺序与原作品一致

#### Scenario: note 长链直接解析

- **WHEN** 输入为 `www.douyin.com/note/{id}` 或 `iesdouyin.com/share/note|slides/{id}` 形式的链接
- **THEN** 系统经 feed 获取详情并返回图片 MediaPost,canonicalUrl 为 `/note/{id}` 形式

#### Scenario: modal_id 指向图文作品

- **WHEN** 输入链接只有 modal_id 且 feed 返回的详情携带图片
- **THEN** 系统返回图片 MediaPost,并把 canonicalUrl 改写为 `/note/{id}`

### Requirement: feed 请求形态

feed 请求 SHALL 携带完整客户端参数集(version、device、screen、locale 等)与 app User-Agent。每个外部响应载荷 MUST 经 schema 解码,拒绝未校验的强转;MUST NOT 从列表位置(如第 0 项)取目标作品,必须按 id 匹配。

#### Scenario: 参数集完整时按 id 命中

- **WHEN** feed 请求携带完整参数集
- **THEN** 响应列表中按 aweme_id 匹配目标作品;未匹配时不返回任何推荐项冒充目标

### Requirement: 未命中与访问控制

feed 两台主机均未返回目标作品时,系统 SHALL 返回 `SOURCE_UNAVAILABLE`。作品标记为私密时系统 MUST 返回 `PRIVATE_MEDIA`,MUST NOT 绕过登录墙、私密、付费或 DRM 内容。

#### Scenario: 作品不存在或不可用

- **WHEN** 两台 feed 主机均未返回目标 id
- **THEN** 系统返回 `SOURCE_UNAVAILABLE`

#### Scenario: 私密作品

- **WHEN** 详情中 `private_status` 为私密
- **THEN** 系统返回 `PRIVATE_MEDIA`,不返回任何媒体地址
