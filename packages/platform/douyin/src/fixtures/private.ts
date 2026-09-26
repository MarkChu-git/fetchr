export const privateFixture = {
  status_code: 0,
  aweme_detail: {
    aweme_id: "7000000000000000003",
    desc: "private fixture post",
    author: {
      uid: "fixture-author-3",
      nickname: "fixture-author",
    },
    private_status: 1,
    video: {
      cover: {
        url_list: ["https://cdn.example/covers/private.jpg"],
      },
      play_addr: {
        url_list: ["https://cdn.example/media/private.mp4"],
      },
    },
  },
} as const
