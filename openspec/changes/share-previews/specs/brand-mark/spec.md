# Spec Delta

## Purpose

规定站点标志的外观与图标集：F 加橙色圆点的几何与配色、favicon 在深色模式下的行为，以及各尺寸图标的格式，使标签页、书签、主屏幕和分享图上的标志一致且可辨认。

## ADDED Requirements

### Requirement: 标志的几何与配色
`apps/web/public/logo.svg` SHALL 是 64×64 视口的自包含 SVG：圆角 15 的墨色底板（`#25252a`），其上是纸色（`#f3f3f5`）的 F 和一个橙色（`#e9592a`）圆点。F 由竖杆（x 17..28，y 11..53）、上横（x 17..47，y 11..21）、中横（x 17..39，y 27..37）三个圆头条组成；圆点圆心为 (40, 47.5)，半径 5.5。SVG MUST NOT 含文字、外部引用或脚本。

#### Scenario: 自包含
- **WHEN** 检查 `logo.svg` 与 `favicon.svg`
- **THEN** 两者都不含 `<text>`、`<script>`、`<image>`、`href` 或 `@import`

#### Scenario: 颜色
- **WHEN** 读取 `logo.svg`
- **THEN** 底板为 `#25252a`，F 为 `#f3f3f5`，圆点为 `#e9592a`

### Requirement: 橙色圆点的对比度
圆点颜色 SHALL 对纸色（`#f3f3f5`）与墨色（`#25252a`）的对比度均不低于 3:1。

#### Scenario: 对比度
- **WHEN** 按 WCAG 相对亮度公式计算 `#e9592a` 对 `#f3f3f5` 与对 `#25252a` 的对比度
- **THEN** 两者都不低于 3:1

### Requirement: favicon 随系统深色模式反相
`favicon.svg` SHALL 在浅色模式下为墨底纸字，在系统深色模式下底板与 F 对调（纸色底板、`#17171b` 的 F），橙色圆点保持不变。其图形的位置与尺寸 SHALL 与 `logo.svg` 完全一致。

#### Scenario: 深色模式
- **WHEN** 在 `prefers-color-scheme: dark` 下渲染 `favicon.svg`
- **THEN** 底板为 `#f3f3f5`，F 为 `#17171b`，圆点仍为 `#e9592a`

#### Scenario: 几何一致
- **WHEN** 比较 `favicon.svg` 与 `logo.svg` 里各图形的位置与尺寸
- **THEN** 两者完全一致

### Requirement: 图标集的格式与尺寸
`favicon-32.png` SHALL 为 32×32 带透明通道的 PNG，保留底板圆角。`apple-touch-icon.png` SHALL 为 180×180、不含透明像素、无圆角的整块墨色底（iOS 自行裁圆角）。两者都由 `logo.svg` 渲染得到。页面 `<head>` 里的图标链接 SHALL 继续指向 `/favicon.svg`、`/favicon-32.png` 与 `/apple-touch-icon.png`。

#### Scenario: 尺寸与通道
- **WHEN** 读取两个 PNG 的头
- **THEN** `favicon-32.png` 为 32×32 且颜色类型含 alpha，`apple-touch-icon.png` 为 180×180

#### Scenario: 整块墨底
- **WHEN** 检查 `apple-touch-icon.png` 四个角的像素
- **THEN** 它们都是不透明的 `#25252a`

#### Scenario: 图标链接不变
- **WHEN** 渲染任意页面
- **THEN** `<head>` 里仍有指向 `/favicon.svg`、`/favicon-32.png` 与 `/apple-touch-icon.png` 的链接
