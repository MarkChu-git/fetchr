# Fetchr

把一条公开的社交媒体 URL 解析成一份帖子，并说明用户怎么拿到里面的媒体。

## Language

### 解析

**Extract**:
把一条公开 URL 变成一份 MediaPost。
_Avoid_: Download, 下载

**Platform**:
引擎认识的一个社交平台。
_Avoid_: 站点

**CanonicalResource**:
短链和跳转解开之后的平台、id 和 URL。
_Avoid_: note, reel, short, 笔记, 作为共享类型

**MediaPost**:
一份公开帖子的解析结果：它是谁的、写了什么、里面有哪些媒体、每段媒体怎么交给用户。
_Avoid_: VideoInfo, 下载结果

**MediaAsset**:
帖子里的一张图、一段视频或一段音频。
_Avoid_: format, itag

### 交付

**Delivery**:
一段媒体交给用户的方式。Direct、Mux、Proxy，或 Playlist。
_Avoid_: 下载链接

**Direct**:
浏览器能直接取到完整文件。不需要平台的 Referer、Cookie 或 User-Agent，页面也不读字节。
_Avoid_: 默认路径

**Mux**:
画面和声音是分开的，浏览器两边都能读，由用户的设备合成一个文件。
_Avoid_: 转码

**Proxy**:
浏览器自己拿不到字节，Worker 按签名把上游流转给用户。签名写明上游、要代附的请求头、过期时间和平台。上游地址不由用户提供。
_Avoid_: 开放代理

**Playlist**:
媒体是一份 HLS 或 DASH 清单，不是单个文件。清单和分片能不能由浏览器直接读，用和 Direct、Proxy 同一条规则。
_Avoid_: 把清单当成一个已经下好的文件
