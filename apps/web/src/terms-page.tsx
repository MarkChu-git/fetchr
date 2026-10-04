import { AppShell } from "@astryxdesign/core/AppShell"
import { Card } from "@astryxdesign/core/Card"
import { Heading } from "@astryxdesign/core/Text"
import { Text } from "@astryxdesign/core/Text"
import { TopNav } from "@astryxdesign/core/TopNav"
import { VStack } from "@astryxdesign/core/VStack"
import { Link, useSearch } from "@tanstack/react-router"
import * as stylex from "@stylexjs/stylex"
import { localeFromSearch, type Locale } from "./i18n"

const styles = stylex.create({
  shell: {
    fontFamily:
      'Figtree, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  },
  column: {
    width: "100%",
    maxWidth: "48rem",
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  backLink: {
    // Inherit the surrounding Text size/color so the link matches the design system.
    color: "inherit",
    textDecoration: "underline",
    textUnderlineOffset: "0.2em",
  },
})

interface TermsSection {
  readonly heading: string
  readonly lead?: string
  readonly clauses: readonly string[]
}

interface TermsCopy {
  readonly title: string
  readonly updated: string
  readonly intro: string
  readonly back: string
  readonly sections: readonly TermsSection[]
}

const termsCopy: Record<Locale, TermsCopy> = {
  zh: {
    title: "使用条款",
    updated: "生效日期：2026 年 10 月 4 日",
    intro:
      "欢迎使用 Fetchr。本使用条款（“条款”）构成你与 Fetchr（“本服务”、“我们”）之间具有约束力的协议。访问或使用本服务，即表示你已阅读、理解并同意受这些条款约束。如果你不同意其中任何部分，请立即停止使用本服务。",
    back: "返回",
    sections: [
      {
        heading: "服务说明",
        clauses: [
          "Fetchr 是一款链接解析工具。你把第三方社交平台的公开分享链接粘贴进来，Fetchr 将其解析为对应的公开媒体内容，并提供预览和下载入口。媒体文件仍托管在原平台的服务器上；Fetchr 仅在请求期间中转字节，不在服务器上持久保存任何媒体副本。",
          "本服务不包含账号体系，不需要注册。我们可能随时新增、调整或移除功能，恕不另行通知。",
          "Fetchr 与任何第三方平台均无隶属、赞助或背书关系。各平台名称和商标归其各自所有者所有。",
        ],
      },
      {
        heading: "适用对象",
        clauses: [
          "你必须达到所在司法辖区可以独立订立合同的年龄（多数地区为 18 岁，部分地区为 16 岁或以上）方可使用本服务。未达到该年龄的用户应停止使用。",
          "使用本服务即表示你确认自己有权同意这些条款，且你的使用不违反适用于你的任何法律、法规或合同义务。",
        ],
      },
      {
        heading: "内容归属与版权",
        clauses: [
          "你通过本服务获取的所有媒体内容，其著作权、肖像权及其他相关权利均归原创作者或原平台所有。Fetchr 不主张这些内容的任何权利，也未被授予任何权利。",
          "下载仅供个人、非商业用途使用。转载、公开展示、二次发布、改编或任何商业利用之前，你必须取得权利人的许可；未经许可使用产生的一切法律后果由你自行承担。",
          "本服务只解析你提供的链接所指向的公开内容，不提供搜索、索引或内容库功能，也不会帮助你绕过登录、付费墙或私密设置——任何本身需要授权才能访问的内容，本服务同样无法访问。",
          "如果你是权利人，认为本服务的解析行为影响了你的合法权益，请通过文末“联系方式”一节所列渠道与我们联系，我们会在收到有效通知后评估处理。",
        ],
      },
      {
        heading: "可接受使用",
        lead: "你不得将本服务用于下列用途：",
        clauses: [
          "下载、传播或协助传播任何侵犯著作权、商标权、肖像权、隐私权或其他合法权益的内容；",
          "批量或自动化抓取内容，或以超出正常个人使用频率的方式调用本服务（我们有权对异常流量采取限流或封禁）；",
          "尝试绕过本服务或原平台的访问限制、速率限制或安全机制；",
          "将本服务作为内容源进行转售、分发，或嵌入需要代你的用户批量解析的产品中；",
          "提交指向违法、欺诈、恶意软件、色情剥削、暴力或骚扰内容的链接；",
          "干扰、破坏本服务的基础设施，或对线上服务进行反向工程（源代码已按 AGPL-3.0 开源，请直接查阅）；",
          "任何违反适用法律法规的用途。",
        ],
      },
      {
        heading: "知识产权",
        clauses: [
          "Fetchr 的源代码在 GNU AGPL-3.0 许可证下开源，你在代码层面的权利与义务以该许可证为准。",
          "“Fetchr”名称、标识及页面设计（不含第三方平台的商标与素材）归我们所有，未经许可不得以暗示隶属或背书的方式使用。",
          "你提交链接仅授予我们为完成当次解析所需的临时处理权，不使你获得对本服务的任何权利。",
        ],
      },
      {
        heading: "第三方平台",
        clauses: [
          "本服务解析的内容托管在第三方平台，其存在与可用性由原平台和内容作者控制。平台删除内容、调整权限或变更接口后，对应媒体可能立即无法解析。",
          "你下载的媒体仍受原平台条款和版权政策约束。你在原平台上的行为，包括你粘贴链接的来源，由你与该平台自行负责。",
          "我们不对第三方内容的准确性、合法性或适当性作任何陈述或保证。",
        ],
      },
      {
        heading: "隐私",
        clauses: [
          "本服务不需要账号，不收集姓名、邮箱等身份信息。",
          "你提交的链接会被发送到服务器用于当次解析。解析日志（链接、时间、结果、IP 地址）仅作短期保留，用于限流、防滥用和故障排查，不用于广告或用户画像。",
          "下载的媒体字节经服务器中转转发给你的浏览器，转发完成后即被丢弃，不作持久保存。",
          "本服务仅使用一个浏览器 Cookie 保存你的语言偏好设置。",
        ],
      },
      {
        heading: "免责声明",
        clauses: [
          "本服务按“现状”和“可用状态”提供。我们不对服务的持续可用性、无错误性、安全性或对特定用途的适用性作任何明示或默示的保证。",
          "第三方平台的接口随时可能变更或关闭，某平台此前可以解析不保证今后仍可。因平台变更导致的解析失败不构成我们的违约。",
          "你应自行判断下载内容是否适合你的用途，以及你是否拥有使用这些内容所需的权利。",
        ],
      },
      {
        heading: "责任限制",
        clauses: [
          "在适用法律允许的最大范围内，对于因使用或无法使用本服务而引起的任何间接、附带、特殊、后果性或惩罚性损害——包括但不限于数据丢失、利润损失或商誉损失——我们不承担责任。",
          "因你对下载内容的不当使用（例如未经许可的转载或商用）而引发的索赔、损失或法律责任，由你独立承担。",
          "本服务免费提供。在任何情况下，我们对你的全部责任以法律允许的最低限度为限。",
        ],
      },
      {
        heading: "赔偿",
        clauses: [
          "如果第三方因你违反这些条款或不当使用本服务（包括但不限于侵犯他人版权）而向我们提出索赔，你同意为我们进行抗辩、赔偿，并使我们免受由此产生的损失、责任和费用（含合理的律师费）。",
        ],
      },
      {
        heading: "服务的变更与终止",
        clauses: [
          "我们可能随时修改、暂停或终止全部或部分服务，恕不另行通知。",
          "对违反这些条款的使用，我们有权在不通知的情况下采取限流、拒绝服务或封禁措施。",
          "你可以随时停止使用本服务。停止使用后，第 3、8、9、10、13、14 条仍然有效。",
        ],
      },
      {
        heading: "条款变更",
        clauses: [
          "我们可能不时修订这些条款，修订版本自在本页发布之时起生效。如有重大变更，我们会尽量在页面显著位置提示。",
          "条款变更后继续使用本服务，即视为你接受修订后的条款；如不同意，请停止使用。",
        ],
      },
      {
        heading: "一般条款",
        clauses: [
          "如果任何条款被认定为无效或不可执行，其余条款仍完全有效。",
          "我们未行使某项权利不构成对该权利的放弃。",
          "这些条款构成你与我们之间关于本服务的完整协议。",
          "未经我们同意，你不得转让这些条款下的权利或义务；我们可以在服务转让或重组时一并转让。",
        ],
      },
      {
        heading: "联系方式",
        clauses: [
          "对这些条款或本服务有任何疑问，包括版权相关的投诉，请通过 GitHub 仓库（github.com/MarkChu-git/fetchr）的 Issues 页面与我们联系。",
        ],
      },
    ],
  },
  en: {
    title: "Terms of Use",
    updated: "Effective date: October 4, 2026",
    intro:
      "Welcome to Fetchr. These Terms of Use (the “Terms”) form a binding agreement between you and Fetchr (the “Service”, “we”, “us”). By accessing or using the Service you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree with any part of them, please stop using the Service.",
    back: "Back",
    sections: [
      {
        heading: "What the Service does",
        clauses: [
          "Fetchr is a link extractor. You paste a public share link from a third-party social platform; Fetchr resolves it to the underlying public media and offers a preview and a download. Media files stay on the source platform's servers — Fetchr only relays bytes while your request is in flight and keeps no persistent copies.",
          "The Service has no accounts and requires no registration. Features may be added, changed, or removed at any time without notice.",
          "Fetchr is not affiliated with, sponsored by, or endorsed by any third-party platform. All platform names and trademarks belong to their respective owners.",
        ],
      },
      {
        heading: "Eligibility",
        clauses: [
          "You must be old enough to enter into a binding contract in your jurisdiction (18 in most places; 16 or older in some). If you are not, please stop using the Service.",
          "By using the Service you confirm that you have the authority to accept these Terms and that doing so violates no law or obligation that applies to you.",
        ],
      },
      {
        heading: "Content ownership and copyright",
        clauses: [
          "All media you obtain through the Service remains the property of its original creators and platforms. Fetchr claims no rights in that content and is granted none.",
          "Downloads are for personal, non-commercial use only. Before reposting, publishing, adapting, or using any content commercially, you must obtain the rights holder's permission. Any consequences of failing to do so are yours alone.",
          "The Service only resolves the public content your link points to. It offers no search, index, or content library, and it does not help you bypass logins, paywalls, or privacy settings — content that requires authorization is inaccessible to Fetchr as well.",
          "If you are a rights holder and believe the Service affects your legitimate interests, contact us through the channel listed in “Contact” and we will review your notice.",
        ],
      },
      {
        heading: "Acceptable use",
        lead: "You must not use the Service to:",
        clauses: [
          "download, distribute, or help distribute content that infringes copyright, trademark, portrait, privacy, or other legitimate rights;",
          "scrape in bulk or call the Service at a rate beyond normal personal use (we may throttle or block abnormal traffic);",
          "attempt to bypass access controls, rate limits, or security mechanisms of the Service or the source platforms;",
          "resell or redistribute the Service as a content source, or embed it in a product that resolves links on behalf of your own users;",
          "submit links to unlawful, fraudulent, malware, sexually exploitative, violent, or harassing content;",
          "interfere with or disrupt the Service's infrastructure, or reverse engineer the hosted service (the source is public under AGPL-3.0 — please just read it);",
          "use the Service for any purpose that violates applicable law.",
        ],
      },
      {
        heading: "Our intellectual property",
        clauses: [
          "Fetchr's source code is open source under the GNU AGPL-3.0 license; your rights and obligations in the code itself are governed by that license.",
          "The Fetchr name, logo, and page design (excluding third-party platforms' trademarks and assets) belong to us. Do not use them in a way that implies affiliation or endorsement without permission.",
          "Submitting a link grants us only the transient right to resolve it for you; it grants you no rights in the Service.",
        ],
      },
      {
        heading: "Third-party platforms",
        clauses: [
          "Content resolved by the Service is hosted by third-party platforms and controlled by those platforms and their creators. If a platform removes content, changes its permissions, or alters its interfaces, the corresponding media may stop resolving immediately.",
          "Media you download remains subject to the source platform's terms and copyright policies. What you do on those platforms — including where you obtained the links you paste — is between you and them.",
          "We make no representation or warranty about the accuracy, legality, or appropriateness of third-party content.",
        ],
      },
      {
        heading: "Privacy",
        clauses: [
          "The Service has no accounts and does not collect identifying information such as names or email addresses.",
          "The link you submit is sent to the server for that single resolution. Request logs (link, timestamp, outcome, IP address) are retained only briefly for rate limiting, abuse prevention, and debugging — not for advertising or profiling.",
          "Downloaded media bytes pass through the server to your browser and are discarded once the transfer completes; they are not stored.",
          "The Service uses a single browser cookie solely to remember your language preference.",
        ],
      },
      {
        heading: "Disclaimers",
        clauses: [
          "The Service is provided “as is” and “as available”. We give no warranty, express or implied, that it will be continuously available, error-free, secure, or fit for any particular purpose.",
          "Third-party platforms can change or close their interfaces at any time; a platform that resolved yesterday is not guaranteed to resolve tomorrow. A failed extraction caused by such changes is not a breach by us.",
          "It is your responsibility to decide whether downloaded content suits your purpose and whether you hold the rights needed to use it.",
        ],
      },
      {
        heading: "Limitation of liability",
        clauses: [
          "To the maximum extent permitted by law, we are not liable for any indirect, incidental, special, consequential, or punitive damages — including lost data, lost profits, or lost goodwill — arising from your use of, or inability to use, the Service.",
          "You bear sole responsibility for claims, losses, or liabilities that arise from your misuse of downloaded content, such as reposting or commercial use without permission.",
          "The Service is provided free of charge; in any case our aggregate liability to you is limited to the minimum extent the law allows.",
        ],
      },
      {
        heading: "Indemnification",
        clauses: [
          "If a third party brings a claim against us because you breached these Terms or misused the Service — including by infringing copyright — you agree to defend us, indemnify us, and hold us harmless from the resulting losses, liabilities, and expenses, including reasonable legal fees.",
        ],
      },
      {
        heading: "Changes to the Service",
        clauses: [
          "We may modify, suspend, or discontinue all or part of the Service at any time without notice.",
          "We may throttle, refuse, or block usage that violates these Terms, without notice.",
          "You may stop using the Service at any time. Sections 3, 8, 9, 10, 13, and 14 survive termination.",
        ],
      },
      {
        heading: "Changes to these Terms",
        clauses: [
          "We may revise these Terms from time to time; revisions take effect when posted on this page. For material changes we will try to call attention to the update on the page.",
          "By continuing to use the Service after a revision takes effect, you accept the revised Terms. If you do not agree, stop using the Service.",
        ],
      },
      {
        heading: "Miscellaneous",
        clauses: [
          "If any provision is held invalid or unenforceable, the rest of these Terms remain in full force.",
          "Our failure to enforce a provision is not a waiver of it.",
          "These Terms are the entire agreement between you and us regarding the Service.",
          "You may not assign your rights or obligations under these Terms without our consent; we may assign ours in connection with a transfer or reorganization of the Service.",
        ],
      },
      {
        heading: "Contact",
        clauses: [
          "Questions about these Terms or the Service — including copyright complaints — can reach us through the Issues page of our GitHub repository: github.com/MarkChu-git/fetchr.",
        ],
      },
    ],
  },
}

export function TermsPage() {
  const lang: Locale = localeFromSearch(useSearch({ from: "/terms" }).lang)
  const text = termsCopy[lang]

  return (
    <AppShell
      variant="section"
      height="fill"
      contentPadding={4}
      mobileNav={false}
      xstyle={styles.shell}
      topNav={
        <TopNav
          label="Fetchr"
          heading={<Heading level={1}>Fetchr</Heading>}
          endContent={
            <Text type="supporting" color="secondary">
              <Link
                to="/"
                search={lang === "en" ? { lang: "en" } : {}}
                {...stylex.props(styles.backLink)}
              >
                {text.back}
              </Link>
            </Text>
          }
        />
      }
    >
      <div {...stylex.props(styles.column)}>
        <Card padding={5}>
          <VStack gap={4}>
            <VStack gap={2}>
              <Heading level={1}>{text.title}</Heading>
              <Text type="supporting" color="secondary" display="block">
                {text.updated}
              </Text>
              <Text display="block">{text.intro}</Text>
            </VStack>
            {text.sections.map((section, i) => (
              <VStack key={section.heading} gap={2}>
                <Heading level={2}>
                  {i + 1}. {section.heading}
                </Heading>
                {section.lead !== undefined ? (
                  <Text display="block">{section.lead}</Text>
                ) : null}
                {section.clauses.map((clause, j) => (
                  <Text key={`${i + 1}.${j + 1}`} display="block">
                    <Text color="secondary">
                      {i + 1}.{j + 1}
                    </Text>{" "}
                    {clause}
                  </Text>
                ))}
              </VStack>
            ))}
          </VStack>
        </Card>
      </div>
    </AppShell>
  )
}
