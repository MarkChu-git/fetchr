# CI/CD

这个仓库的验证与发布分三层：PR 快速检查、PR preview 检查、发布管线。所有门槛的阈值集中在 `performance/budgets.json`、`bench/baseline.json` 和 `scripts/release/config.ts`。

## PR 验证

| Workflow | 内容 | 门禁 |
| --- | --- | --- |
| ci.yml | verify(lint/typecheck/test/build/OSV/semgrep/gitleaks/actionlint/zizmor)+ e2e(Playwright 本地 preview) | 阻塞 |
| performance.yml | `bun run bench`(阻塞档 >10% 回归失败)+ `bun run bundle:check`(绝对上限 + 相对基线) | 阻塞；信息档只警告 |
| compatibility.yml | `bun run generate:check`(routeTree 与分享资源漂移)+ `bun run compat`(OpenAPI/数据库如实报跳过) | 阻塞 |
| preview.yml | cf 部署 preview 版本 → 评论 URL → Playwright/Lighthouse/k6 smoke 全部打 preview | 阻塞 |

bench 的阻塞档:`detectUrls` 和代理令牌 sign+verify。亚微秒的 match 基准噪声大，只做信息档。

`generate:check` 除了 routeTree，也守分享资源：先比对分享图输入的哈希与已提交 PNG 的内容哈希（不渲染，所以在 macOS 和 Linux 上结论一致），再构建并 diff `routeTree.gen.ts`。文案、logo 或模板改了而图没重画，它就失败，并提示运行 `bun run generate`。

bundle 预算基线（gzip):总量 561KB、JS 370KB、主入口 104KB、最大 chunk 134KB；绝对上限 650KB、430KB、130KB、170KB，相对基线涨 5% 警告、10% 失败。基线用 `bun run bundle:check -- --write` 更新,bench 基线用 `bun run bench -- --write`。分享图与图标 PNG 也在 `dist/client` 里，计入总量（PNG 几乎压不动），所以加分享图时总量基线上调了约 36KB。

Lighthouse 打 preview URL（不再打 localhost)，三跑取中位。资源预算是硬门（JS/CSS/总量/零第三方请求）;LCP/CLS/TBT 里 LCP 和 TBT 是警告，CLS >0.25 才算失败。

## 发布管线(release.yml,tag 触发)

```text
tag vX.Y.Z(semver 校验)
  → verify:fast
  → cf build(只构建一次,产物 .cloudflare/output)
  → build-metadata.json(commit/repo/bun/cf/时间戳/artifact sha256)
  → syft SBOM(spdx-json)
  → actions/attest 分别给 artifact 和 SBOM 出证明
  → GitHub Release(附件:artifact + SBOM + metadata)
  → cf workers versions create --prebuilt(上传的正好是 attest 过的那个 artifact)
  → 版本 URL 冒烟(release:health 的合成检查)
  → promote:1% → 5% → 25% → 50% → 100%,每档观察 120s 后过健康门
```

健康门(`scripts/release/health-gate.ts`)：合成检查（首页 + fixture 解析）永远说了算；Worker 遥测（错误率绝对值 <1% 且相对基线 +≤0.5pp、p95 wall 回退 ≤20%、p95 CPU 回退 ≤25%）在 token 有 analytics 权限时生效，没有就如实报跳过。任何一档失败自动回滚到发布前的版本并停住。

日常 main 推送走 deploy.yml:preview 冒烟 → 100% → 线上冒烟 → 失败回滚(`scripts/ci/publish-worker.ts`)。release 的 1/5/25/50/100 只在打 tag 时。

nightly.yml(每天 03:17 UTC)：全量 verify + bench + 部署一次性 preview + k6 load(20 VU 5 分钟)+ soak(5 VU 15 分钟）。不碰生产。

## 回滚

```sh
bun run release:rollback -- --version <上一个版本 id>
```

Worker 回滚不碰数据库。这个仓库当前没有数据库；将来有了，迁移必须向后兼容（expand → migrate → contract)。

## 本地跑法

```sh
bun run verify:fast    # 每次改动后
bun run verify         # 完成前
bun run policy         # semgrep 策略(先 pipx install semgrep)
bun run test:e2e       # Playwright(本地构建 preview)
bun run bench          # 基准门禁
bun run bundle:check   # bundle 预算(先 bun run build)
K6_TARGET=http://localhost:4173 bun run perf:smoke   # k6(本机装 k6)
BASE_URL=https://<preview> bunx playwright test      # e2e 打远端
```

## 需要的机密

| Secret | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | preview/发布部署 + 健康门遥测(建议加 Workers analytics 读权限) |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 id |
| `FETCHR_PROXY_SECRET` | preview 版本的下载签名密钥 |
