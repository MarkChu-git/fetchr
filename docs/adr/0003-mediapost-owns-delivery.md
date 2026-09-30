# MediaPost 自己带着 Delivery

解析的结果就是一份 MediaPost，里面的每段媒体带着自己的 Delivery。CDN 地址会过期，所以缓存可以只留下文字和作者、丢掉地址。那是缓存记录的存法，不是第二种领域对象。

不另造 PostMetadata 和 MediaDelivery。否则每个调用方都要再拼一次，而第一版还没有缓存。
