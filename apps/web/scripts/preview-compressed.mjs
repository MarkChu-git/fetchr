import { spawn } from "node:child_process"
import { createServer, request } from "node:http"
import { brotliCompressSync, gzipSync } from "node:zlib"

const PREVIEW_PORT = 4173
const PROXY_PORT = 4174

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/

const child = spawn("bun", ["run", "preview", "--", "--port", String(PREVIEW_PORT), "--strictPort"], {
  stdio: ["ignore", "inherit", "inherit"],
})

function shutdown() {
  child.kill()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

// If vite preview dies, fail fast instead of serving 502s until the timeout.
child.on("exit", (code) => {
  console.error(`vite preview exited with code ${code}`)
  process.exit(code ?? 1)
})

function waitForPreview(attemptsLeft = 60) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "localhost", port: PREVIEW_PORT, path: "/", method: "HEAD" },
      () => resolve(),
    )
    req.on("error", () => {
      if (attemptsLeft <= 0) {
        reject(new Error("vite preview did not start"))
        return
      }
      setTimeout(() => resolve(waitForPreview(attemptsLeft - 1)), 500)
    })
    req.end()
  })
}

const server = createServer((clientReq, clientRes) => {
  const proxyReq = request(
    {
      host: "localhost",
      port: PREVIEW_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: { ...clientReq.headers, "accept-encoding": "identity" },
    },
    (proxyRes) => {
      const chunks = []
      proxyRes.on("data", (chunk) => chunks.push(chunk))
      proxyRes.on("end", () => {
        const body = Buffer.concat(chunks)
        const headers = { ...proxyRes.headers }
        delete headers["transfer-encoding"]
        const contentType = String(headers["content-type"] ?? "")
        const acceptEncoding = String(clientReq.headers["accept-encoding"] ?? "")

        if (
          COMPRESSIBLE.test(contentType) &&
          headers["content-encoding"] === undefined &&
          body.length > 256
        ) {
          let compressed = body
          if (acceptEncoding.includes("br")) {
            compressed = brotliCompressSync(body)
            headers["content-encoding"] = "br"
          } else if (acceptEncoding.includes("gzip")) {
            compressed = gzipSync(body)
            headers["content-encoding"] = "gzip"
          }
          headers["content-length"] = String(compressed.length)
          clientRes.writeHead(proxyRes.statusCode ?? 200, headers)
          clientRes.end(compressed)
          return
        }

        clientRes.writeHead(proxyRes.statusCode ?? 200, headers)
        clientRes.end(body)
      })
    },
  )
  proxyReq.on("error", () => {
    clientRes.writeHead(502)
    clientRes.end()
  })
  clientReq.pipe(proxyReq)
})

await waitForPreview()
server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(`Local: http://localhost:${PROXY_PORT}/ (compressed preview proxy)`)
})
