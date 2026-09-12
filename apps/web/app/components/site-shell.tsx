import { isRouteErrorResponse, Link, useLocation, useNavigation, useRouteError } from "react-router";
import { REPOSITORY_URL } from "@my-micro/shared";
import { useSite, useLocale, localHref, words } from "../lib/i18n";
import { BrandMark, Icon } from "./icon";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { locale, user } = useSite();
  const location = useLocation();
  const navigation = useNavigation();
  const languageUrl = new URL(location.pathname + location.search, "https://my-micro.invalid");
  languageUrl.searchParams.set("lang", locale === "ja" ? "en" : "ja");
  const loginReturn = location.pathname === "/login" ? localHref("/me/posts", locale) : location.pathname + location.search;
  const login = localHref(`/login?returnTo=${encodeURIComponent(loginReturn)}`, locale);
  return <>
    <a className="skip-link" href="#main">{words(locale, "Skip to content", "本文へ移動")}</a>
    <header className="site-header"><div className="header-inner"><Link className="brand" to={localHref("/", locale)} aria-label={words(locale, "My Micro — gallery", "My Micro — ギャラリー")}><BrandMark /><span>My Micro</span></Link><nav aria-label={words(locale, "Main navigation", "メインメニュー")}>
      <Link className="language-link" to={languageUrl.pathname + languageUrl.search} state={location.state} preventScrollReset aria-label={words(locale, "Switch to Japanese", "英語に切り替え")} lang={locale === "ja" ? "en" : "ja"}>{locale === "ja" ? "EN" : "日本語"}</Link>
      {user ? <details className="account-menu"><summary aria-label={words(locale, "Account menu", "アカウントメニュー")}><span className="avatar-letter">{user.username.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.username}</span></summary><div className="account-popover" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }}><Link to={localHref("/me/posts", locale)}>{words(locale, "My posts", "自分の投稿")}</Link><Link to={localHref("/me/account", locale)}>{words(locale, "Account & connections", "アカウントと接続")}</Link></div></details> : <Link className="login-link" to={login}>{words(locale, "Sign in", "ログイン")}</Link>}
      <Link className="button primary header-share" to={localHref("/share", locale)} aria-label={words(locale, "Share your Micro", "自分のMicroを共有")}><Icon name="plus" size={16} /><span className="desktop-share-label">{words(locale, "Share your Micro", "自分のMicroを共有")}</span><span className="mobile-share-label">{words(locale, "Share", "共有する")}</span></Link>
    </nav></div>{navigation.state !== "idle" && <div className="navigation-progress" aria-label={words(locale, "Loading", "読み込み中")} />}</header>
    <main id="main" className="page-container">{children}</main>
    <footer className="site-footer"><div><Link className="footer-brand" to={localHref("/", locale)}>My Micro</Link><p>{words(locale, "A little device. A lot of ways to make it yours.", "小さなMicroに、それぞれの使い方。")}</p></div><div className="footer-links"><Link to={localHref("/about", locale)}>{words(locale, "About & privacy", "このサイトとプライバシー")}</Link><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub <Icon name="external" size={13} /></a></div></footer>
  </>;
}

export function PageError() {
  const error = useRouteError();
  const locale = useLocale();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const missing = status === 404;
  return <section className="empty-state page-error"><span className="eyebrow">{status}</span><h1>{missing ? words(locale, "This Micro isn't here", "この投稿は見つかりません") : words(locale, "Something didn't load", "読み込めませんでした")}</h1><p>{missing ? words(locale, "The post may have been removed, or the link may be incorrect.", "投稿が削除されたか、リンクが間違っている可能性があります。") : words(locale, "Please try again in a moment.", "少し時間をおいて、もう一度お試しください。")}</p><Link className="button" to={localHref("/", locale)}><Icon name="back" size={16} />{words(locale, "Back to the gallery", "みんなのMicroに戻る")}</Link></section>;
}

export function BackLink({ to, label }: { to?: string; label?: string }) {
  const locale = useLocale();
  return <Link className="back-link" to={to ?? localHref("/", locale)}><Icon name="back" size={16} />{label ?? words(locale, "All Micros", "みんなのMicro")}</Link>;
}
