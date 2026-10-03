/**
 * Release health gate. Reads Worker telemetry (error rate, p95 wall, p95 CPU)
 * for a baseline and a candidate window, and runs synthetic checks against the
 * live URL. Exit 0 = healthy, 1 = unhealthy.
 *
 * Telemetry needs CLOUDFLARE_API_TOKEN with Workers analytics read and
 * CLOUDFLARE_ACCOUNT_ID. When the token cannot read analytics, the gate falls
 * back to synthetic checks only and says so. Synthetic failures always fail.
 */
import { healthThresholds, workerName } from "./config.ts"

interface Metrics {
  readonly requests: number
  readonly errors: number
  readonly p95DurationMs: number
  readonly p95CpuMs: number
}

interface Args {
  readonly baselineMinutes: number
  readonly candidateMinutes: number
}

function parseArgs(argv: readonly string[]): Args {
  let baselineMinutes = 30
  let candidateMinutes = 10
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--baseline-minutes") baselineMinutes = Number(argv[i + 1])
    if (argv[i] === "--candidate-minutes") candidateMinutes = Number(argv[i + 1])
  }
  return { baselineMinutes, candidateMinutes }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function metrics(accountId: string, token: string, minutesAgo: number, untilMinutesAgo: number): Promise<Metrics | undefined> {
  const now = Date.now()
  const from = new Date(now - minutesAgo * 60_000).toISOString()
  const to = new Date(now - untilMinutesAgo * 60_000).toISOString()
  const query = {
    query: `query ($accountTag: String!, $from: Time!, $to: Time!, $script: String!) {
      viewer { accounts(filter: {accountTag: $accountTag}) {
        workersInvocationsAdaptiveGroups(
          limit: 1
          filter: { scriptName: $script, datetime_geq: $from, datetime_lt: $to }
        ) {
          sum { requests errors }
          quantiles { wallTimeP95: durationP95 cpuTimeP95 }
        }
      } }
    }`,
    variables: { accountTag: accountId, from, to, script: workerName },
  }
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return undefined
  const body: unknown = await response.json()
  if (!isRecord(body) || !isRecord(body.data)) return undefined
  const viewer = body.data.viewer
  if (!isRecord(viewer) || !Array.isArray(viewer.accounts)) return undefined
  const account = viewer.accounts[0]
  if (!isRecord(account)) return undefined
  const groups = account.workersInvocationsAdaptiveGroups
  if (!Array.isArray(groups)) return undefined
  const first = groups[0]
  if (!isRecord(first)) return undefined
  const sum = isRecord(first.sum) ? first.sum : {}
  const quantiles = isRecord(first.quantiles) ? first.quantiles : {}
  return {
    requests: typeof sum.requests === "number" ? sum.requests : 0,
    errors: typeof sum.errors === "number" ? sum.errors : 0,
    p95DurationMs: typeof quantiles.wallTimeP95 === "number" ? quantiles.wallTimeP95 : 0,
    p95CpuMs: typeof quantiles.cpuTimeP95 === "number" ? quantiles.cpuTimeP95 : 0,
  }
}

async function synthetic(baseUrl: string): Promise<{ homepageMs: number; extractMs: number }> {
  const homeStart = performance.now()
  const home = await fetch(baseUrl, { signal: AbortSignal.timeout(healthThresholds.homepageMaxMillis) })
  const homepageMs = performance.now() - homeStart
  if (!home.ok) throw new Error(`homepage answered HTTP ${home.status}`)

  const extractStart = performance.now()
  const extract = await fetch(`${baseUrl}/api/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://fixture.test/video/demo" }),
    signal: AbortSignal.timeout(healthThresholds.extractMaxMillis),
  })
  const extractMs = performance.now() - extractStart
  const body: unknown = await extract.json()
  if (!(typeof body === "object" && body !== null && (body as { ok?: boolean }).ok === true)) {
    throw new Error("fixture extract did not return ok")
  }
  return { homepageMs: Math.round(homepageMs), extractMs: Math.round(extractMs) }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = process.env.RELEASE_BASE_URL ?? "https://fetchr.hanyang.app"
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID

  console.log("Release Health Gate\n")
  let healthy = true

  // Synthetic checks are always authoritative.
  try {
    const result = await synthetic(baseUrl)
    console.log(`synthetic: homepage ${result.homepageMs}ms, fixture extract ${result.extractMs}ms  PASS`)
  } catch (error) {
    console.log(`synthetic: FAIL (${error instanceof Error ? error.message : String(error)})`)
    healthy = false
  }

  if (token === undefined || accountId === undefined) {
    console.log("telemetry: SKIPPED (no CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID)")
  } else {
    const [baseline, candidate] = await Promise.all([
      metrics(accountId, token, args.baselineMinutes, args.candidateMinutes),
      metrics(accountId, token, args.candidateMinutes, 0),
    ])
    if (baseline === undefined || candidate === undefined) {
      console.log("telemetry: SKIPPED (analytics unreadable with this token)")
    } else if (candidate.requests === 0 && baseline.requests === 0) {
      console.log("telemetry: SKIPPED (no traffic in either window)")
    } else {
      const baseErr = baseline.requests > 0 ? baseline.errors / baseline.requests : 0
      const candErr = candidate.requests > 0 ? candidate.errors / candidate.requests : 0

      const errOk =
        candErr < healthThresholds.maxErrorRate &&
        candErr - baseErr <= healthThresholds.maxErrorRateIncrease
      console.log(
        `error_rate: baseline ${pct(baseErr)} candidate ${pct(candErr)}  ${errOk ? "PASS" : "FAIL"}`,
      )
      healthy &&= errOk

      if (baseline.p95DurationMs > 0 && candidate.p95DurationMs > 0) {
        const ratio = candidate.p95DurationMs / baseline.p95DurationMs
        const ok = ratio <= healthThresholds.maxDurationRegression
        console.log(
          `p95 wall: baseline ${baseline.p95DurationMs.toFixed(0)}ms candidate ${candidate.p95DurationMs.toFixed(0)}ms (${((ratio - 1) * 100).toFixed(1)}%)  ${ok ? "PASS" : "FAIL"}`,
        )
        healthy &&= ok
      }
      if (baseline.p95CpuMs > 0 && candidate.p95CpuMs > 0) {
        const ratio = candidate.p95CpuMs / baseline.p95CpuMs
        const ok = ratio <= healthThresholds.maxCpuRegression
        console.log(
          `p95 cpu: baseline ${baseline.p95CpuMs.toFixed(1)}ms candidate ${candidate.p95CpuMs.toFixed(1)}ms (${((ratio - 1) * 100).toFixed(1)}%)  ${ok ? "PASS" : "FAIL"}`,
        )
        healthy &&= ok
      }
    }
  }

  console.log(`\nRESULT: ${healthy ? "PASS" : "FAIL"}`)
  if (!healthy) process.exitCode = 1
}

await main()
