/**
 * Publish the Worker with the cf CLI without printing secrets.
 * versions create cannot create the first Worker, so that case deploys once.
 * Later publishes check the version URL, then shift all traffic, and roll back when the live check fails.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  liveUrlFromPreview,
  runCf,
  servingVersion,
  shiftTraffic,
  versionUploadFrom,
  workerName,
  workersDevUrlFrom,
} from "../release/cf.ts"

export function requireSecret(secret: string | undefined): string {
  if (secret === undefined || secret.length < 16) {
    throw new Error("FETCHR_PROXY_SECRET must be at least 16 characters.")
  }
  return secret
}

async function smokeWorker(url: string): Promise<void> {
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
      await publishFirstWorker(secretPath, message)
      return
    }
    await publishExistingWorker(secretPath, message)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function publishMessage(sha: string | undefined): string {
  const short = sha?.slice(0, 7)
  if (short === undefined || short.length === 0) return "fetchr publish"
  return `fetchr ${short}`
}

async function publishFirstWorker(secretPath: string, message: string): Promise<void> {
  const output = await runCf(["deploy", "--secrets-file", secretPath, "--message", message])
  const live = workersDevUrlFrom(output)
  try {
    await smokeWorker(live)
  } catch (error) {
    await rollback(error)
  }
}

async function publishExistingWorker(secretPath: string, message: string): Promise<void> {
  const uploadOutput = await runCf([
    "workers",
    "versions",
    "create",
    "--secrets-file",
    secretPath,
    "--message",
    message,
  ])
  const uploaded = versionUploadFrom(uploadOutput)
  await smokeWorker(uploaded.previewUrl)
  const previous = await servingVersion()
  await shiftTraffic(uploaded.versionId, previous, 100)
  try {
    await smokeWorker(liveUrlFromPreview(uploaded.previewUrl))
  } catch (error) {
    await rollback(error, previous)
  }
}

/** Roll back by deploying the previous version again. cf has no dedicated rollback command. */
async function rollback(cause: unknown, previous?: string): Promise<never> {
  try {
    const target = previous ?? (await servingVersion())
    await shiftTraffic(target, target, 100, true)
  } catch (rollbackError) {
    const smokeText = cause instanceof Error ? cause.message : "Live smoke failed."
    const rollbackText = rollbackError instanceof Error ? rollbackError.message : "rollback failed"
    throw new Error(`${smokeText} Rollback also failed: ${rollbackText}`, { cause: rollbackError })
  }
  throw cause
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
