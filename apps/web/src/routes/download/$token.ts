import { createFileRoute } from "@tanstack/react-router"
import { addressFrom, openProxyDownload } from "../../server/product"

export const Route = createFileRoute("/download/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        return openProxyDownload(
          params.token,
          Date.now(),
          addressFrom(request),
          fetch,
          {
            range: request.headers.get("range"),
            inline: url.searchParams.get("inline") === "1",
          },
        )
      },
    },
  },
})
