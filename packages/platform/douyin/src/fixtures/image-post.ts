export const imagePostFixture = {
  status_code: 0,
  aweme_detail: {
    aweme_id: "7000000000000000002",
    desc: "public fixture images",
    author: {
      uid: "fixture-author-2",
      nickname: "fixture-author",
      unique_id: "fixture_author",
    },
    images: [
      {
        url_list: ["https://cdn.example/images/one.jpg"],
        width: 1080,
        height: 1440,
      },
      {
        url_list: ["https://cdn.example/images/two.jpg"],
        width: 1080,
        height: 1440,
      },
    ],
    private_status: 0,
  },
} as const
