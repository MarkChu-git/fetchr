export const videoFixture = {
  status_code: 0,
  aweme_detail: {
    aweme_id: "7000000000000000001",
    desc: "public fixture clip",
    duration: 13000,
    author: {
      uid: "fixture-author-1",
      nickname: "fixture-author",
      unique_id: "fixture_author",
      avatar_thumb: {
        url_list: ["https://cdn.example/avatars/fixture-author.jpg"],
      },
    },
    video: {
      width: 720,
      height: 1280,
      cover: {
        url_list: ["https://cdn.example/covers/clip.jpg"],
      },
      play_addr: {
        url_list: [
          "https://www.douyin.com/aweme/v1/playwm/?video_id=clip",
          "https://cdn.example/media/clip.mp4",
        ],
      },
      bit_rate: [
        {
          gear_name: "720_1_1",
          bit_rate: 1155701,
          play_addr: { url_list: ["https://cdn.example/media/clip-720.mp4"] },
        },
        {
          gear_name: "720_2_1",
          bit_rate: 833881,
          play_addr: { url_list: ["https://cdn.example/media/clip-720-low.mp4"] },
        },
        {
          gear_name: "540_1_1",
          bit_rate: 794713,
          play_addr: { url_list: ["https://cdn.example/media/clip-540.mp4"] },
        },
      ],
    },
    private_status: 0,
  },
} as const
