/** Shared cf CLI helpers for the publish and release scripts. */

export const workerName = "fetchr-web"
export const liveDomain = "https://fetchr.hanyang.app"

export async function runCf(args: readonly string[]): Promise<string> {
  const child = Bun.spawn(["bunx", "cf", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await child.exited
  const stdout = await new Response(child.stdout).text()
  const stderr = await new Response(child.stderr).text()
  if (code !== 0) {
    console.error(stderr)
    throw new Error(`cf ${args.join(" ")} exited ${code}.`)
  }
  return `${stdout}\n${stderr}`
}

const versionIdPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const previewUrlPattern = /https:\/\/[0-9a-f]{8}-[a-z0-9-]+\.[a-z0-9.-]+\.workers\.dev/i

/** cf prints the new version as a UUID plus a workers.dev preview URL, in any panel shape. */
export function versionUploadFrom(output: string): { readonly versionId: string; readonly previewUrl: string } {
  const versionId = versionIdPattern.exec(output)?.[0] ?? ""
  const previewUrl = previewUrlPattern.exec(output)?.[0] ?? ""
  if (versionId.length === 0 || previewUrl.length === 0) {
    throw new Error("Version upload did not return a version id and a preview URL.")
  }
  return { versionId, previewUrl }
}

/** Preview hosts look like `<8 hex chars>-fetchr-web.<account>.workers.dev`. */
export function liveUrlFromPreview(previewUrl: string): string {
  let hostname: string
  try {
    const parsed = new URL(previewUrl)
    if (parsed.protocol !== "https:") throw new Error("Version preview URL is missing.")
    hostname = parsed.hostname
  } catch (error) {
    if (error instanceof Error && error.message === "Version preview URL is missing.") throw error
    throw new Error("Version preview URL is missing.", { cause: error })
  }
  const match = /^([0-9a-f]{8})-(.+)$/i.exec(hostname)
  const liveHost = match?.[2]
  if (liveHost === undefined) throw new Error("Version preview URL has no version prefix.")
  if (!liveHost.startsWith(`${workerName}.`) || !liveHost.endsWith(".workers.dev")) {
    throw new Error("Version preview URL is not a workers.dev preview.")
  }
  return `https://${liveHost}`
}

export function workersDevUrlFrom(output: string): string {
  const urls = output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9.-]+\.workers\.dev/gi) ?? []
  const preferred = urls.find((url) => url.includes(`${workerName}.`)) ?? urls[0]
  if (preferred === undefined) {
    // The custom domain is always attached to production traffic.
    return liveDomain
  }
  return preferred.replace(/\/$/, "")
}

/** Find the end of the balanced JSON object starting at `start`, honoring strings and escapes. */
const endOfJsonObject = (input: string, start: number): number | undefined => {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < input.length; index++) {
    const char = input[index]
    if (char === undefined) return undefined
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === "\"") inString = false
      continue
    }
    if (char === "\"") {
      inString = true
      continue
    }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return undefined
}

/** Parse the version serving traffic from `cf workers deployments list` output. */
export function deploymentVersionFrom(output: string): string | undefined {
  // cf prints a text header before the JSON body, and runCf appends stderr after
  // stdout — the body is a balanced object, so parse up to its closing brace
  // instead of to end-of-output.
  const start = output.indexOf("{")
  if (start < 0) return undefined
  const end = endOfJsonObject(output, start)
  if (end === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(output.slice(start, end))
    if (typeof parsed !== "object" || parsed === null) return undefined
    const deployments = (parsed as { deployments?: unknown }).deployments
    if (!Array.isArray(deployments) || deployments.length === 0) return undefined
    const latest: unknown = deployments[0]
    if (typeof latest !== "object" || latest === null) return undefined
    const versions = (latest as { versions?: unknown }).versions
    if (!Array.isArray(versions)) return undefined
    const first: unknown = versions[0]
    if (typeof first !== "object" || first === null) return undefined
    const id = (first as { version_id?: unknown }).version_id
    return typeof id === "string" && versionIdPattern.test(id) ? id : undefined
  } catch {
    return undefined
  }
}

/** The version serving traffic right now, from the latest deployment. */
export async function servingVersion(): Promise<string> {
  const output = await runCf(["workers", "deployments", "list", "--worker", workerName])
  const id = deploymentVersionFrom(output)
  if (id === undefined) {
    throw new Error(`current deployment has no version; cf said: ${output.slice(0, 400)}`)
  }
  return id
}

/** Shift traffic. percent < 100 splits with the previous version; 100 takes over. */
export async function shiftTraffic(
  candidate: string,
  previous: string,
  percent: number,
  bypassChecks = false,
): Promise<void> {
  const versions =
    percent >= 100
      ? [{ version_id: candidate, percentage: 100 }]
      : [
          { version_id: candidate, percentage: percent },
          { version_id: previous, percentage: 100 - percent },
        ]
  await runCf([
    "workers",
    "deployments",
    "create",
    "--worker",
    workerName,
    "--strategy",
    "percentage",
    "--versions",
    JSON.stringify(versions),
    // bypass exists for rollbacks: Cloudflare blocks redeploying an older
    // version when secrets changed in between. Canary stages must not use it.
    ...(bypassChecks ? ["--bypass-deployment-checks"] : []),
  ])
  console.log(`traffic: ${percent}% -> ${candidate}`)
}
