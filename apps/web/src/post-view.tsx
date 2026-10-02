import { Avatar } from "@astryxdesign/core/Avatar"
import { Badge } from "@astryxdesign/core/Badge"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { Grid } from "@astryxdesign/core/Grid"
import { Heading, Text } from "@astryxdesign/core/Text"
import { HStack } from "@astryxdesign/core/HStack"
import { VStack } from "@astryxdesign/core/VStack"
import type { Author, Delivery, MediaAsset, MediaPost } from "@fetchr/core"
import * as stylex from "@stylexjs/stylex"
import type { PageCopy } from "./i18n"
import type { Locale } from "./i18n"
import { htmlLang, pageCopy } from "./i18n"
import type { MuxWorkerResult } from "./mux-worker"
import { useEffect, useState } from "react"
import { zipStore, type ZipEntry } from "./zip"

const styles = stylex.create({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    alignItems: "stretch",
    "@media (min-width: 64rem)": {
      flexDirection: "row",
      alignItems: "flex-start",
    },
  },
  stageCol: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    width: "100%",
  },
  metaCol: {
    width: "100%",
    minWidth: 0,
    overflowWrap: "anywhere",
    "@media (min-width: 64rem)": {
      width: "22rem",
      flexShrink: 0,
      position: "sticky",
      top: "1rem",
    },
  },
  stage: {
    overflow: "hidden",
    borderRadius: "var(--radius-container)",
    backgroundColor: "#1b1b1f",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--color-border)",
  },
  // Before metadata arrives the video is only a control bar. Hold 16:9 so the picture has a place to land.
  frame: {
    aspectRatio: "16 / 9",
    maxHeight: "min(72vh, 40rem)",
  },
  media: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#1b1b1f",
  },
  gallery: {
    display: "block",
    width: "100%",
    aspectRatio: "1",
    objectFit: "cover",
    backgroundColor: "#1b1b1f",
  },
  copy: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  audio: {
    width: "100%",
  },
})

