import assert from "node:assert/strict";
import { test } from "node:test";
import { accountDocumentPath, galleryDocumentPath } from "../../app/lib/document-paths";

const origin = "http://localhost:5173";
const page = { seed: "review-seed", cutoff: "2026-09-12T12:00:00.000Z" };

test("a search from the root .data request redirects to the gallery document", () => {
  const request = `${origin}/_.data?lang=ja&q=${encodeURIComponent("ノブ")}&_routes=routes%2Fhome&internal=discard`;
  const target = new URL(galleryDocumentPath(request, undefined, page), origin);
  assert.equal(target.pathname, "/");
  assert.equal(target.searchParams.get("q"), "ノブ");
  assert.equal(target.searchParams.get("lang"), "ja");
  assert.equal(target.searchParams.get("seed"), page.seed);
  assert.equal(target.searchParams.get("cutoff"), page.cutoff);
  assert.deepEqual([...target.searchParams.keys()].sort(), ["cutoff", "lang", "q", "seed"]);
});

test("author searches and returned back links use the author document and current cursor", () => {
  const request = `${origin}/authors/author-id.data?q=Plan&lang=en&cursor=current-page&seed=old&cutoff=old&_routes=routes%2Fauthor`;
  const target = new URL(galleryDocumentPath(request, "author-id", page), origin);
  assert.equal(target.pathname, "/authors/author-id");
  assert.equal(target.searchParams.get("q"), "Plan");
  assert.equal(target.searchParams.get("cursor"), "current-page");
  assert.equal(target.searchParams.get("seed"), page.seed);
  assert.equal(target.searchParams.get("cutoff"), page.cutoff);
  assert(!target.searchParams.has("_routes"));
});

test("unauthenticated account data requests return to real account pages after sign-in", () => {
  const posts = new URL(accountDocumentPath(`${origin}/me/posts.data?lang=ja&seed=s&cutoff=t&cursor=c&_routes=routes%2Fmy-posts`, "/me/posts"), origin);
  assert.equal(posts.pathname, "/me/posts");
  assert.deepEqual(Object.fromEntries(posts.searchParams), { lang: "ja", seed: "s", cutoff: "t", cursor: "c" });
  const account = new URL(accountDocumentPath(`${origin}/me/account.data?lang=en&cursor=c&_routes=routes%2Faccount`, "/me/account"), origin);
  assert.equal(account.pathname, "/me/account");
  assert.deepEqual(Object.fromEntries(account.searchParams), { lang: "en" });
});

test("document requests and internal data requests resolve to the same public location", () => {
  assert.equal(galleryDocumentPath(`${origin}/?lang=ja&q=mic`, undefined, page), galleryDocumentPath(`${origin}/_.data?lang=ja&q=mic&_routes=routes%2Fhome`, undefined, page));
  assert.equal(accountDocumentPath(`${origin}/me/posts?lang=ja`, "/me/posts"), accountDocumentPath(`${origin}/me/posts.data?lang=ja&_routes=routes%2Fmy-posts`, "/me/posts"));
});

test("the first owner listing fixes its seed and cutoff before later revalidation", () => {
  const firstLocation = accountDocumentPath(`${origin}/me/posts.data?lang=ja&_routes=routes%2Fmy-posts`, "/me/posts", page);
  const first = new URL(firstLocation, origin);
  assert.equal(first.pathname, "/me/posts");
  assert.equal(first.searchParams.get("seed"), page.seed);
  assert.equal(first.searchParams.get("cutoff"), page.cutoff);
  const revalidatedRequest = `${origin}/me/posts.data${first.search}&_routes=routes%2Fmy-posts`;
  assert.equal(accountDocumentPath(revalidatedRequest, "/me/posts", page), firstLocation);
});
