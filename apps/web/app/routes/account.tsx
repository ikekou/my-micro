import type { SessionPage } from "@my-micro/shared";
import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { apiData } from "../lib/api.server";
import { requireUser } from "../lib/account.server";
import { clientApi, RequestError } from "../lib/api.client";
import { useLocale, words, localHref, formatDate, failureMessage } from "../lib/i18n";
import { BackLink } from "../components/site-shell";
import { Icon } from "../components/icon";
export { PageError as ErrorBoundary } from "../components/site-shell";

export const meta = () => [{ title: "Account & connections — My Micro" }, { name: "robots", content: "noindex" }];
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, "/me/account");
  const connections = await apiData<SessionPage>(request, "/api/v1/me/sessions");
  return { user, connections };
}
export default function Account() {
  const { user, connections: initialConnections } = useLoaderData<typeof loader>();
  const [connections, setConnections] = useState(initialConnections);
  useEffect(() => { setConnections(initialConnections); setRemoved([]); }, [initialConnections]);
  const locale = useLocale();
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function revoke(id: string) {
    setBusy(true); setError("");
    try {
      await clientApi(`/api/v1/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      setRemoved((ids) => [...ids, id]); setConfirming(null);
      setConnections(await clientApi<SessionPage>("/api/v1/me/sessions"));
      setRemoved([]);
    }
    catch (cause) { setError(failureMessage(locale, cause instanceof RequestError ? cause.code : undefined)); }
    finally { setBusy(false); }
  }
  async function loadMore() {
    if (!connections.page.cursor) return;
    setBusy(true); setError("");
    try {
      const next = await clientApi<SessionPage>(`/api/v1/me/sessions?cursor=${encodeURIComponent(connections.page.cursor)}`);
      setConnections((previous) => ({ ...next, sessions: [...previous.sessions, ...next.sessions] }));
    } catch (cause) { setError(failureMessage(locale, cause instanceof RequestError ? cause.code : undefined)); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { await clientApi("/api/v1/me/sign-out", { method: "POST" }); window.location.assign(localHref("/", locale)); }
    catch (cause) { setError(failureMessage(locale, cause instanceof RequestError ? cause.code : undefined)); setBusy(false); }
  }
  const sessions = [...new Map([...(connections.currentSession ? [connections.currentSession] : []), ...connections.sessions].map((session) => [session.id, session])).values()];
  return <div className="narrow-page account-page"><BackLink to={localHref("/me/posts", locale)} label={words(locale, "My posts", "自分の投稿")} /><header className="page-heading"><span className="eyebrow">@{user.username}</span><h1>{words(locale, "Account & connections", "アカウントと接続")}</h1><p>{words(locale, "See where My Micro is connected, and disconnect devices you no longer use.", "My Microの接続先を確認し、使わなくなった接続を解除できます。")}</p></header>{error && <p role="alert" className="error-message">{error}</p>}<section><h2>{words(locale, "Active connections", "有効な接続")}</h2><div className="session-list">{sessions.filter((session) => !removed.includes(session.id)).map((session) => <div className="session-row" key={session.id}><span className="session-symbol"><Icon name={session.current ? "browser" : "terminal"} size={22} /></span><div className="session-info"><h3>{session.current ? words(locale, "This browser", "このブラウザ") : /my-micro/i.test(session.userAgent ?? "") ? words(locale, "My Micro plugin", "My Microプラグイン") : words(locale, "My Micro connection", "My Microへの接続")}</h3><p>{words(locale, "Connected", "接続日")}: {formatDate(session.createdAt, locale, true)}</p><p>{words(locale, "Expires", "有効期限")}: {formatDate(session.expiresAt, locale, true)}</p>{!session.current && <small className="session-agent">{session.userAgent?.slice(0, 180) || words(locale, "Device information unavailable", "端末情報はありません")}</small>}{confirming === session.id && <div className="revoke-confirmation"><p>{words(locale, "Disconnect this session? It will need to sign in again.", "この接続を解除しますか？ 再接続にはログインが必要です。")}</p><div className="button-row"><button className="button" disabled={busy} onClick={() => setConfirming(null)}>{words(locale, "Cancel", "キャンセル")}</button><button className="button danger" disabled={busy} onClick={() => revoke(session.id)}>{words(locale, "Disconnect", "接続を解除")}</button></div></div>}</div>{session.current ? <span className="status-badge">{words(locale, "Current", "使用中")}</span> : confirming !== session.id && <button className="text-button delete-link" disabled={busy} onClick={() => setConfirming(session.id)}>{words(locale, "Disconnect", "解除")}</button>}</div>)}</div>{connections.page.cursor && <button className="button" disabled={busy} onClick={loadMore}>{words(locale, "Load more connections", "接続をさらに表示")}</button>}</section><section className="signout-section"><h2>{words(locale, "Sign out of this browser", "このブラウザからログアウト")}</h2><p>{words(locale, "Your public posts stay in the gallery. Other connections stay active until you disconnect them above.", "公開した投稿はギャラリーに残ります。他の接続を解除する場合は、上の一覧から操作してください。")}</p><button className="button" disabled={busy} onClick={signOut}><Icon name="logout" size={16} />{words(locale, "Sign out", "ログアウト")}</button><Link className="inline-link" to={localHref("/me/posts", locale)}>{words(locale, "Manage or delete my posts", "投稿を管理・削除する")}</Link></section></div>;
}
