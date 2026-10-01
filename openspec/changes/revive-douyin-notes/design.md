# Design

## Context

现状见 proposal.md。约束:生产只有一个 Cloudflare Worker,代码只能用 Web API(不能用 Bun/Node API);cookie 与签名留在 `packages/platform/douyin` 内,core 只注入 Transport;不引入共享 Session 类型。现有 `signer.ts` 是 fixture 占位,注释明确"不得作为生产签名"。

## Goals / Non-Goals

**Goals:**

- 图文(note)恢复可解析,视频在 feed 漏收时有兜底
- 签名与凭证引导完全自闭环在 douyin 包内,纯 TS + Web API,可在 Worker 运行
- 签名失效可观测(独立错误码与日志),不污染"作品不存在"的语义

**Non-Goals:**

- 不解析需登录、私密、付费、DRM 内容(访问控制边界不变)
- 不做多账号、cookie 池、持久化凭证存储(MVP 无数据库,凭证只活在单次请求或模块级短 TTL 缓存)
- 不改 core Transport 契约、不改其他平台包
- 不处理直播、合集、个人主页等非作品链接

## Decisions

### D1: a_bogus 用纯 TS 移植,不用外部签名服务或浏览器

Web detail 接口强制校验 a_bogus(未签名返回空 200)。候选方案:

- **纯 TS 移植**(选定):参考公开的逆向实现,把 a_bogus 算法落为 `packages/platform/douyin/src/sign/` 下的纯函数模块。自包含、可单测、可跑在 Worker。代价是抖音轮换算法时要跟进。
- 外部签名服务:引入网络依赖与不可用点,违背"Worker 自包含",排除。
- Playwright/headless:Worker 上不可行,排除。
- 退回 X-Bogus:detail 接口已不接受,排除。

签名输入为查询参数 + User-Agent 等,输出追加到查询串。具体算法细节属实现层,不进本文档。

### D2: ttwid 用模块级短 TTL 缓存,单次冷引导

Web detail 要求 `ttwid` cookie。引导方式:请求 `douyin.com` 首页(或 passport 端点)读取 Set-Cookie。ttwid 有效期约数周,但 Worker 实例不保证常驻——用模块级缓存 + 24h TTL,过期或 403/空响应时重新引导一次,重试一次后仍失败报 `UPSTREAM_BLOCKED`。不做持久化(MVP 无存储),冷启动代价是一次额外请求。

### D3: 视频保留 feed 快速路径,Web detail 只做兜底;图文直连 Web detail

- 视频:feed 目前可用且免签名、快。feed 两台主机都未命中时再走 Web detail 区分"漏收"与"不存在"。
- 图文:feed 不含 note,slidesinfo 已死,直接走 Web detail。
- 备选"全部走 Web detail"被否:每次解析都带签名,暴露面与轮换风险集中;feed 免费且快。

### D4: 删除 slidesinfo 路径

slidesinfo 对图文已全部 reason:8,保留只会产生误导性的"兜底"。Web detail 落地后从 `session.ts`/`index.ts` 移除 slidesRequest 及其调用,原"feed 未命中再问 slidesinfo"的 modal_id 分支改问 Web detail。

### D5: 签名模块接口最小化

`sign/` 对外只暴露 `signDetailRequest(url, headers, cookie): Request` 级别的组装函数和 bootstrap/cookie 读取函数。解析层(`index.ts`)只看见"取详情"一个 Effect,签名轮换时只动 `sign/` 内部。

## Risks / Trade-offs

- [抖音轮换 a_bogus 算法] → 签名失败表现为全部 Web detail 请求 `UPSTREAM_BLOCKED`,日志可观测;`sign/` 模块隔离,跟进只改一处;feed 快速路径不受影响,视频解析大部分仍可用
- [Worker 出口 IP 被 Argus 针对] → 引导与签名请求加超时与单次重试;持续失败报 `UPSTREAM_BLOCKED` 而非假"不存在";上线后观察生产日志
- [逆向实现的合规风险] → 只访问公开匿名接口,不模拟登录、不绕过访问控制;与现有 feed 路径性质相同
- [ttwid 引导增加冷启动延迟] → 仅 Web detail 路径需要,视频 feed 路径不受影响;模块级缓存摊薄

## Migration Plan

1. 签名与凭证模块先行,独立单测(固定输入对拍已知签名输出)
2. Web detail 数据源接入,图文路径切换,测试覆盖图文/兜底/失败分类
3. 移除 slidesinfo 路径
4. 回滚:整 PR revert 即回到 feed-only 现状,无数据迁移
