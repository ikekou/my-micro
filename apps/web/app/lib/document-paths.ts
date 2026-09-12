import type { PostPage } from "@my-micro/shared";

const galleryQueryKeys = ["lang", "q", "seed", "cutoff", "cursor"] as const;

/** Loader requests may use React Router's internal .data path. Public links
 * always start from the known document route and a whitelist of query keys. */
function documentPath(requestUrl: string, pathname: string, queryKeys: readonly string[], page?: Pick<PostPage["page"], "seed" | "cutoff">): string {
  const source = new URL(requestUrl);
  const query = new URLSearchParams();
  for (const key of queryKeys) {
    const value = source.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  if (page) {
    query.set("seed", page.seed);
    query.set("cutoff", page.cutoff);
  }
  return pathname + (query.size ? `?${query}` : "");
}

export function galleryDocumentPath(requestUrl: string, authorId?: string, page?: Pick<PostPage["page"], "seed" | "cutoff">): string {
  return documentPath(requestUrl, authorId ? `/authors/${encodeURIComponent(authorId)}` : "/", galleryQueryKeys, page);
}

export type AccountDocumentPath = "/me/posts" | "/me/account";
export function accountDocumentPath(requestUrl: string, pathname: AccountDocumentPath, page?: Pick<PostPage["page"], "seed" | "cutoff">): string {
  return documentPath(requestUrl, pathname, pathname === "/me/posts" ? ["lang", "seed", "cutoff", "cursor"] : ["lang"], pathname === "/me/posts" ? page : undefined);
}
