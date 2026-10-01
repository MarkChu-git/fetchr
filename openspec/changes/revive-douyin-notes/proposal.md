# Proposal

## Why

抖音图文(note)解析已整体失效。2026-10-01 实测:图文唯一数据源 `slidesinfo` 匿名接口对所有 note 返回 `filter_list reason:8`、`aweme_details: null`;分享页 HTML 不再内嵌媒体数据(只有 itemId,内容改走客户端签名 XHR);Web/App detail API 未签名请求返回空响应。所有替代来源均已确认不可用,图文 100% 报 SOURCE_UNAVAILABLE。

## What Changes

- 在 `packages/platform/douyin` 内实现 a_bogus 请求签名和 ttwid cookie bootstrap(不引入共享 Session 类型,cookie 与签名留在平台包内)
- 新增统一的 Web detail 数据源(`douyin.com/aweme/v1/web/aweme/detail/`),视频与图文同路径取详情
- 图文解析路径从 slidesinfo 切换到 Web detail;feed 保留为视频的快速路径,Web detail 作为视频兜底与图文唯一来源
- 签名与 cookie 失效时返回 typed error(`UPSTREAM_BLOCKED`),不静默降级到错误数据

## Capabilities

### New Capabilities

- `douyin-extraction`: 抖音作品解析能力——短链/长链解析为 CanonicalResource,视频经公开 feed 取详情,图文与 feed 未命中视频经签名的 Web detail 取详情,产出 MediaPost

### Modified Capabilities

(无既有 specs,全部为新增)

## Impact

- 代码:`packages/platform/douyin/src/`(session.ts、index.ts,新增 signer 实现替换现有 fixture 占位 signer.ts)
- 边界:只触及 douyin 平台包;core 的 Transport 契约不变;`signer.ts` 当前为 fixture 占位,本次变为生产实现
- 依赖:a_bogus 为纯 TS 实现,Worker 只用 Web API(crypto.subtle),不引入原生依赖
- 风险:签名算法属逆向成果,抖音可能轮换;需要可观测的失败信号与回退策略
