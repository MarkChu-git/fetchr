# 界面用 Astryx 和 StyleX

Web 客户端用 Astryx（`@astryxdesign/core`，React 19，MIT）做组件，用 StyleX 写产品自己的布局。不用 Tailwind，也不用 shadcn。Astryx 只出现在 `apps/web`。Core 和平台包不依赖它。

外观从 Stone 主题出发，明暗跟随系统。页面上最亮的是封面和视频，控件让开。Astryx 从源码编译进 Vite，Worker 只带用到的组件，不引入整份预编译 CSS。

Astryx 仍是 beta，版本要钉死。`astryx init` 如果写 AGENTS.md，只能追加，不能覆盖已有的 Agent skills 段。

选它是因为界面要有一套完整的可访问组件和主题，而不是再铺一层 utility class。Tailwind 是原计划里的做法，这里故意换掉。
