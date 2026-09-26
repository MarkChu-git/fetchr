import { Button } from "@astryxdesign/core/Button"
import { TextInput } from "@astryxdesign/core/TextInput"
import { VStack } from "@astryxdesign/core/VStack"
import type { MediaPost } from "@fetchr/core"
import * as stylex from "@stylexjs/stylex"
import { useState, type FormEvent } from "react"
import { PostView } from "./post-view"
import { runExtract } from "./run-extract"

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-body)",
    color: "var(--color-text-primary)",
    fontFamily:
      'Figtree, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  },
  column: {
    width: "100%",
    maxWidth: "40rem",
    marginInline: "auto",
    paddingTop: "1.25rem",
    paddingBottom: "3rem",
    paddingInline: "1rem",
    "@media (min-width: 48rem)": {
      paddingTop: "2.5rem",
    },
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  error: {
    margin: 0,
    color: "var(--color-error)",
    fontSize: "1rem",
    lineHeight: 1.5,
  },
})

type Status =
  | { readonly state: "idle" }
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly post: MediaPost }
  | { readonly state: "error"; readonly message: string }

export function HomePage() {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<Status>({ state: "idle" })

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus({ state: "loading" })
    try {
      const outcome = await runExtract(url.trim())
      if (outcome.ok) {
        setStatus({ state: "ready", post: outcome.post })
        return
      }
      setStatus({ state: "error", message: outcome.message })
    } catch {
      setStatus({ state: "error", message: "解析失败" })
    }
  }

  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.column)}>
        <VStack gap={5}>
          <form {...stylex.props(styles.form)} onSubmit={onSubmit}>
            <TextInput
              label="粘贴链接"
              value={url}
              onChange={setUrl}
              htmlName="url"
              size="lg"
              autoComplete="off"
              isDisabled={status.state === "loading"}
            />
            <Button
              label="解析"
              type="submit"
              variant="secondary"
              size="lg"
              width="100%"
              isLoading={status.state === "loading"}
            />
          </form>
          {status.state === "error" ? (
            <p {...stylex.props(styles.error)} role="alert">
              {status.message}
            </p>
          ) : null}
          {status.state === "ready" ? <PostView post={status.post} /> : null}
        </VStack>
      </div>
    </main>
  )
}
