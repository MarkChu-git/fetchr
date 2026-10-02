// PR smoke: short, cheap, blocking. Fixture URLs keep extraction offline.
import http from "k6/http"
import { check } from "k6"

const target = __ENV.K6_TARGET
if (!target) throw new Error("K6_TARGET is required (the preview or local base URL)")

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
  },
}

export default function () {
  const home = http.get(`${target}/`)
  check(home, { "home 200": (r) => r.status === 200 })

  const extract = http.post(
    `${target}/api/extract`,
    JSON.stringify({ url: "https://fixture.test/video/demo" }),
    { headers: { "content-type": "application/json" } },
  )
  check(extract, {
    "extract 200": (r) => r.status === 200,
    "extract has post": (r) => {
      try {
        return JSON.parse(r.body).ok === true
      } catch {
        return false
      }
    },
  })
}
