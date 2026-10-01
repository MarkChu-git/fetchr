# Proposal

## Why

抖音图文(note)解析大面积失效。2026-10-01 实测定位:图文唯一数据源 `slidesinfo` 匿名接口对所有 note 返回 `filter_list reason:8`;而 feed 请求只带 `aweme_id`+`aid` 时,接口忽略 id 返回推荐流,图文永远不在其中。2026-10-02 进一步实测:feed 携带完整客户端参数集时会忠实返回目标作品,图文与视频同路径可得,且两个 feed 主机从 Cloudflare 出口均可达。

## What Changes

- `feedRequest` 携带完整客户端参数集(version、device、screen、locale 等),feed 从"推荐流"变为"按 id 取详情",图文与视频统一走 feed
- 图文(note)不再依赖 slidesinfo;slidesRequest 与 slidesinfo 调用全部移除
- modal_id 入口分不清视频/图文:feed 返回图片时把 canonicalUrl 改写为 `/note/{id}`
- feed 两台主机均未命中时返回 `SOURCE_UNAVAILABLE`,语义为"作品不存在/删除/区域限制"

## Capabilities

### New Capabilities

- `douyin-extraction`: 抖音作品解析能力——短链/长链解析为 CanonicalResource,视频与图文统一经公开 feed(完整客户端参数)取详情,产出 MediaPost

### Modified Capabilities

(无既有 specs,全部为新增)

## Impact

- 代码:`packages/platform/douyin/src/`(session.ts、index.ts、parser.ts;删除 slidesinfo 路径)
- 边界:只触及 douyin 平台包;core 的 Transport 契约不变
- 被否方案:a_bogus 签名 + ttwid 走 Web detail——已实现并验证签名正确(住宅 IP 图文可取),但 douyin.com Web 接口在 IP/ASN 层拒绝 Cloudflare 出口(403 Argus),生产不可用,已拆除;移动端签名(X-Argus 系)因 feed 方案成立而不需要
- 风险:参数集与 app 版本绑定,抖音可能收紧;失败可观测为 SOURCE_UNAVAILABLE 上升
