import { data, Links, Meta, Outlet, Scripts, ScrollRestoration, type LoaderFunctionArgs } from "react-router";
import type { PublicAuthor } from "@my-micro/shared";
import { apiData } from "./lib/api.server";
import { requestLocale, useSite } from "./lib/i18n";
import { SiteShell, PageError } from "./components/site-shell";
import "./app.css";

export const links = () => [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }];
export async function loader({ request }: LoaderFunctionArgs) {
  const locale = requestLocale(request);
  let user: PublicAuthor | null = null;
  let authAvailable = true;
  try { user = (await apiData<{ user: PublicAuthor | null }>(request, "/api/v1/me")).user; }
  catch { authAvailable = false; }
  return data({ locale, user, authAvailable, origin: new URL(request.url).origin }, { headers: { "Set-Cookie": `my-micro-lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`, "Cache-Control": "private, no-store" } });
}
export function Layout({ children }: { children: React.ReactNode }) {
  const { locale } = useSite();
  return <html lang={locale}><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#fcfcfb" /><Meta /><Links /></head><body>{children}<ScrollRestoration getKey={(location) => { const query = new URLSearchParams(location.search); query.delete("lang"); query.sort(); return location.pathname + "?" + query; }} /><Scripts /></body></html>;
}
export default function App() { return <SiteShell><Outlet /></SiteShell>; }
export function ErrorBoundary() { return <SiteShell><PageError /></SiteShell>; }
