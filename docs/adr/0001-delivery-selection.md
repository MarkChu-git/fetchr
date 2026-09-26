# Direct 不是默认路径

浏览器不能替页面设置 Referer、Cookie 或 User-Agent，而小红书、抖音、B 站的 CDN 经常要求平台自己的 Referer。客户端要合成音视频时，还必须能读到字节，这依赖 CDN 的 CORS。

因此：单个完整文件、不需要这些头、用户直接下载，用 Direct。客户端要读字节且 CDN 允许，用 Mux。其余用 Proxy。Direct 上只携带浏览器允许设置的头。Playlist 的清单和分片用同一条规则，能直接读就是 Direct，不能读就走 Proxy。

拒绝的做法是「能拿到 URL 就一律 Direct」。那样分享链在手机上会大面积失败，Worker 流量反而省不下来。
