/**
 * Publish the Worker without printing secrets.
 * versions upload cannot create the first Worker, so that case deploys once.
 * Later publishes check the version URL, then shift all traffic, and roll back when the live check fails.
 */
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const workerName = "fetchr-web"

export function requireSecret(secret: string | undefined): string {
  if (secret === undefined || secret.length < 16) {
    throw new Error("FETCHR_PROXY_SECRET must be at least 16 characters.")
  }
  return secret
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

export function versionUploadFrom(jsonl: string): { readonly versionId: string; readonly previewUrl: string } {
  const event = lastEvent(jsonl, "version-upload")
  const versionId = stringField(event, "version_id")
  const previewUrl = stringField(event, "preview_url")
  if (versionId.length === 0 || previewUrl.length === 0) {
    throw new Error("Version upload did not return a version id and a preview URL.")
  }
  return { versionId, previewUrl }
}

export function workersDevUrlFrom(jsonl: string): string {
  const event = lastEvent(jsonl, "deploy")
  const targets = event.targets
  if (!Array.isArray(targets)) throw new Error("Deploy did not list targets.")
  const urls = targets.filter(
    (item): item is string =>
      typeof item === "string" && item.startsWith("https://") && item.includes(".workers.dev"),
  )
  const preferred = urls.find((item) => item.startsWith(`https://${workerName}.`)) ?? urls[0]
  if (preferred === undefined) throw new Error("Deploy did not print a workers.dev URL.")
  return preferred.replace(/\/$/, "")
}

export async function smokeWorker(url: string): Promise<void> {
  const base = url.replace(/\/$/, "")
  await waitForHomepage(base)
  await waitForRejectedExtract(base)
}

async function main(): Promise<void> {
  const secret = requireSecret(process.env.FETCHR_PROXY_SECRET)
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (token === undefined || token.length === 0 || accountId === undefined || accountId.length === 0) {
    throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.")
  }

  const directory = await mkdtemp(join(tmpdir(), "fetchr-publish-"))
  try {
    const secretPath = join(directory, "secrets.json")
    await writeFile(secretPath, JSON.stringify({ FETCHR_PROXY_SECRET: secret }), { mode: 0o600 })
    const message = publishMessage(process.env.GITHUB_SHA)
    const exists = await workerExists(accountId, token)
    if (!exists) {
      await publishFirstWorker(directory, secretPath, message)
      return
    }
    await publishExistingWorker(directory, secretPath, message)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function publishMessage(sha: string | undefined): string {
  const short = sha?.slice(0, 7)
  if (short === undefined || short.length === 0) return "fetchr publish"
  return `fetchr ${short}`
}

async function publishFirstWorker(directory: string, secretPath: string, message: string): Promise<void> {
  const outputPath = join(directory, "deploy.jsonl")
  await runWrangler(["deploy", "--secrets-file", secretPath, "--message", message], outputPath)
  const live = workersDevUrlFrom(await readFile(outputPath, "utf8"))
  try {
    await smokeWorker(live)
  } catch (error) {
    await rollback(directory, error)
  }
}

async function publishExistingWorker(directory: string, secretPath: string, message: string): Promise<void> {
  const outputPath = join(directory, "upload.jsonl")
  await runWrangler(
    ["versions", "upload", "--secrets-file", secretPath, "--message", message],
    outputPath,
  )
  const uploaded = versionUploadFrom(await readFile(outputPath, "utf8"))
  await smokeWorker(uploaded.previewUrl)
  await runWrangler(
    ["versions", "deploy", `${uploaded.versionId}@100%`, "-y", "--message", message],
    join(directory, "promote.jsonl"),
  )
  try {
    await smokeWorker(liveUrlFromPreview(uploaded.previewUrl))
  } catch (error) {
    await rollback(directory, error)
  }
}

async function rollback(directory: string, error: unknown): Promise<never> {
  try {
    await runWrangler(
      ["rollback", "-y", "--message", "Live smoke failed"],
      join(directory, "rollback.jsonl"),
    )
  } catch (rollbackError) {
    const smokeText = error instanceof Error ? error.message : "Live smoke failed."
    const rollbackText = rollbackError instanceof Error ? rollbackError.message : "rollback failed"
    throw new Error(`${smokeText} Rollback also failed: ${rollbackText}`, { cause: rollbackError })
  }
  throw error
}

async function workerExists(accountId: string, token: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  )
  await response.body?.cancel()
  if (response.status === 200) return true
  if (response.status === 404) return false
  throw new Error(`Worker lookup returned HTTP ${response.status}.`)
}

function runWrangler(args: readonly string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bunx", ["wrangler", ...args], {
      stdio: "inherit",
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputPath },
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`wrangler ${args.join(" ")} exited ${code ?? "null"}.`))
    })
  })
}

async function waitForHomepage(url: string): Promise<void> {
  let status = "no response"
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      // A cold version URL can fail the first request. The next attempt uses the same address.
      // oxlint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      // oxlint-disable-next-line no-await-in-loop
      const text = await response.text()
      if (response.ok && text.includes("粘贴链接")) return
      status = `HTTP ${response.status}`
    } catch (error) {
      status = error instanceof Error ? error.name : "request failed"
    }
    if (attempt < 6) {
      // oxlint-disable-next-line no-await-in-loop
      await delay(5_000)
    }
  }
  throw new Error(`Homepage smoke failed (${status}).`)
}

async function waitForRejectedExtract(url: string): Promise<void> {
  let status = "no response"
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const response = await fetch(`${url}/api/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "not-a-url" }),
        signal: AbortSignal.timeout(20_000),
      })
      if (response.status === 422) {
        // oxlint-disable-next-line no-await-in-loop
        const body: unknown = await response.json()
        if (isRecord(body) && body.ok === false) return
        status = "HTTP 422 without a failure"
      } else {
        status = `HTTP ${response.status}`
      }
    } catch (error) {
      status = error instanceof Error ? error.name : "request failed"
    }
    if (attempt < 6) {
      // oxlint-disable-next-line no-await-in-loop
      await delay(5_000)
    }
  }
  throw new Error(`Extract smoke failed (${status}).`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function lastEvent(jsonl: string, type: string): Record<string, unknown> {
  let found: Record<string, unknown> | undefined
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const parsed: unknown = JSON.parse(trimmed)
    if (!isRecord(parsed) || parsed.type !== type) continue
    found = parsed
  }
  if (found === undefined) throw new Error(`Wrangler output has no ${type} event.`)
  return found
}

function stringField(event: Record<string, unknown>, key: string): string {
  const value = event[key]
  return typeof value === "string" ? value : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Publish failed."
    console.error(message)
    process.exitCode = 1
  })
}
