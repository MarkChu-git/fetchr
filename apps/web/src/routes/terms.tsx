import { createFileRoute } from "@tanstack/react-router"
import { TermsPage } from "../terms-page"

interface TermsSearch {
  readonly lang?: "en"
}

export const Route = createFileRoute("/terms")({
  validateSearch: (search: Record<string, unknown>): TermsSearch =>
    search.lang === "en" ? { lang: "en" } : {},
  component: TermsPage,
})
