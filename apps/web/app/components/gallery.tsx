import { Form, Link, useLocation } from "react-router";
import type { PostPage, PublicPost } from "@my-micro/shared";
import { useLocale, words, localHref, safeReturnPath } from "../lib/i18n";
import { MicroBoard } from "./micro-board";
import { Icon } from "./icon";

export function PostCard({ post, browsePath }: { post: PublicPost; browsePath: string }) {
  const locale = useLocale();
  return <article className="post-card"><Link className="post-card-link" to={localHref(`/posts/${post.id}`, locale)} state={{ from: browsePath }}><div className="card-device"><MicroBoard settings={post.settings} /><span className="card-open"><Icon name="arrow" size={18} /></span></div><div className="card-caption"><h2>{post.title}</h2><p className="card-description">{post.description || words(locale, "A personal Codex Micro setup.", "Codex Microの設定。")}</p><span className="card-author">@{post.author.username}</span></div></Link></article>;
}

export function Gallery({ result, query, browsePath, author = false }: { result: PostPage; query: string; browsePath: string; author?: boolean }) {
  const locale = useLocale();
  const location = useLocation();
  const next = new URL(browsePath, "https://my-micro.invalid");
  if (result.page.cursor) next.searchParams.set("cursor", result.page.cursor);
  const first = new URL(browsePath, "https://my-micro.invalid");
  first.searchParams.delete("cursor");
  const refresh = new URL(location.pathname, "https://my-micro.invalid");
  refresh.searchParams.set("lang", locale);
  if (query) refresh.searchParams.set("q", query);
  const previous = (location.state as { previous?: string } | null)?.previous;
  const previousHref = localHref(previous ? safeReturnPath(previous, first.pathname + first.search) : first.pathname + first.search, locale);
  return <>
    <div className="gallery-tools"><Form method="get" action={location.pathname} role="search" className="search-form"><input type="hidden" name="lang" value={locale} /><Icon name="search" size={18} /><input type="search" name="q" defaultValue={query} key={query} maxLength={100} placeholder={words(locale, "Find a setup or a function…", "設定や機能を検索…")} aria-label={words(locale, "Search setups and functions", "設定・機能を検索")} /><button type="submit" aria-label={words(locale, "Search", "検索")}><Icon name="arrow" size={17} /></button></Form><Link className="text-button shuffle-link" to={refresh.pathname + refresh.search}><Icon name="shuffle" size={16} />{words(locale, "Shuffle", "並べ替える")}</Link></div>
    {result.items.length > 0 ? <div className="post-grid">{result.items.map((post) => <PostCard post={post} browsePath={browsePath} key={post.id} />)}</div> : <section className="empty-state"><div className="empty-key" aria-hidden="true"><Icon name={query ? "search" : "plus"} size={28} /></div><h2>{query ? words(locale, "No Micros found", "一致するMicroはありません") : author ? words(locale, "No shared Micros yet", "まだ投稿はありません") : words(locale, "The first Micro belongs here", "最初のMicroを待っています")}</h2><p>{query ? words(locale, "Try another word, or return to all setups.", "別のキーワードを試すか、すべての投稿に戻れます。") : author ? words(locale, "This person hasn't shared a setup yet.", "この投稿者は、まだ設定を共有していません。") : words(locale, "This gallery is just getting started. Share a setup and make it yours.", "このギャラリーは、始まったばかりです。あなたの設定を共有してみませんか。")}</p><Link className="button" to={localHref(query ? location.pathname : "/share", locale)}>{query ? words(locale, "Clear search", "検索をクリア") : words(locale, "Share your Micro", "自分のMicroを共有")}<Icon name="arrow" size={16} /></Link></section>}
    {(result.page.cursor || new URL(browsePath, "https://my-micro.invalid").searchParams.has("cursor")) && <nav className="pagination" aria-label={words(locale, "Gallery pages", "ギャラリーのページ")}><div>{new URL(browsePath, "https://my-micro.invalid").searchParams.has("cursor") && <Link className="button" to={previousHref}><Icon name="back" size={16} />{previous ? words(locale, "Previous", "前のページ") : words(locale, "First page", "最初のページ")}</Link>}</div>{result.page.cursor && <Link className="button" to={next.pathname + next.search} state={{ previous: browsePath }}>{words(locale, "More Micros", "ほかのMicroを見る")}<Icon name="arrow" size={16} /></Link>}</nav>}
  </>;
}
