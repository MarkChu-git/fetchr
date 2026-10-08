import { Theme } from "@astryxdesign/core/theme"
import { stoneTheme } from "@astryxdesign/theme-stone/built"
import { HeadContent, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import type { ReactNode } from "react"
import "@astryxdesign/core/reset.css"
import "@astryxdesign/theme-stone/theme.css"
import "@fontsource/figtree/400.css"
import "@fontsource/figtree/500.css"
import "@fontsource/figtree/600.css"
import { htmlLang, localeFromSearch, pageCopy } from "../i18n"
import { shareAssets } from "../share-assets.gen"
import { NO_REQUEST_FACTS, readRequestFacts, shareMeta, type RequestFacts } from "../share-meta"
import "../styles.css"

/**
 * What the share tags need to know about the request. It has to be read inside the request, where Workers
 * inject it. `readRequestFacts` keeps a failure here from reaching the page.
 */
const loadRequestFacts = createServerFn({ method: "GET" }).handler(
  (): RequestFacts => readRequestFacts(() => ({ origin: getRequestUrl().origin })),
)

export const Route = createRootRoute({
  // The origin cannot change while the page is open, so it never goes stale. The router keeps the root
  // match across navigations anyway; this keeps it from asking the server again if its defaults ever change.
  staleTime: Infinity,
  // A failed call, which can only happen over the network on the client, costs the page its image tags and nothing more.
  loader: async (): Promise<RequestFacts> => {
    try {
      return await loadRequestFacts()
    } catch {
      return NO_REQUEST_FACTS
    }
  },
  head: ({ match, matches, loaderData }) => {
    // The root route has no search validator, so search is untyped here.
    const locale = localeFromSearch((match.search as { lang?: string }).lang)
    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        // The root match's own pathname is not the page's; the deepest match is.
        ...shareMeta({
          locale,
          copy: pageCopy(locale),
          origin: loaderData?.origin ?? null,
          pathname: matches.at(-1)?.pathname ?? "/",
          images: shareAssets,
        }),
      ],
      links: [
        // SVG stays sharp in the tab. The PNG covers clients that ignore SVG icons.
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    }
  },
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
