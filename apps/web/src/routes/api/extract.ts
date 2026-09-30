import { createFileRoute } from "@tanstack/react-router"
import { addressFrom, runProductExtract } from "../../server/product"

export const Route = createFileRoute("/api/extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let url = ""
        let turnstileToken: string | undefined
        try {
          const body: unknown = await request.json()
          if (typeof body === "object" && body !== null) {
            const record = body as { url?: unknown; turnstileToken?: unknown }
            if (typeof record.url === "string") url = record.url
            if (typeof record.turnstileToken === "string") {
              turnstileToken = record.turnstileToken
            }
          }
        } catch {
          url = ""
        }
        const result = await runProductExtract({
          url,
          ip: addressFrom(request),
          now: Date.now(),
          ...(turnstileToken === undefined ? {} : { turnstileToken }),
        })
        return Response.json(result, { status: result.ok ? 200 : result.challenge ? 429 : 422 })
      },
    },
  },
})
