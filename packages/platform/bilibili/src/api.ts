/**
 * Public watch page. Title, author, and cid live in the page JSON, so skip the view API that answers 412.
 * Keep the trailing slash. Without it the site returns 301, and Transport does not follow redirects.
 */
export function pageRequest(bvid: string): Request {
  return new Request(`https://www.bilibili.com/video/${bvid}/`, {
    headers: {
      accept: "text/html",
      // The same referer a browser sends when it opens the watch page. This is not the user's cookie.
      referer: "https://www.bilibili.com/",
    },
  })
}

/** A short link only needs the first Location. The product Transport does not follow redirects. */
export function shortRequest(url: URL): Request {
  return new Request(url, { redirect: "manual" })
}

export function playRequest(bvid: string, cid: number): Request {
  const url = new URL("https://api.bilibili.com/x/player/playurl")
  url.searchParams.set("bvid", bvid)
  url.searchParams.set("cid", String(cid))
  // 4048 asks for the public split audio and video streams. When a complete file exists, the parser switches to Direct.
  url.searchParams.set("fnval", "4048")
  url.searchParams.set("fnver", "0")
  url.searchParams.set("fourk", "1")
  return new Request(url, {
    headers: {
      accept: "application/json",
      referer: `https://www.bilibili.com/video/${bvid}`,
    },
  })
}