function publishedLabel(value: string | undefined, locale: Locale): string | undefined {
  if (value === undefined) return undefined
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return undefined
  // The page language has to reach the formatter. A fixed zh-CN locale kept Chinese dates on the English page.
  return new Intl.DateTimeFormat(htmlLang(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed)
}

function present(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function authorLabel(author: Author | undefined): string | undefined {
  if (author === undefined) {
    return undefined
  }
  return present(author.name) ?? present(author.username)
}

function directUrl(asset: MediaAsset): string | undefined {
  return asset.delivery.type === "direct" ? asset.delivery.url : undefined
}

function previewUrl(asset: MediaAsset): string | undefined {
  if (asset.type !== "video") return undefined
  if (asset.delivery.type === "direct") return asset.delivery.url
  const href = proxyHref(asset.delivery)
  if (href === undefined) return undefined
  // Same proxied URL. inline lets the browser's own video element preview it. The download button omits this parameter.
  return `${href}?inline=1`
}

function proxyHref(delivery: Delivery): string | undefined {
  if (delivery.type !== "proxy") return undefined
  if (delivery.upstreamUrl !== undefined) return undefined
  return `/download/${delivery.token}`
}

/**
 * The image host does not let the browser read bytes across origins. Preview uses the proxy with inline. Download omits it, so the click stays an attachment.
 */
function imageView(asset: MediaAsset):
  | { readonly asset: MediaAsset; readonly preview: string; readonly download: string }
  | undefined {
  if (asset.type !== "image") return undefined
  if (asset.delivery.type === "direct") {
    return { asset, preview: asset.delivery.url, download: asset.delivery.url }
  }
  const href = proxyHref(asset.delivery)
  if (href === undefined) return undefined
  return { asset, preview: `${href}?inline=1`, download: href }
}

function quietMedia(element: HTMLElement | null) {
  element?.setAttribute("referrerpolicy", "no-referrer")
}

function isBrowserFallback(asset: MediaAsset): boolean {
  return asset.type === "video" && asset.id.endsWith(":browser")
}

// Douyin's own renditions ride along as :720p / :540p assets. They get labeled
// download buttons in the side card, not their own stage entries.
function qualityClass(asset: MediaAsset): "720p" | "540p" | undefined {
  if (asset.type !== "video") return undefined
  if (asset.id.endsWith(":720p")) return "720p"
  if (asset.id.endsWith(":540p")) return "540p"
  return undefined
}

function PreviewVideo({
  sources,
  poster,
}: {
  readonly sources: readonly string[]
  readonly poster?: string
}) {
  const [index, setIndex] = useState(0)
  const src = sources[index] ?? sources[0]
  if (src === undefined) return null

  function useNext() {
    setIndex((current) => (current + 1 < sources.length ? current + 1 : current))
  }

  return (
    <video
      {...stylex.props(styles.media)}
      key={src}
      ref={quietMedia}
      src={src}
      controls
      playsInline
      preload="metadata"
      {...(poster !== undefined ? { poster } : {})}
      onError={useNext}
      onLoadedMetadata={(event) => {
        // When the original is HEVC, a browser that cannot decode it does not fire error. videoWidth stays 0.
        if (event.currentTarget.videoWidth === 0) useNext()
      }}
    />
  )
}

function savedName(href: string, type: string): string {
  const leaf = new URL(href, "https://fetchr.invalid").pathname.split("/").pop() ?? ""
  if (leaf.includes(".")) return leaf
  if (type === "image/jpeg") return "fetchr.jpg"
  if (type === "image/png") return "fetchr.png"
  if (type === "image/webp") return "fetchr.webp"
  if (type === "video/mp4") return "fetchr.mp4"
  return "fetchr.bin"
}

function DownloadLink({
  href,
  text,
  label,
  fill = false,
}: {
  readonly href: string
  readonly text: PageCopy
  readonly label?: string
  readonly fill?: boolean
}) {
  const [message, setMessage] = useState<string | undefined>()

  async function onClick() {
    let target: URL
    try {
      target = new URL(href, window.location.href)
    } catch {
      return
    }
    // A same-origin URL already carries Content-Disposition, so let the browser save it.
    // Across origins the download attribute is ignored and the click only opens the file, so read the bytes first and then save them.
    if (target.origin === window.location.origin) {
      const anchor = document.createElement("a")
      anchor.href = href
      anchor.download = ""
      anchor.click()
      return
    }
    setMessage(undefined)
    try {
      const response = await fetch(href)
      if (!response.ok) {
        setMessage(text.fileUnreadable)
        return
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = savedName(href, blob.type)
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      setMessage(text.fileUnreadable)
    }
  }

  const wide = fill ? { width: "100%" as const } : {}
  return (
    <VStack gap={2} {...wide}>
      <Button
        label={label ?? text.download}
        type="button"
        variant="primary"
        {...wide}
        onClick={() => {
          void onClick()
        }}
      />
      {message !== undefined ? (
        <Text type="supporting" color="secondary">
          {message}
        </Text>
      ) : null}
    </VStack>
  )
}

export function PostView({
  post,
  locale,
}: {
  readonly post: MediaPost
  readonly locale: Locale
}) {
  const text = pageCopy(locale)
  const author = post.author
  const name = authorLabel(author)
  const avatar = present(author?.avatar)
  const title = present(post.title)
  const description = present(post.description)
  const thumbnail = present(post.thumbnail)
  const direct = post.media.flatMap((asset) => {
    const url = directUrl(asset)
    return url === undefined ? [] : [{ asset, url }]
  })
  const previews = post.media.flatMap((asset) => {
    const url = previewUrl(asset)
    return url === undefined ? [] : [{ asset, url }]
  })
  const heroVideo =
    previews.find(
      (item) =>
        item.asset.type === "video" &&
        !isBrowserFallback(item.asset) &&
        qualityClass(item.asset) === undefined,
    ) ??
    previews.find((item) => item.asset.type === "video")
  const heroSources = [
    ...(heroVideo === undefined ? [] : [heroVideo.url]),
    ...previews.flatMap((item) =>
      item.asset.type === "video" && isBrowserFallback(item.asset) ? [item.url] : [],
    ),
  ]
  const qualityVariants = post.media.flatMap((asset) => {
    const cls = qualityClass(asset)
    if (cls === undefined || asset.delivery.type !== "proxy") return []
    const href = proxyHref(asset.delivery)
    return href === undefined ? [] : [{ cls, href }]
  })
  const images = post.media.flatMap((asset) => {
    const view = imageView(asset)
    return view === undefined ? [] : [view]
  })
  // Batch covers anything the browser can save directly: direct URLs and sealed proxy tokens.
  // Mux and playlist deliveries need client work and stay single-file.
  const batchItems = post.media.flatMap((asset) => {
    if (isBrowserFallback(asset) || qualityClass(asset) !== undefined) return []
    if (asset.delivery.type === "direct") {
      return [{ id: asset.id, href: asset.delivery.url }]
    }
    const href = proxyHref(asset.delivery)
    return href === undefined ? [] : [{ id: asset.id, href }]
  })
  const thumbnailIsImage = images.some(
    (item) => item.preview === thumbnail || item.download === thumbnail,
  )
  const leadImage = heroVideo === undefined && images.length === 1 ? images[0] : undefined
  const published = publishedLabel(post.publishedAt, locale)
  // The item on the stage gets its download in the side panel, so the button does not fall below a long caption.
  const primaryAsset =
    heroVideo?.asset ??
    leadImage?.asset ??
    (post.media.length === 1 ? post.media[0] : undefined)
  const primaryHref =
    primaryAsset === undefined
      ? undefined
      : primaryAsset.delivery.type === "direct"
        ? primaryAsset.delivery.url
        : proxyHref(primaryAsset.delivery)
  const showCover =
    thumbnail !== undefined &&
    heroVideo === undefined &&
    leadImage === undefined &&
    !thumbnailIsImage

  function isOnStage(asset: MediaAsset): boolean {
    if (heroVideo?.asset.id === asset.id) return true
    if (leadImage?.asset.id === asset.id) return true
    return images.length > 1 && images.some((item) => item.asset.id === asset.id)
  }

  return (
    <div {...stylex.props(styles.layout)}>
      <div {...stylex.props(styles.stageCol)}>
        <VStack gap={4}>
          {heroVideo !== undefined ? (
            <div {...stylex.props(styles.stage, styles.frame)}>
              <PreviewVideo
                sources={heroSources}
                {...(heroVideo.asset.type === "video" &&
                present(heroVideo.asset.thumbnail) !== undefined
                  ? { poster: heroVideo.asset.thumbnail }
                  : {})}
              />
            </div>
          ) : null}
          {leadImage !== undefined ? (
            <div {...stylex.props(styles.stage, styles.frame)}>
              <img
                {...stylex.props(styles.media)}
                src={leadImage.preview}
                alt={title ?? ""}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          {showCover ? (
            <div {...stylex.props(styles.stage, styles.frame)}>
              <img
                {...stylex.props(styles.media)}
                src={thumbnail}
                alt={title ?? description ?? ""}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          {images.length > 1 ? (
            <Grid columns={{ minWidth: 180, max: 3 }} gap={3}>
              {images.map((item) => (
                <VStack key={item.asset.id} gap={2}>
                  <div {...stylex.props(styles.stage)}>
                    <img
                      {...stylex.props(styles.gallery)}
                      src={item.preview}
                      alt={title ?? ""}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <DownloadLink href={item.download} text={text} fill />
                  <ShareToAlbum href={item.download} name={item.asset.id} text={text} />
                </VStack>
              ))}
            </Grid>
          ) : null}
          {direct.map((item) => {
            if (isOnStage(item.asset)) return null
            const hideDownload = primaryAsset?.id === item.asset.id
            return (
              <VStack key={item.asset.id} gap={2}>
                {item.asset.type === "image" ? (
                  <div {...stylex.props(styles.stage)}>
                    <img
                      {...stylex.props(styles.media)}
                      src={item.url}
                      alt={title ?? ""}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : null}
                {item.asset.type === "video" ? (
                  <div {...stylex.props(styles.stage, styles.frame)}>
                    <video
                      {...stylex.props(styles.media)}
                      ref={quietMedia}
                      src={item.url}
                      controls
                      playsInline
                      preload="metadata"
                      {...(present(item.asset.thumbnail) !== undefined
                        ? { poster: item.asset.thumbnail }
                        : {})}
                    />
                  </div>
                ) : null}
                {item.asset.type === "audio" ? (
                  <audio
                    {...stylex.props(styles.audio)}
                    ref={quietMedia}
                    src={item.url}
                    controls
                    preload="metadata"
                  />
                ) : null}
                {hideDownload ? null : <DownloadLink href={item.url} text={text} />}
              </VStack>
            )
          })}
          {post.media.map((asset) =>
            // Each gallery image already has a download. Drawing it again would add a second row of buttons.
            (primaryAsset !== undefined && asset.id === primaryAsset.id) ||
            isBrowserFallback(asset) ||
            qualityClass(asset) !== undefined ||
            isOnStage(asset) ? null : (
              <DeliveryActions key={`${asset.id}-delivery`} asset={asset} text={text} />
            ),
          )}
        </VStack>
      </div>
      <div {...stylex.props(styles.metaCol)}>
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              {name !== undefined ? (
                <Avatar
                  name={name}
                  {...(avatar !== undefined ? { src: avatar } : {})}
                  size={40}
                />
              ) : null}
              <VStack gap={1}>
                {name !== undefined ? <Text type="large">{name}</Text> : null}
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Badge label={text.platform[post.platform]} variant="neutral" />
                  {published !== undefined ? (
                    <Text type="supporting" color="secondary">
                      {published}
                    </Text>
                  ) : null}
                </HStack>
              </VStack>
            </HStack>
            {title !== undefined ? <Heading level={2}>{title}</Heading> : null}
            {primaryAsset !== undefined ? <PrimaryAction asset={primaryAsset} text={text} /> : null}
            {primaryHref !== undefined && primaryAsset !== undefined ? (
              <ShareToAlbum href={primaryHref} name={primaryAsset.id} text={text} />
            ) : null}
            {qualityVariants.map((item) => (
              <DownloadLink
                key={item.cls}
                href={item.href}
                text={text}
                label={item.cls === "720p" ? text.downloadHd : text.downloadSd}
                fill
              />
            ))}
            {batchItems.length > 1 ? (
              <BatchDownload items={batchItems} post={post} text={text} />
            ) : null}
            {description !== undefined && description !== title ? (
              <div {...stylex.props(styles.copy)}>
                <Text type="body" display="block">
                  {description}
                </Text>
              </div>
            ) : null}
          </VStack>
        </Card>
      </div>
    </div>
  )
}

function batchExtension(type: string): string {
  if (type === "image/jpeg") return ".jpg"
  if (type === "image/png") return ".png"
  if (type === "image/webp") return ".webp"
  if (type === "image/heic") return ".heic"
  if (type === "video/mp4") return ".mp4"
  if (type === "video/quicktime") return ".mov"
  if (type === "audio/mp4") return ".m4a"
  return ""
}

/**
 * Same-origin items zip into one file. A cross-origin read can be blocked by CORS;
 * those fall back to individual anchor downloads.
 */
function BatchDownload({
  items,
  post,
  text,
}: {
  readonly items: readonly { readonly id: string; readonly href: string }[]
  readonly post: MediaPost
  readonly text: PageCopy
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  async function onClick() {
    setBusy(true)
    setMessage(undefined)
    try {
      const entries: ZipEntry[] = []
      for (const [index, item] of items.entries()) {
        try {
          // oxlint-disable-next-line no-await-in-loop
          const response = await fetch(item.href)
          if (!response.ok) throw new Error("fetch failed")
          // oxlint-disable-next-line no-await-in-loop
          const blob = await response.blob()
          // Sequential on purpose: each image is a separate upstream fetch. One more lint-disabled await reads the bytes.
          // oxlint-disable-next-line no-await-in-loop
          const bytes = await blob.arrayBuffer()
          entries.push({
            name: `${post.platform}-${post.id}-${index + 1}${batchExtension(blob.type)}`,
            data: new Uint8Array(bytes),
          })
        } catch {
          // CORS keeps the bytes unreadable. Save this one directly instead.
          const anchor = document.createElement("a")
          anchor.href = item.href
          anchor.download = ""
          anchor.click()
        }
      }
      if (entries.length === 0) {
        setMessage(text.fileUnreadable)
        return
      }
      const blob = zipStore(entries)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `fetchr-${post.platform}-${post.id}.zip`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <VStack gap={2} width="100%">
      <Button
        label={busy ? text.packaging : text.downloadAll}
        variant="secondary"
        width="100%"
        onClick={() => {
          void onClick()
        }}
      />
      {message !== undefined ? (
        <Text type="supporting" color="secondary">
          {message}
        </Text>
      ) : null}
    </VStack>
  )
}

const shareSizeLimit = 100 * 1024 * 1024

/**
 * "Save to Photos" via the Web Share API. Only meaningful on iOS/Android, so the
 * button renders only when canShare accepts files. Cross-origin direct URLs stay
 * hidden because the browser cannot read their bytes into a File.
 */
function ShareToAlbum({
  href,
  name,
  text,
}: {
  readonly href: string
  readonly name: string
  readonly text: PageCopy
}) {
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    async function probe() {
      if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return
      const probeFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "probe.png", {
        type: "image/png",
      })
      if (!navigator.canShare({ files: [probeFile] })) return
      try {
        // A one-byte range read answers the total size without pulling the file.
        const response = await fetch(href, { headers: { range: "bytes=0-0" } })
        const range = response.headers.get("content-range")
        const total = range !== null ? Number(range.split("/")[1]) : Number(response.headers.get("content-length"))
        if (Number.isFinite(total) && total > shareSizeLimit) return
        if (!cancelled) setReady(true)
      } catch {
        // Unreadable now means unreadable later. Stay hidden.
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
  }, [href])

  async function onShare() {
    setMessage(undefined)
    try {
      const response = await fetch(href)
      if (!response.ok) throw new Error("fetch failed")
      const blob = await response.blob()
      const file = new File([blob], `${name}${batchExtension(blob.type)}`, { type: blob.type })
      if (!navigator.canShare({ files: [file] })) throw new Error("cannot share")
      await navigator.share({ files: [file] })
    } catch (error) {
      // The user dismissing the share sheet is not an error.
      if (error instanceof Error && error.name === "AbortError") return
      setMessage(text.fileUnreadable)
    }
  }

  if (!ready) return null
  return (
    <VStack gap={2} width="100%">
      <Button
        label={text.saveToAlbum}
        variant="secondary"
        width="100%"
        onClick={() => {
          void onShare()
        }}
      />
      {message !== undefined ? (
        <Text type="supporting" color="secondary">
          {message}
        </Text>
      ) : null}
    </VStack>
  )
}

function PrimaryAction({
  asset,
  text,
}: {
  readonly asset: MediaAsset
  readonly text: PageCopy
}) {
  const delivery = asset.delivery
  if (delivery.type === "direct") {
    return <DownloadLink href={delivery.url} text={text} fill />
  }
  if (delivery.type === "proxy") {
    const href = proxyHref(delivery)
    return href === undefined ? null : <DownloadLink href={href} text={text} fill />
  }
  if (delivery.type === "playlist") {
    return (
      <VStack gap={2} width="100%">
        <Text type="supporting" color="secondary">
          {text.manifest(delivery.protocol.toUpperCase())}
        </Text>
        <DownloadLink href={delivery.url} text={text} fill />
      </VStack>
    )
  }
  return (
    <MuxButton videoUrl={delivery.video.url} audioUrl={delivery.audio.url} text={text} fill />
  )
}

function DeliveryActions({
  asset,
  text,
}: {
  readonly asset: MediaAsset
  readonly text: PageCopy
}) {
  const delivery = asset.delivery
  if (delivery.type === "direct") return null
  if (delivery.type === "proxy") {
    const href = proxyHref(delivery)
    return href === undefined ? null : <DownloadLink href={href} text={text} />
  }
  if (delivery.type === "playlist") {
    return (
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          {text.manifest(delivery.protocol.toUpperCase())}
        </Text>
        <DownloadLink href={delivery.url} text={text} />
      </VStack>
    )
  }
  return <MuxButton videoUrl={delivery.video.url} audioUrl={delivery.audio.url} text={text} />
}

function MuxButton({
  videoUrl,
  audioUrl,
  text,
  fill = false,
}: {
  readonly videoUrl: string
  readonly audioUrl: string
  readonly text: PageCopy
  readonly fill?: boolean
}) {
  const [message, setMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  async function onMux() {
    setBusy(true)
    setMessage(undefined)
    // Each click opens its own worker. Close it when muxing finishes so decoding stays off the page thread.
    const worker = new Worker(new URL("./mux-worker.ts", import.meta.url), {
      type: "module",
    })
    try {
      const result = await new Promise<MuxWorkerResult>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<MuxWorkerResult>) => {
          resolve(event.data)
        }
        worker.onerror = () => {
          reject(new Error("mux worker failed"))
        }
        worker.postMessage({ videoUrl, audioUrl } satisfies {
          videoUrl: string
          audioUrl: string
        })
      })
      if (result.type === "unreadable") {
        setMessage(text.combineUnreadable)
        return
      }
      if (result.type === "failed") {
        setMessage(text.combineFailed)
        return
      }
      const href = URL.createObjectURL(
        new Blob([result.buffer], { type: "video/mp4" }),
      )
      const anchor = document.createElement("a")
      anchor.href = href
      anchor.download = "fetchr.mp4"
      anchor.click()
      // Revoking immediately cancels a download that has not started yet.
      setTimeout(() => URL.revokeObjectURL(href), 60_000)
    } catch {
      setMessage(text.combineFailed)
    } finally {
      worker.terminate()
      setBusy(false)
    }
  }

  const wide = fill ? { width: "100%" as const } : {}
  return (
    <VStack gap={2} {...wide}>
      <Button
        label={text.combine}
        type="button"
        variant="secondary"
        size="lg"
        {...wide}
        isLoading={busy}
        onClick={() => {
          void onMux()
        }}
      />
      {message !== undefined ? (
        <Text type="supporting" color="secondary">
          {message}
        </Text>
      ) : null}
    </VStack>
  )
}
