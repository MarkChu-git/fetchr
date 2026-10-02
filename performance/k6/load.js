// Nightly load: broader sustained traffic against the preview. Not a PR gate.
import http from "k6/http"
import { check } from "k6"

const target = __ENV.K6_TARGET
if (!target) throw new Error("K6_TARGET is required")

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "3m", target: 20 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
}

export default function () {
  const res = http.get(`${target}/`)
  check(res, { "home 200": (r) => r.status === 200 })
}
