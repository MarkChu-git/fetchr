import { detectUrls } from "@fetchr/core"
import { douyinExtractor } from "@fetchr/platform-douyin"
import type { Bench } from "./index"

const shareText =
  "7.99 复制打开抖音，看看【华晨宇的作品】好期待啊 https://v.douyin.com/pXTocBElZXY/ 12/05 CHV:/ e@b.an，还有 https://www.douyin.com/video/7686426390447720006 也看看"

export const benches: Bench[] = [
  {
    name: "detectUrls: share text with two links",
    blocking: true,
    run: () => {
      detectUrls(shareText)
    },
  },
  {
    name: "douyin match: video url",
    // Sub-microsecond; too noisy to gate on.
    blocking: false,
    run: () => {
      douyinExtractor.match(new URL("https://www.douyin.com/video/7686426390447720006"))
    },
  },
  {
    name: "douyin match: unrelated url",
    blocking: false,
    run: () => {
      douyinExtractor.match(new URL("https://example.com/some/page?with=query"))
    },
  },
]
