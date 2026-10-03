// PR smoke: short, cheap, blocking. Fixture URLs keep extraction offline.
// The extract route rate-limits by design; a 429 is an expected answer, not a failure.
import http from "k6/http"
import { check, Rate } from "k6/metrics"

const target = __ENV.K6_TARGET
if (!target) throw new Error("K6_TARGET is required (the preview or local base URL)")

const unexpected = new Rate("unexpected_errors")

export const options = {
  vus: 3,
  duration: "30s",
  thresholds: {
    unexpected_errors: ["rate<0.01"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
  },
}

export default function () {
  const home = http.get(`${target}/`)
  check(home, { "home 200": (r) => r.status === 200 })
  unexpected.add(home.status !== 200)

  const extract = http.post(
    `${target}/api/extract`,
    JSON.stringify({ url: "https://fixture.test/video/demo" }),
    { headers: { "content-type": "application/json" } },
  )
  const expected = extract.status === 200 || extract.status === 429
  check(extract, { "extract ok or rate-limited": () => expected })
  unexpected.add(!expected)
}
