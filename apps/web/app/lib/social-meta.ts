import type { MetaDescriptor } from "react-router";

type MetaContext = {
  matches: { id: string; loaderData: unknown }[];
  location: { pathname: string; search: string };
};

export function socialMeta({ matches, location }: MetaContext, options: { title?: string; description?: string; unavailable?: boolean } = {}): MetaDescriptor[] {
  const root = matches.find((match) => match.id === "root")?.loaderData as { origin?: string; locale?: string } | undefined;
  const ja = root?.locale === "ja";
  const title = options.title ?? (ja ? "My Micro — Codex Microの設定ギャラリー" : "My Micro — a gallery of Codex Micro setups");
  const description = options.description?.trim().slice(0, 180) || (ja
    ? "みんなのCodex Microの配置やショートカットを見て、自分の設定も共有しよう。"
    : "Discover how people make Codex Micro their own. Explore layouts, shortcuts, and settings — then share yours.");
  const basic: MetaDescriptor[] = [{ title }, { name: "description", content: description }];
  if (options.unavailable || !root?.origin) return [...basic, { name: "robots", content: "noindex" }];
  const url = new URL(location.pathname, root.origin);
  // Keep only the explicit language; never share seeds, cursors, searches or auth codes.
  if (new URLSearchParams(location.search).get("lang") === "ja") url.searchParams.set("lang", "ja");
  const image = new URL("/social/my-micro.png", root.origin).href;
  const alt = "My Micro: a gallery of Codex Micro setups, with a keyboard layout illustration.";
  return [
    ...basic,
    { tagName: "link", rel: "canonical", href: url.href },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "My Micro" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url.href },
    { property: "og:locale", content: ja ? "ja_JP" : "en_US" },
    { property: "og:image", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: alt },
  ];
}
