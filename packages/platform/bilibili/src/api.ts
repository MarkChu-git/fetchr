export function viewRequest(bvid: string): Request {
  const url = new URL("https://api.bilibili.com/x/web-interface/view")
  url.searchParams.set("bvid", bvid)
  return new Request(url)
}

export function playRequest(bvid: string, cid: number): Request {
  const url = new URL("https://api.bilibili.com/x/player/playurl")
  url.searchParams.set("bvid", bvid)
  url.searchParams.set("cid", String(cid))
  url.searchParams.set("fnval", "4048")
  url.searchParams.set("fnver", "0")
  url.searchParams.set("fourk", "1")
  return new Request(url)
}
