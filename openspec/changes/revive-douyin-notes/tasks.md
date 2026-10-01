# Tasks

## 1. feed 参数集

- [x] 1.1 `feedRequest` 携带完整客户端参数集,测试断言请求包含 version_code 等关键参数,`bun test` 通过

## 2. 解析路径统一

- [x] 2.1 图文与视频统一走 feed:`/note/` 直连、share/note|slides、modal_id 入口的端到端测试(图文 fixture → 图片 MediaPost)通过
- [x] 2.2 modal_id 入口 feed 返回图片时 canonicalUrl 改写为 `/note/{id}`,测试通过
- [x] 2.3 移除 slidesRequest 及 slidesinfo 调用,相关旧测试改写或删除,`bun test` 全绿

## 3. 收尾验证

- [x] 3.1 全仓 lint、typecheck、`bun test` 通过;GitNexus detect-changes 无意外影响面
- [ ] 3.2 真实网络冒烟:CF preview 对真实图文链接返回图片 MediaPost 且图片可下载,视频回归正常,不存在/被过滤的作品返回类型化错误
