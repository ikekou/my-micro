import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { clientApi, RequestError } from "../lib/api.client";
import { useSite, words, localHref, safeReturnPath, failureMessage } from "../lib/i18n";
import { BackLink } from "../components/site-shell";
import { BrandMark, Icon } from "../components/icon";

export const meta = () => [{ title: "Sign in — My Micro" }];
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return { returnTo: safeReturnPath(url.searchParams.get("returnTo")), origin: url.origin, authError: url.searchParams.has("auth_error") };
}
export default function Login() {
  const { locale, user } = useSite();
  const { returnTo, origin, authError } = useLoaderData<typeof loader>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(authError ? words(locale, "Sign-in wasn't completed. You can try again.", "ログインが完了しませんでした。もう一度お試しください。") : "");
  async function login() {
    setBusy(true); setError("");
    try {
      const errorReturn = localHref(`/login?returnTo=${encodeURIComponent(returnTo)}&auth_error=1`, locale);
      const result = await clientApi<{ url?: string }>("/api/auth/sign-in/social", { method: "POST", body: JSON.stringify({ provider: "github", callbackURL: new URL(returnTo, origin).href, errorCallbackURL: new URL(errorReturn, origin).href }) });
      if (!result.url || new URL(result.url).protocol !== "https:") throw new Error("Invalid sign-in redirect");
      window.location.assign(result.url);
    } catch (cause) { setError(failureMessage(locale, cause instanceof RequestError ? cause.code : undefined)); setBusy(false); }
  }
  return <div className="auth-page"><BackLink /><section className="auth-card"><BrandMark /><h1>{words(locale, "Your Micro, your collection.", "あなたのMicroを、\nあなたのコレクションに。")}</h1><p>{words(locale, "Sign in to share and manage your setups.", "ログインすると、設定を共有したり、自分の投稿を管理したりできます。")}</p>{user ? <><p className="signed-in-as">{words(locale, "Signed in as", "ログイン中")}: @{user.username}</p><Link className="button primary full-width" to={returnTo}>{words(locale, "Continue", "続ける")}<Icon name="arrow" size={16} /></Link></> : <button className="button primary full-width" type="button" disabled={busy} onClick={login}>{busy ? words(locale, "Opening GitHub…", "GitHubを開いています…") : words(locale, "Continue with GitHub", "GitHubでログイン")}<Icon name="arrow" size={16} /></button>}{error && <p className="error-message" role="alert">{error}</p>}<p className="auth-footnote">{words(locale, "Your GitHub username is shown on your posts. You can browse the gallery without signing in.", "投稿にはGitHubのユーザー名が表示されます。ギャラリーを見るだけなら、ログインは不要です。")}</p><Link className="inline-link" to={localHref("/about", locale)}>{words(locale, "About privacy", "プライバシーについて")}</Link></section></div>;
}
