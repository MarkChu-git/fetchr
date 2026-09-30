import { Theme } from "@astryxdesign/core/theme"
import { stoneTheme } from "@astryxdesign/theme-stone/built"
import { HeadContent, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router"
import type { ReactNode } from "react"
import "@astryxdesign/core/reset.css"
import "@astryxdesign/theme-stone/theme.css"
import { htmlLang, localeFromSearch } from "../i18n"
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
      // SVG stays sharp in the tab. The PNG covers clients that ignore SVG icons.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
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
  const searchStr = useRouterState({ select: (state) => state.location.searchStr })
  const lang = htmlLang(localeFromSearch(new URLSearchParams(searchStr).get("lang")))
  return (
    <html lang={lang}>
      <head>
        {/* Must be the first CSS in the document. StyleX opens astryx-base first. If reset opens after that, it covers the buttons and inputs. */}
        <style>{`@layer reset, astryx-base, astryx-theme, product;`}</style>
        <HeadContent />
        {import.meta.env.DEV ? (
          <link rel="stylesheet" href="/virtual:stylex.css" />
        ) : null}
      </head>
      <body>
        {/* The paste form is interactive in the server HTML. Stop that submit before React attaches, or the browser navigates to ?url= and drops ?lang=. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.addEventListener('submit',function(event){var form=event.target;if(form instanceof HTMLFormElement&&form.hasAttribute('data-fetchr-paste'))event.preventDefault()})",
          }}
        />
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
