import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { loadGallery } from "../lib/gallery.server";
import { useLocale, words } from "../lib/i18n";
import { Gallery } from "../components/gallery";
export { PageError as ErrorBoundary } from "../components/site-shell";
export const meta = () => [{ title: "My Micro — a gallery of Codex Micro setups" }, { name: "description", content: "Explore the ways people make Codex Micro their own. Layouts, shortcuts, and the little details." }];
export function loader({ request }: LoaderFunctionArgs) { return loadGallery(request); }
export default function Home() {
  const locale = useLocale();
  const { result, query, browsePath } = useLoaderData<typeof loader>();
  return <div className="gallery-page"><div className="gallery-intro"><span className="eyebrow">THE MICRO GALLERY</span><h1>{words(locale, "Small keyboard.\nPersonal possibilities.", "小さなキーボード。\nそれぞれの使い方。")}</h1><p>{words(locale, "A collection of Codex Micro setups, made yours.", "みんなのCodex Micro、その配置と使い方を集めました。")}</p></div><Gallery result={result} query={query} browsePath={browsePath} /></div>;
}
