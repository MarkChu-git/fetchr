// Soak: long, low, steady. Watches for slow leaks, not spikes. Nightly only.
import http from "k6/http"
import { check } from "k6"

const target = __ENV.K6_TARGET
if (!target) throw new Error("K6_TARGET is required")

export const options = {
  vus: 5,
  duration: "15m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<4000"],
  },
}

export default function () {
  const res = http.get(`${target}/`)
  check(res, { "home 200": (r) => r.status === 200 })
}
