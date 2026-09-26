import { Theme } from "@astryxdesign/core/theme"
import { stoneTheme } from "@astryxdesign/theme-stone/built"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import "@astryxdesign/core/reset.css"
import "@astryxdesign/theme-stone/theme.css"
import "../styles.css"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Fetchr" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Montserrat:wght@500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
        {import.meta.env.DEV ? (
          <link rel="stylesheet" href="/virtual:stylex.css" />
        ) : null}
      </head>
      <body>
        <Theme theme={stoneTheme} mode="system">
          {children}
        </Theme>
        {import.meta.env.DEV ? (
          <script type="module" src="/@id/virtual:stylex:runtime" />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
