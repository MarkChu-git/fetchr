import { Heading, Text } from "@astryxdesign/core/Text"
import { Link } from "@astryxdesign/core/Link"
import { VStack } from "@astryxdesign/core/VStack"
import type { Author, MediaAsset, MediaPost } from "@fetchr/core"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  stage: {
    marginInline: "-1rem",
    backgroundColor: "#000",
    "@media (min-width: 48rem)": {
      marginInline: "0",
      borderRadius: "1.25rem",
      overflow: "hidden",
    },
  },
  media: {
    display: "block",
    width: "100%",
    maxHeight: "78vh",
    objectFit: "contain",
    backgroundColor: "#000",
  },
  authorRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  avatar: {
    width: "2.25rem",
    height: "2.25rem",
    borderRadius: "999px",
    objectFit: "cover",
    flexShrink: 0,
  },
  copy: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  audio: {
    width: "100%",
  },
})

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

function quietMedia<T extends HTMLElement>(element: T | null) {
  element?.setAttribute("referrerpolicy", "no-referrer")
}

function DownloadLink({ href }: { readonly href: string }) {
  return (
    <Link
      href={href}
      download
      color="secondary"
      isStandalone
      referrerPolicy="no-referrer"
    >
      下载
    </Link>
  )
}

export function PostView({ post }: { readonly post: MediaPost }) {
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
  const heroVideo = direct.find((item) => item.asset.type === "video")
  const thumbnailIsImage = direct.some(
    (item) => item.asset.type === "image" && item.url === thumbnail,
  )
  const showThumbnail =
    thumbnail !== undefined && heroVideo === undefined && !thumbnailIsImage

  return (
    <VStack gap={4}>
      {heroVideo !== undefined ? (
        <div {...stylex.props(styles.stage)}>
          <video
            {...stylex.props(styles.media)}
            ref={quietMedia}
            src={heroVideo.url}
            controls
            playsInline
            preload="metadata"
            {...(heroVideo.asset.type === "video" &&
            present(heroVideo.asset.thumbnail) !== undefined
              ? { poster: heroVideo.asset.thumbnail }
              : {})}
          />
        </div>
      ) : null}
      {showThumbnail ? (
        <div {...stylex.props(styles.stage)}>
          <img
            {...stylex.props(styles.media)}
            src={thumbnail}
            alt={title ?? ""}
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}
      {name !== undefined || avatar !== undefined ? (
        <div {...stylex.props(styles.authorRow)}>
          {avatar !== undefined ? (
            <img
              {...stylex.props(styles.avatar)}
              src={avatar}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : null}
          {name !== undefined ? (
            <Text type="supporting" color="secondary">
              {name}
            </Text>
          ) : null}
        </div>
      ) : null}
      {title !== undefined ? <Heading level={1}>{title}</Heading> : null}
      {description !== undefined ? (
        <div {...stylex.props(styles.copy)}>
          <Text type="body" display="block">
            {description}
          </Text>
        </div>
      ) : null}
      <VStack gap={4}>
        {direct.map((item) => (
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
            {item.asset.type === "video" && item !== heroVideo ? (
              <div {...stylex.props(styles.stage)}>
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
            <DownloadLink href={item.url} />
          </VStack>
        ))}
      </VStack>
    </VStack>
  )
}
