import { Link } from "react-router";
import { useLocale, localHref, words } from "../lib/i18n";
export const meta = () => [{ title: "Page not found — My Micro" }];
export function loader() { throw new Response(null, { status: 404 }); }
export { PageError as ErrorBoundary } from "../components/site-shell";
export default function NotFound() { const locale = useLocale(); return <Link to={localHref("/", locale)}>{words(locale, "Back to the gallery", "みんなのMicroに戻る")}</Link>; }
