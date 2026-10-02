import { AppShell } from "@astryxdesign/core/AppShell"
import { Badge } from "@astryxdesign/core/Badge"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { Heading } from "@astryxdesign/core/Text"
import { HStack } from "@astryxdesign/core/HStack"
import { Icon } from "@astryxdesign/core/Icon"
import { Skeleton } from "@astryxdesign/core/Skeleton"
import { Text } from "@astryxdesign/core/Text"
import { TextInput } from "@astryxdesign/core/TextInput"
import { TopNav } from "@astryxdesign/core/TopNav"
import { VStack } from "@astryxdesign/core/VStack"
import type { ExtractErrorCode, MediaPost } from "@fetchr/core"
import { useNavigate, useSearch } from "@tanstack/react-router"
import * as stylex from "@stylexjs/stylex"
import { useEffect, useState, type FormEvent } from "react"
import { failureMessage } from "./failure-message"
import { localeCookie, pageCopy, type Locale } from "./i18n"
import { PostView } from "./post-view"
import { runExtract } from "./run-extract"

const styles = stylex.create({
  shell: {
    fontFamily:
      'Figtree, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  },
  // The stage fills the remaining viewport. If the empty state only follows its content, the first screen is nothing but the input.
  column: {
    width: "100%",
    maxWidth: "72rem",
    marginInline: "auto",
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    alignItems: "stretch",
    "@media (min-width: 48rem)": {
      flexDirection: "row",
      alignItems: "flex-end",
    },
  },
  field: {
    flexGrow: 1,
    minWidth: 0,
  },
  submit: {
    "@media (min-width: 48rem)": {
      width: "7.5rem",
      flexShrink: 0,
    },
  },
  stage: {
    flexGrow: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "calc(100dvh - 18rem)",
  },
  loading: {
    flexGrow: 1,
    minHeight: "calc(100dvh - 18rem)",
  },
  frame: {
    width: "100%",
    aspectRatio: "16 / 9",
  },
})

type Status =
  | { readonly state: "idle" }
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly post: MediaPost }
  | { readonly state: "error"; readonly code: ExtractErrorCode; readonly challenge: boolean }

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

function rememberLocale(locale: Locale) {
  document.cookie = `${localeCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
}

export function HomePage() {
  const lang: Locale = useSearch({ from: "/" }).lang === "en" ? "en" : "zh"
  const navigate = useNavigate()
  const text = pageCopy(lang)
  const [url, setUrl] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>()
  const [status, setStatus] = useState<Status>({ state: "idle" })

  useEffect(() => {
    rememberLocale(lang)
  }, [lang])

  useEffect(() => {
    if (typeof turnstileSiteKey !== "string" || turnstileSiteKey.length === 0) return
    const existing = document.querySelector("script[data-fetchr-turnstile]")
    if (existing === null) {
      const script = document.createElement("script")
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
      script.async = true
      script.dataset.fetchrTurnstile = "true"
      document.head.append(script)
    }
    const win = window as Window & { fetchrTurnstile?: (token: string) => void }
    win.fetchrTurnstile = (token) => setTurnstileToken(token)
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus({ state: "loading" })
    try {
      const outcome = await runExtract(url.trim(), turnstileToken)
      if (outcome.ok) {
        setTurnstileToken(undefined)
        setStatus({ state: "ready", post: outcome.post })
        return
      }
      setStatus({
        state: "error",
        code: outcome.code,
        challenge: outcome.challenge,
      })
    } catch {
      setStatus({ state: "error", code: "EXTRACTOR_BROKEN", challenge: false })
    }
  }

  const showChallenge =
    status.state === "error" &&
    status.challenge &&
    typeof turnstileSiteKey === "string" &&
    turnstileSiteKey.length > 0

  return (
    <AppShell
      variant="section"
      height="fill"
      contentPadding={4}
      mobileNav={false}
      xstyle={styles.shell}
      topNav={
        <TopNav
          label="Fetchr"
          heading={<Heading level={1}>Fetchr</Heading>}
          endContent={
            <HStack gap={3} vAlign="center">
              <Text type="supporting" color="secondary">
                {text.publicLink}
              </Text>
              <HStack gap={1}>
                <Button
                  label="中文"
                  type="button"
                  size="sm"
                  variant={lang === "zh" ? "primary" : "secondary"}
                  aria-pressed={lang === "zh"}
                  onClick={() => {
                    rememberLocale("zh")
                    void navigate({ to: "/", search: {} })
                  }}
                />
                <Button
                  label="EN"
                  type="button"
                  size="sm"
                  variant={lang === "en" ? "primary" : "secondary"}
                  aria-pressed={lang === "en"}
                  onClick={() => {
                    rememberLocale("en")
                    void navigate({ to: "/", search: { lang: "en" } })
                  }}
                />
              </HStack>
            </HStack>
          }
        />
      }
    >
      <div {...stylex.props(styles.column)}>
        <Card padding={5}>
          <VStack gap={4}>
            <form {...stylex.props(styles.form)} data-fetchr-paste="" onSubmit={onSubmit}>
              <div {...stylex.props(styles.field)}>
                <TextInput
                  label={text.pasteLabel}
                  value={url}
                  onChange={setUrl}
                  htmlName="url"
                  size="lg"
                  autoComplete="off"
                  isDisabled={status.state === "loading"}
                />
              </div>
              <div {...stylex.props(styles.submit)}>
                <Button
                  label={text.submit}
                  type="submit"
                  variant="primary"
                  size="lg"
                  width="100%"
                  isLoading={status.state === "loading"}
                />
              </div>
            </form>
            <HStack gap={2} wrap="wrap">
              {text.platforms.map((name) => (
                <Badge key={name} label={name} variant="neutral" />
              ))}
            </HStack>
          </VStack>
        </Card>
        {showChallenge ? (
          <div
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-callback="fetchrTurnstile"
          />
        ) : null}
        {status.state === "loading" ? (
          <Card variant="muted" width="100%" padding={5} xstyle={styles.loading} aria-busy="true">
            <VStack gap={4}>
              <div {...stylex.props(styles.frame)}>
                <Skeleton width="100%" height="100%" radius={4} />
              </div>
              <HStack gap={3} vAlign="center">
                <Skeleton width={40} height={40} radius="rounded" index={1} />
                <VStack gap={2}>
                  <Skeleton width={180} height={16} index={2} />
                  <Skeleton width={72} height={12} index={3} />
                </VStack>
              </HStack>
              <Text type="supporting" color="secondary">
                {text.extracting}
              </Text>
            </VStack>
          </Card>
        ) : null}
        {status.state === "error" ? (
          <Card variant="muted" width="100%" xstyle={styles.stage}>
            <div role="alert">
              <EmptyState title={failureMessage(status.code, lang)} icon={<Icon icon="search" size="lg" />} />
            </div>
          </Card>
        ) : null}
        {status.state === "idle" ? (
          <Card variant="muted" width="100%" xstyle={styles.stage}>
            <EmptyState
              title={text.emptyTitle}
              description={text.emptyDescription}
              icon={<Icon icon="search" size="lg" />}
            />
          </Card>
        ) : null}
        {status.state === "ready" ? <PostView post={status.post} locale={lang} /> : null}
      </div>
    </AppShell>
  )
}
