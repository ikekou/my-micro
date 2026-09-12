import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { REPOSITORY_URL } from "@my-micro/shared";
import { useLocale, words, localHref } from "../lib/i18n";
import { sharePrompt } from "../lib/prompts";
import { CopyPrompt } from "../components/copy-prompt";
import { BackLink } from "../components/site-shell";
import { Icon } from "../components/icon";

export const meta = () => [{ title: "Share your Micro — My Micro" }];
export function loader({ request }: LoaderFunctionArgs) { return { siteUrl: new URL(request.url).origin }; }
export default function Share() {
  const locale = useLocale();
  const { siteUrl } = useLoaderData<typeof loader>();
  return <div className="narrow-page share-page"><BackLink /><header className="page-heading"><span className="eyebrow">MAKE IT YOURS. SHARE IT HERE.</span><h1>{words(locale, "A place for your Micro.", "あなたのMicroも、ここに。")}</h1><p>{words(locale, "Copy this prompt into Codex on your Mac. It will gather your settings and help you share them.", "このプロンプトを、MacのCodexに貼り付けてください。設定を読み取り、共有する内容を一緒に整えます。")}</p></header><CopyPrompt text={sharePrompt(locale, siteUrl)} />
    <ol className="share-steps"><li><span>01</span><div><h2>{words(locale, "Paste into Codex", "MacのCodexに貼り付ける")}</h2><p>{words(locale, "Open a local task on the Mac where you use Micro. Codex installs the plugin if you need it.", "Microを使うMacで、ローカルのタスクを開きます。プラグインがなければ、Codexが導入を進めます。")}</p></div></li><li><span>02</span><div><h2>{words(locale, "Connect with GitHub", "初回はGitHubで認証する")}</h2><p>{words(locale, "On your first share, sign in in your browser and confirm the code shown in Codex.", "初めて共有するときは、ブラウザでログインし、Codexに表示されたコードを確認して接続します。")}</p></div></li><li><span>03</span><div><h2>{words(locale, "Review, then publish", "内容を確認して公開する")}</h2><p>{words(locale, "See the title, description, and settings in your conversation. Confirm when you're ready, and Codex returns your post's link.", "会話の中でタイトル・説明・設定を確認します。公開を確認すると投稿され、ページのリンクが返ってきます。")}</p></div></li></ol>
    <div className="privacy-inline"><Icon name="lock" size={18} /><p>{words(locale, "Your local paths, chat names, skill source, and saved text are left out. Settings are sent only after your confirmation.", "ローカルパス、会話名、スキル本体、定型文の内容は共有しません。設定を送信するのは、公開内容を確認した後です。")}</p></div>
    <p className="mobile-notice">{words(locale, "Reading on your phone? Continue in Codex on your Mac to share.", "スマートフォンで見ていますか？ 共有するときは、MacのCodexで続きを進めてください。")}</p>
    <div className="support-links"><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">{words(locale, "Read the plugin source", "プラグインのソースを見る")}<Icon name="external" size={14} /></a><Link to={localHref("/about", locale)}>{words(locale, "What's public?", "公開される情報について")}</Link></div>
  </div>;
}
