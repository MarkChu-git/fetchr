export const videoFixture = {
  status_code: 0,
  aweme_detail: {
    aweme_id: "7000000000000000001",
    desc: "public fixture clip",
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
        url_list: ["https://cdn.example/media/clip.mp4"],
      },
    },
    private_status: 0,
  },
} as const
