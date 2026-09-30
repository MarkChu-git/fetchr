import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "../home-page"

interface HomeSearch {
  readonly lang?: "en"
}

export const Route = createFileRoute("/")({
  // Chinese stays off the query string. Writing lang=zh back would redirect every visit from / to /?lang=zh.
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    search.lang === "en" ? { lang: "en" } : {},
  component: HomePage,
})
