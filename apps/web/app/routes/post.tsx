import { socialMeta } from "../lib/social-meta";
import { Link, useLoaderData, useLocation, type LoaderFunctionArgs, type MetaFunction } from "react-router";
import type { PublicPost } from "@my-micro/shared";
import { apiData } from "../lib/api.server";
import { useLocale, words, localHref, formatDate, safeReturnPath } from "../lib/i18n";
import { MicroInspector, MicroOptions } from "../components/micro-board";
import { BackLink } from "../components/site-shell";
import { Icon } from "../components/icon";
export { PageError as ErrorBoundary } from "../components/site-shell";
export function loader({ request, params }: LoaderFunctionArgs) { return apiData<{ post: PublicPost }>(request, `/api/v1/posts/${encodeURIComponent(params.id ?? "")}`); }
export const meta: MetaFunction<typeof loader> = (args) => socialMeta(args, { title: args.loaderData ? `${args.loaderData.post.title} — My Micro` : "Post unavailable — My Micro", description: args.loaderData?.post.description || (args.loaderData ? `Explore @${args.loaderData.post.author.username}’s Codex Micro setup.` : undefined), unavailable: !args.loaderData });
export default function Post() {
  const { post } = useLoaderData<typeof loader>();
  const locale = useLocale();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <article className="post-detail"><BackLink to={from ? localHref(safeReturnPath(from, "/"), locale) : undefined} /><header className="post-heading"><span className="eyebrow">A MICRO BY <Link to={localHref(`/authors/${post.author.id}`, locale)}>@{post.author.username}</Link></span><h1>{post.title}</h1>{post.description && <p className="post-description">{post.description}</p>}</header><MicroInspector settings={post.settings} /><MicroOptions settings={post.settings} /><p className="capture-note">{words(locale, "Settings captured", "設定の取得日")}: {formatDate(post.settings.capturedAt, locale, true)}<span>Codex {post.settings.source.appVersion}</span></p><aside className="share-aside"><div><h2>{words(locale, "What does your Micro do?", "あなたのMicroは、どんな使い方？")}</h2><p>{words(locale, "Add your own setup to the collection.", "あなたの設定も、このギャラリーに。")}</p></div><Link className="button" to={localHref("/share", locale)}>{words(locale, "Share your Micro", "自分のMicroを共有")}<Icon name="arrow" size={16} /></Link></aside></article>;
}
