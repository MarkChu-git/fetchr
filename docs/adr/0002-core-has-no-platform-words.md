# Core 不收平台黑话，也不收 Session

共享的 CanonicalResource 只有平台、id 和 URL。note、reel、short 留在各自的平台包里，出来一律是 MediaPost。

Cookie、匿名态和签名也留在平台包里。Core 只提供 Transport。一个带 `unknown` 状态的共享 Session 接口两个平台都用不上，还会把平台差异漏进核心。
