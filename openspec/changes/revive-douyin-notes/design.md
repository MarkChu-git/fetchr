# Design

## Context

动机见 proposal.md。关键实测事实(2026-10-01/02):

- slidesinfo 对所有 note 返回 `reason:8`,已死
- 分享页 HTML 不再内嵌媒体数据;Web/App detail 未签名返回空
- a_bogus + ttwid 的 Web detail 方案已实现并验证签名正确,但 douyin.com 在 IP/ASN 层拒绝 Cloudflare 出口(403 Argus),生产不可用
- feed 携带完整客户端参数时忠实返回目标作品,图文与视频同路径,feed 主机(amemv/snssdk)从 CF 可达——预览环境实测视频正常

## Goals / Non-Goals

**Goals:**

- 图文(note)恢复可解析,与视频共用一条免签名、CF 可达的 feed 路径
- feed 未命中时返回诚实的类型化错误,不再有"接口死了还当兜底"的假路径

**Non-Goals:**

- 不做任何签名(a_bogus / X-Argus 系)与 cookie 引导——已证明生产不可行或不需要
- 不解析需登录、私密、付费、DRM 内容
- 不改 core Transport 契约、不改其他平台包
- 不处理直播、合集、个人主页等非作品链接

## Decisions

### D1: 全参数 feed 取代一切签名方案

feed 在只带 `aweme_id`+`aid` 时忽略 id 返回推荐流;携带完整客户端参数集(version_name/code、device_*、screen_*、locale 等)时忠实返回目标,图文视频皆可。这是实测行为差异,不是文档行为。参数集随 app 版本绑定,写在 `session.ts` 一处。

被否方案:

- **a_bogus + Web detail**(已落地后拆除):住宅 IP 可用,CF 出口 403,生产不成立。代码保留在 git 历史(commit `feat: revive douyin image notes through the signed web detail`),若未来引入非 CF 出口可复活
- **移动端签名(X-Argus/X-Gorgon/X-Ladon/X-Khronos)**:移动端 detail 端点全部签名门,逆向与维护成本最高;feed 方案成立后不需要
- **外部转发/住宅代理**:引入外部依赖,违背单 Worker 自洽

### D2: 视频与图文同路径,modal_id 的归属由响应判定

feed 同时服务两种作品,`index.ts` 不再有 `/note/` 分支。modal_id 入口默认 canonical 为 `/video/{id}`;feed 返回的 media 含图片时,把 canonicalUrl 改写为 `/note/{id}`。`/note/` 直连与 share/note|slides 入口的 canonical 由 resolver 保证,无需改写。

### D3: feed 未命中 = SOURCE_UNAVAILABLE

两台 feed 主机都未返回目标时,作品不存在、被删、私密过滤或区域限制皆有可能,统一 `SOURCE_UNAVAILABLE`。实测确认:被各接口一致过滤的 note(如 7305979335058492724)确实不可用,不是误报。

## Risks / Trade-offs

- [抖音收紧参数校验或轮换版本号] → 表现为 SOURCE_UNAVAILABLE 率上升,生产日志可观测;参数集集中在 `session.ts` 一处跟进
- [feed 返回目标但字段缺图片] → parseDetail 现有 MEDIA_NOT_FOUND 语义覆盖
- [feed 对 CF 出口的限流] → 双主机互备;预览环境实测视频与图文均正常

## Migration Plan

1. feedRequest 参数集 + 测试改造,一次提交
2. 拆除 Web detail 代码(sign/、detail.ts),同 PR
3. 回滚:revert PR 即回到旧行为,无数据迁移
