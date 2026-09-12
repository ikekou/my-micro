import { useEffect, useState } from "react";
import { Form, Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { DEVICE_CLIENT_ID, type PublicAuthor } from "@my-micro/shared";
import { apiData } from "../lib/api.server";
import { clientApi, RequestError } from "../lib/api.client";
import { useLocale, words, localHref, failureMessage } from "../lib/i18n";
import { Icon } from "../components/icon";

export const meta = () => [{ title: "Connect Codex — My Micro" }, { name: "robots", content: "noindex" }];
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("user_code") ?? "").trim().toUpperCase();
  let user: PublicAuthor | null = null;
  try { user = (await apiData<{ user: PublicAuthor | null }>(request, "/api/v1/me")).user; } catch { /* The page can still explain how to reconnect. */ }
  // Verification claims the code. Defer it to a new same-origin browser request
  // after the GitHub callback navigation has finished.
  let status: "empty" | "check" | "invalid" | "signin" = code ? "signin" : "empty";
  if (code && user) status = /^[A-Z0-9-]{4,32}$/.test(code) ? "check" : "invalid";
  return { code: code.slice(0, 32), status, user };
}
export default function Device() {
  const locale = useLocale();
  const { code, status: initialStatus, user } = useLoaderData<typeof loader>();
  const [verification, setVerification] = useState<"checking" | "valid" | "invalid">("checking");
  const status = initialStatus === "check" ? verification : initialStatus;
  const [matched, setMatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setMatched(false); setResult(null); setError("");
    if (initialStatus !== "check") return;
    const controller = new AbortController();
    setVerification("checking");
    clientApi<{ status?: string; client_id?: string }>(`/api/auth/device?user_code=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setVerification(value.status === "pending" && value.client_id === DEVICE_CLIENT_ID ? "valid" : "invalid"); })
      .catch((cause) => { if (!controller.signal.aborted) { setVerification("invalid"); if (cause instanceof RequestError && cause.status >= 500) setError(failureMessage(locale, cause.code)); } });
    return () => controller.abort();
  }, [code, initialStatus, user?.id, locale]);
  async function decide(allow: boolean) {
    if (allow && !matched) return;
    setBusy(true); setError("");
    try { await clientApi(`/api/auth/device/${allow ? "approve" : "deny"}`, { method: "POST", body: JSON.stringify({ userCode: code }) }); setResult(allow ? "approved" : "denied"); }
    catch (cause) { setError(cause instanceof RequestError && cause.status === 400 ? words(locale, "This code has expired or was already used. Ask Codex to start the connection again.", "このコードは期限切れか、すでに使われています。Codexで接続をやり直してください。") : failureMessage(locale, cause instanceof RequestError ? cause.code : undefined)); }
    finally { setBusy(false); }
  }
  const returnTo = localHref(`/device?user_code=${encodeURIComponent(code)}`, locale);
  return <div className="auth-page device-auth"><section className="auth-card"><span className="auth-symbol"><Icon name={result === "approved" ? "check" : "lock"} size={24} /></span><h1>{result === "approved" ? words(locale, "Connected. Back to Codex.", "接続できました。Codexに戻りましょう。") : result === "denied" ? words(locale, "Connection declined", "接続をキャンセルしました") : words(locale, "Connect your Codex", "Codexからの接続を認証")}</h1>
    {result ? <><p>{result === "approved" ? words(locale, "You can close this page and return to your conversation. Your settings will only be published after you review them in Codex.", "このページを閉じて、会話に戻れます。設定の公開は、Codexで内容を確認した後に行います。") : words(locale, "No connection was allowed. You can start again from Codex whenever you're ready.", "接続は許可されていません。必要になったら、Codexからやり直せます。")}</p><Link className="button" to={localHref("/", locale)}>{words(locale, "Explore the gallery", "ギャラリーを見る")}</Link></> : <>
      <p>{words(locale, "Match this code with the one shown in your own Codex conversation.", "自分のCodexの会話に表示されたコードと、一致することを確認してください。")}</p>
      {code ? <div className="device-code" aria-label={words(locale, "Connection code", "接続コード")}>{code}</div> : <Form method="get" className="device-code-form"><input type="hidden" name="lang" value={locale} /><label htmlFor="device-code">{words(locale, "Code from Codex", "Codexに表示されたコード")}</label><input id="device-code" name="user_code" autoComplete="off" maxLength={32} pattern="[A-Za-z0-9-]{4,32}" required placeholder="ABCD-EFGH" /><button className="button primary" type="submit">{words(locale, "Continue", "続ける")}</button></Form>}
      {status === "signin" && <Link className="button primary full-width" to={localHref(`/login?returnTo=${encodeURIComponent(returnTo)}`, locale)}>{words(locale, "Sign in to continue", "ログインして続ける")}<Icon name="arrow" size={16} /></Link>}
      {status === "checking" && <p className="muted small" role="status">{words(locale, "Checking the connection code…", "接続コードを確認しています…")}</p>}
      {status === "invalid" && <div className="error-message" role="alert">{words(locale, "This code is invalid, expired, or already used. Ask Codex to start the connection again.", "このコードは無効・期限切れ、または使用済みです。Codexで接続をやり直してください。")}</div>}
      {status === "valid" && <><p className="signed-in-as">@{user?.username}</p><label className="confirmation-check"><input type="checkbox" checked={matched} onChange={(event) => setMatched(event.currentTarget.checked)} /><span>{words(locale, "This code matches the one in my Codex conversation.", "自分のCodexに表示されたコードと一致しています。")}</span></label><div className="auth-actions"><button className="button" disabled={busy} onClick={() => decide(false)}>{words(locale, "Decline", "拒否")}</button><button className="button primary" disabled={busy || !matched} onClick={() => decide(true)}>{busy ? words(locale, "Connecting…", "処理中…") : words(locale, "Allow connection", "接続を許可")}</button></div><p className="auth-footnote">{words(locale, "This connects the My Micro plugin to your account so it can manage your posts. It does not publish a post.", "My Microプラグインから自分の投稿を管理できるようにします。この操作で投稿が公開されることはありません。")}</p></>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </>}
    </section></div>;
}
