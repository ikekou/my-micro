import { data, redirect } from "react-router";
import type { PostPage, PublicAuthor } from "@my-micro/shared";
import { apiData } from "./api.server";
import { galleryDocumentPath } from "./document-paths";

export async function loadGallery(request: Request, authorId?: string) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const name of ["q", "seed", "cutoff", "cursor"]) { const value = url.searchParams.get(name); if (value) params.set(name, value); }
  if (authorId) params.set("author", authorId);
  params.set("limit", "12");
  const result = await apiData<PostPage>(request, `/api/v1/posts?${params}`);
  const browsePath = galleryDocumentPath(request.url, authorId, result.page);
  if (!url.searchParams.has("seed") || !url.searchParams.has("cutoff")) {
    throw redirect(browsePath);
  }
  const author = authorId ? (await apiData<{ author: PublicAuthor }>(request, `/api/v1/authors/${encodeURIComponent(authorId)}`)).author : null;
  return data({ result, query: url.searchParams.get("q") ?? "", browsePath, author }, { headers: { "Cache-Control": "private, no-store" } });
}
