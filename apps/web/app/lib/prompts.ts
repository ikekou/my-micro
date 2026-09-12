import { REPOSITORY_URL, type Locale } from "@my-micro/shared";

export function sharePrompt(locale: Locale, siteUrl: string): string {
  return locale === "ja"
    ? `${REPOSITORY_URL} のMy Microプラグインを導入し、このMacのCodex Micro設定から ${siteUrl} に共有する投稿案を作ってください。すでに導入済みならそれを使ってください。公開する内容をこの会話で見せ、私が確認してから投稿し、公開ページのURLを教えてください。`
    : `Install the My Micro plugin from ${REPOSITORY_URL} and prepare a post of this Mac's Codex Micro settings for ${siteUrl}. If it is already installed, use it. Show me everything that will be public in this conversation, publish only after I confirm, and give me the public post URL.`;
}

export function managePrompt(locale: Locale, postUrl: string, operation: "update" | "delete") {
  if (locale === "ja") return `${REPOSITORY_URL} のMy Microプラグインを使い、私の投稿 ${postUrl} を${operation === "update" ? "このMacの現在のCodex Micro設定で更新" : "削除"}してください。対象${operation === "update" ? "と公開する内容" : "の投稿"}をこの会話で見せ、私が確認してから実行してください。`;
  return `Use the My Micro plugin from ${REPOSITORY_URL} to ${operation === "update" ? "update my post with this Mac's current Codex Micro settings" : "delete my post"}: ${postUrl}. Show me the target post${operation === "update" ? " and everything that will be public" : ""} in this conversation and proceed only after I confirm.`;
}
