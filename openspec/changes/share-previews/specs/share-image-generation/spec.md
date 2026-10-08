# Spec Delta

## Purpose

规定分享图与图标 PNG 的构建时生成方式：单一来源渲染、体积与调色板约束、缺字与字体完整性检查、确定性，以及 CI 如何发现产物过期，使提交进仓库的图片始终与文案、logo 和字体一致。

## ADDED Requirements

### Requirement: 生成命令产出固定的一组文件
`bun run generate` SHALL 生成并写入以下文件：`apps/web/public/share/og-zh.png` 与 `og-en.png`（1200×630）、`apps/web/public/share/square.png`（600×600）、`apps/web/public/favicon-32.png`（32×32）、`apps/web/public/apple-touch-icon.png`（180×180），以及记录各分享图版本与输入哈希的 `apps/web/src/share-assets.gen.ts`。

#### Scenario: 全量生成
- **WHEN** 运行 `bun run generate`
- **THEN** 上述文件都存在，PNG 头声明的尺寸与上面一致，`share-assets.gen.ts` 中每张分享图的版本等于该文件内容哈希的前 8 位十六进制字符

### Requirement: 文案、标志与字体来自单一来源
分享图上的标签、按钮、平台名 SHALL 取自站点现有的语言文案，大标题 SHALL 取自新增的分享标题文案；标志 SHALL 取自 `apps/web/public/logo.svg` 本身，而不是在生成器里重画。图标 PNG 同样由 `logo.svg` 渲染。改动其中任何一项，重新生成后相关图片随之变化。

#### Scenario: 改文案
- **WHEN** 修改中文的分享大标题并重新生成
- **THEN** `og-zh.png` 的内容与版本哈希变化，`og-en.png` 与 `square.png` 不变

#### Scenario: 改 logo
- **WHEN** 修改 `logo.svg` 并重新生成
- **THEN** 三张分享图与两张图标 PNG 的内容都随之变化

### Requirement: 分享图的体积与调色板
三张分享图 SHALL 为索引色 PNG，调色板不超过 64 个条目。渲染结果里出现的品牌色（`#25252a`、`#f3f3f5`、`#ffffff`、`#e9592a`）SHALL 作为调色板条目被精确保留。每张宽图 SHALL 不超过 25 KB，方图 SHALL 不超过 8 KB。

#### Scenario: 调色板
- **WHEN** 生成任一分享图
- **THEN** PNG 为索引色，调色板条目不超过 64，且包含图中出现的每一种品牌色的精确值

#### Scenario: 体积上限
- **WHEN** 生成完成
- **THEN** `og-zh.png` 与 `og-en.png` 各不超过 25 KB，`square.png` 不超过 8 KB

#### Scenario: 超限时失败
- **WHEN** 某张图量化后超过体积上限，或需要的颜色数超过调色板上限
- **THEN** 生成命令非零退出并指出是哪张图、超了多少，MUST NOT 写入这张图

### Requirement: 缺字时失败并说明
分享文案里出现字体未覆盖的字符时，生成命令 SHALL 以非零状态退出，输出缺失的字符，并提示运行取字体的辅助命令。生成命令 MUST NOT 写入带缺字方框的图片。

#### Scenario: 新增了未覆盖的汉字
- **WHEN** 中文分享大标题新增一个字体切片里没有的汉字，然后运行 `bun run generate`
- **THEN** 命令非零退出并输出缺失字符，不写入任何图片

### Requirement: 字体完整性与许可证
字体文件 SHALL 与锁文件中记录的 sha256 一致，不一致时生成命令与 `generate:check` SHALL 非零退出并指出文件名。锁文件在读入时 SHALL 经 schema 校验，格式不符同样失败。字体的 OFL 许可证文本 SHALL 与字体一起提交。

#### Scenario: 字体被改动
- **WHEN** 任一字体切片的内容与锁文件不符
- **THEN** 生成命令与 `generate:check` 非零退出并指出该文件

#### Scenario: 锁文件格式错误
- **WHEN** 锁文件缺少必需字段或字段类型不对
- **THEN** 生成命令非零退出并说明哪一处不合格，MUST NOT 用未经校验的数据继续

### Requirement: 取字体的辅助命令
仓库 SHALL 提供一条辅助命令，按当前分享文案需要的字符，从固定版本的 `@fontsource/noto-sans-sc` 发布物下载所需字体切片，写入字体目录并更新锁文件（文件名、sha256、来源版本）。下载失败或响应不是 200 时，辅助命令 SHALL 非零退出且不改动已有文件。字符到切片的映射表格式与预期不符时 SHALL 失败，而不是静默漏字。

#### Scenario: 下载失败
- **WHEN** 辅助命令请求某个切片得到非 200 响应
- **THEN** 命令非零退出，字体目录和锁文件保持原样

### Requirement: 确定性
同一台机器上，输入不变时重复运行 `bun run generate` SHALL 产出逐字节相同的 PNG。

#### Scenario: 重复生成
- **WHEN** 连续运行两次 `bun run generate`（两个独立进程）
- **THEN** 所有输出文件的内容哈希相同

### Requirement: generate:check 发现过期产物
`bun run generate:check` SHALL 计算输入哈希（分享文案、logo、模板、字体、渲染依赖的版本），与 `share-assets.gen.ts` 中记录的值比较，并校验已提交的 PNG 内容哈希与记录一致。任一不符时 SHALL 非零退出并提示运行 `bun run generate`，全部相符时 SHALL 通过。该检查 MUST NOT 重新渲染图片。

#### Scenario: 改了文案但没重新生成
- **WHEN** 修改分享文案后直接运行 `bun run generate:check`
- **THEN** 命令非零退出，提示运行 `bun run generate`

#### Scenario: 手改了 PNG
- **WHEN** 把 `og-zh.png` 替换为另一份内容后运行 `bun run generate:check`
- **THEN** 命令非零退出，指出该文件与记录的版本不符

#### Scenario: 一切最新
- **WHEN** 刚运行完 `bun run generate` 就运行 `bun run generate:check`
- **THEN** 命令通过

### Requirement: 可选的重渲染校验
生成命令 SHALL 提供 `--verify-render` 选项：重新渲染并与已提交的 PNG 逐字节比较，不一致时非零退出，且不改动任何文件。该选项不属于 CI 门禁。

#### Scenario: 重渲染一致
- **WHEN** 产物最新时运行带 `--verify-render` 的生成命令
- **THEN** 命令通过，工作区没有任何改动

### Requirement: 生成器不进入 Worker
生成器及其依赖（渲染库、字体）SHALL 只在构建期使用：Worker 与浏览器产物 MUST NOT 包含它们，`apps/web/src/` 下的代码 MUST NOT 引用它们。

#### Scenario: 构建产物
- **WHEN** 构建 Worker
- **THEN** `dist/server` 与 `dist/client` 里没有渲染库的 wasm，也没有生成器使用的字体文件
