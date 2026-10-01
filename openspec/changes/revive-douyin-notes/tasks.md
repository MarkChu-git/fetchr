# Tasks

## 1. 签名模块

- [x] 1.1 在 `packages/platform/douyin/src/sign/` 落地 a_bogus 纯 TS 实现,固定输入对拍已知签名输出的单测通过(只用 Web API,不碰 Bun/Node API)
- [x] 1.2 实现 ttwid cookie 引导与模块级 24h TTL 缓存,单测覆盖"冷引导、命中缓存、403 后重新引导并重试一次仍失败报 UPSTREAM_BLOCKED"

## 2. Web detail 数据源

- [x] 2.1 在 `session.ts` 新增 `webDetailRequest(id)`,组装签名后的 detail 请求;`bun test` 通过且 typecheck 干净
- [x] 2.2 `parser.ts`/`index.ts` 接入 Web detail 载荷解码(Effect Schema),真实响应样例 fixture 解码通过,空响应报 UPSTREAM_BLOCKED 而非 MEDIA_NOT_FOUND

## 3. 解析路径切换

- [x] 3.1 图文路径:`/note/{id}` 与 share/note|slides 直连 Web detail,端到端测试(图文 fixture → 图片 MediaPost)通过
- [x] 3.2 视频兜底:feed 两台主机未命中后走 Web detail,测试覆盖"feed 空、Web detail 有 → 返回视频"与"两者都无 → SOURCE_UNAVAILABLE"
- [x] 3.3 移除 slidesRequest 及 slidesinfo 调用,相关旧测试改写或删除,`bun test` 全绿

## 4. 收尾验证

- [x] 4.1 全仓 lint、typecheck、`bun test` 通过;GitNexus detect-changes 无意外影响面
- [x] 4.2 真实网络冒烟:生产或本地 Worker 对真实图文短链返回图片 MediaPost,对私密作品返回 PRIVATE_MEDIA
