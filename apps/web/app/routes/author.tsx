import type { MetaFunction } from "react-router";
import { socialMeta } from "../lib/social-meta";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { loadGallery } from "../lib/gallery.server";
import { Gallery } from "../components/gallery";
import { BackLink } from "../components/site-shell";
import { useLocale, words } from "../lib/i18n";
export { PageError as ErrorBoundary } from "../components/site-shell";
export const meta: MetaFunction<typeof loader> = (args) => socialMeta(args, { title: args.loaderData?.author ? `@${args.loaderData.author.username}’s Micros — My Micro` : "Shared Micros — My Micro", unavailable: !args.loaderData });
export function loader({ request, params }: LoaderFunctionArgs) { return loadGallery(request, params.id); }
export default function Author() {
  const { result, query, browsePath, author } = useLoaderData<typeof loader>();
  const locale = useLocale();
  return <div className="gallery-page author-page"><BackLink /><header className="gallery-intro"><span className="eyebrow">{words(locale, "A PERSONAL COLLECTION", "この人のコレクション")}</span><h1>{author ? `@${author.username}` : words(locale, "Shared Micros", "この投稿者のMicro")}</h1><p>{words(locale, "Different setups. One point of view.", "ひとりの使い方にも、いろいろな形。")}</p></header><Gallery result={result} query={query} browsePath={browsePath} author /></div>;
}
