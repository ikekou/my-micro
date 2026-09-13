import { useRouteLoaderData } from "react-router";
import type { Locale, PublicAuthor } from "@my-micro/shared";

export interface RootData { locale: Locale; user: PublicAuthor | null; authAvailable: boolean }

export function requestLocale(request: Request): Locale {
  const chosen = new URL(request.url).searchParams.get("lang");
  if (chosen === "ja" || chosen === "en") return chosen;
  const saved = request.headers.get("cookie")?.match(/(?:^|;\s*)my-micro-lang=(ja|en)(?:;|$)/)?.[1];
  if (saved === "ja" || saved === "en") return saved;
  return "en";
}

export function useSite() { return useRouteLoaderData<RootData>("root") ?? { locale: "en" as const, user: null, authAvailable: true }; }
export function useLocale() { return useSite().locale; }
export function words(locale: Locale, en: string, ja: string) { return locale === "ja" ? ja : en; }

export function localHref(path: string, locale: Locale): string {
  const url = new URL(path, "https://my-micro.invalid");
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeReturnPath(value: string | null, fallback = "/me/posts"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  const parsed = new URL(value, "https://my-micro.invalid");
  return parsed.origin === "https://my-micro.invalid" ? parsed.pathname + parsed.search : fallback;
}

export function formatDate(value: string, locale: Locale, time = false) {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric", month: "short", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short", timeZone: "UTC" } as const : {}),
  }).format(new Date(value));
}

export function failureMessage(locale: Locale, code?: string): string {
  if (code === "UNAUTHORIZED" || code === "SESSION_EXPIRED" || code === "AUTH_REQUIRED") return words(locale, "Your session has ended. Please sign in again.", "接続の有効期限が切れました。もう一度ログインしてください。");
  if (code === "VERSION_CONFLICT" || code === "CONFLICT" || code === "PRECONDITION_FAILED") return words(locale, "This post has changed. Reload it before trying again.", "投稿が更新されています。読み込み直してから、もう一度お試しください。");
  if (code === "RATE_LIMITED") return words(locale, "Please wait a moment, then try again.", "少し時間をおいてから、もう一度お試しください。");
  if (code === "AUTH_NOT_CONFIGURED") return words(locale, "Sign-in is not available yet. Please try again later.", "ログインの準備中です。時間をおいてお試しください。");
  return words(locale, "We couldn't complete that. Please try again.", "処理を完了できませんでした。もう一度お試しください。");
}
