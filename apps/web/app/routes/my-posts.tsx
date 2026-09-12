import { useState } from "react";
import { Link, redirect, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";
import type { PostPage } from "@my-micro/shared";
import { apiData } from "../lib/api.server";
import { requireUser } from "../lib/account.server";
import { accountDocumentPath } from "../lib/document-paths";
import { clientApi, RequestError } from "../lib/api.client";
import { useLocale, words, localHref, formatDate, failureMessage } from "../lib/i18n";
import { managePrompt } from "../lib/prompts";
import { CopyPrompt } from "../components/copy-prompt";
import { MicroBoard } from "../components/micro-board";
import { BackLink } from "../components/site-shell";
import { Icon } from "../components/icon";
export { PageError as ErrorBoundary } from "../components/site-shell";

export const meta = () => [{ title: "My posts — My Micro" }, { name: "robots", content: "noindex" }];
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request, "/me/posts");
  const url = new URL(request.url);
  const params = new URLSearchParams({ limit: "20" });
  for (const key of ["seed", "cutoff", "cursor"]) { const value = url.searchParams.get(key); if (value) params.set(key, value); }
  const result = await apiData<PostPage>(request, `/api/v1/me/posts?${params}`);
  if (!url.searchParams.has("seed") || !url.searchParams.has("cutoff")) throw redirect(accountDocumentPath(request.url, "/me/posts", result.page));
  return { result, origin: url.origin };
}
export default function MyPosts() {
  const { result, origin } = useLoaderData<typeof loader>();
  const locale = useLocale();
  const revalidator = useRevalidator();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<string[]>([]);
  const posts = result.items.filter((post) => !deleted.includes(post.id));
  async function remove(id: string, version: number) {
    setBusy(true); setError("");
    try { await clientApi(`/api/v1/posts/${id}`, { method: "DELETE", headers: { "If-Match": `"${version}"` } }); setDeleted([...deleted, id]); setConfirming(null); revalidator.revalidate(); }
    catch (cause) { setError(failureMessage(locale, cause instanceof RequestError ? cause.code : undefined)); }
    finally { setBusy(false); }
  }
  const next = localHref(`/me/posts?seed=${encodeURIComponent(result.page.seed)}&cutoff=${encodeURIComponent(result.page.cutoff)}&cursor=${encodeURIComponent(result.page.cursor ?? "")}`, locale);
  return <div className="manage-page"><BackLink /><header className="page-heading"><span className="eyebrow">YOUR COLLECTION</span><h1>{words(locale, "My Micros", "自分のMicro")}</h1><p>{words(locale, "Keep your setups together. Update a favorite, or make room for something new.", "共有した設定を、ここから更新・削除できます。")}</p></header>{error && <div className="error-message" role="alert">{error}<button className="inline-link" onClick={() => { revalidator.revalidate(); setError(""); }}>{words(locale, "Reload", "読み込み直す")}</button></div>}
    {posts.length === 0 ? <section className="empty-state"><div className="empty-key"><Icon name="plus" size={28} /></div><h2>{words(locale, "Your first setup starts here", "最初の設定を共有してみませんか")}</h2><p>{words(locale, "Share from Codex, then find your posts here.", "Codexから共有した投稿が、ここに表示されます。")}</p><Link className="button primary" to={localHref("/share", locale)}>{words(locale, "Share your Micro", "自分のMicroを共有")}</Link></section> : <div className="managed-posts">{posts.map((post) => <article className="managed-post" key={post.id}><Link className="managed-preview" to={localHref(`/posts/${post.id}`, locale)}><MicroBoard settings={post.settings} /></Link><div className="managed-content"><h2><Link to={localHref(`/posts/${post.id}`, locale)}>{post.title}</Link></h2><p className="small muted">{words(locale, "Updated", "更新日")}: {formatDate(post.updatedAt, locale)}</p><p className="managed-description">{post.description}</p><details className="manage-prompts"><summary>{words(locale, "Update or delete with Codex", "Codexで更新・削除する")}</summary><CopyPrompt compact label={words(locale, "Update this post", "この投稿を更新")} text={managePrompt(locale, `${origin}/posts/${post.id}`, "update")} /><CopyPrompt compact label={words(locale, "Delete this post", "この投稿を削除")} text={managePrompt(locale, `${origin}/posts/${post.id}`, "delete")} /></details>{confirming === post.id ? <div className="delete-confirmation"><p>{words(locale, `Delete “${post.title}”? This removes its public page.`, `「${post.title}」を削除しますか？ 公開ページが削除されます。`)}</p><div className="button-row"><button className="button" disabled={busy} onClick={() => setConfirming(null)}>{words(locale, "Keep post", "残す")}</button><button className="button danger" disabled={busy} onClick={() => remove(post.id, post.version)}>{busy ? words(locale, "Deleting…", "削除中…") : words(locale, "Delete post", "投稿を削除")}</button></div></div> : <button className="text-button delete-link" onClick={() => { setConfirming(post.id); setError(""); }}>{words(locale, "Delete in browser", "ブラウザから削除")}</button>}</div></article>)}</div>}
    <div className="pagination"><Link className="text-button" to={localHref("/me/account", locale)}>{words(locale, "Manage connections", "接続を管理する")}<Icon name="arrow" size={16} /></Link>{result.page.cursor && <Link className="button" to={next}>{words(locale, "More posts", "ほかの投稿")}</Link>}</div>
  </div>;
}
