import { expect, test } from "bun:test"
import { failureMessage } from "./failure-message"

test("failure copy keeps unsupported, missing media, blocks, and format changes apart", () => {
  expect(failureMessage("UNSUPPORTED_URL")).toBe("这个链接不支持")
  expect(failureMessage("INVALID_URL")).toBe("这个链接不支持")
  expect(failureMessage("PAYLOAD_MISSING")).toBe("页面里没有可下载的内容")
  expect(failureMessage("UPSTREAM_BLOCKED")).toBe("上游暂时拦截了这次请求")
  expect(failureMessage("SCHEMA_CHANGED")).toBe("页面数据格式变了")
  expect(failureMessage("RESOLVE_FAILED")).toBe("这个链接没有解析成功")
  expect(failureMessage("SOURCE_UNAVAILABLE")).toBe("上游没有返回可用页面")
  expect(failureMessage("PAYLOAD_MISSING")).not.toBe(failureMessage("SCHEMA_CHANGED"))
  expect(failureMessage("UPSTREAM_BLOCKED")).not.toBe(failureMessage("SOURCE_UNAVAILABLE"))
  expect(failureMessage("SOURCE_UNAVAILABLE", "en")).toBe("The upstream sent no usable page")
  expect(failureMessage("PRIVATE_MEDIA", "en")).toBe("This post is private")
  expect(failureMessage("SOURCE_UNAVAILABLE", "en")).not.toBe(failureMessage("UPSTREAM_BLOCKED", "en"))
})
