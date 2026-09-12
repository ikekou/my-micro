import { useEffect, useState } from "react";
import { useLocale, words } from "../lib/i18n";
import { Icon } from "./icon";

export function CopyPrompt({ text, compact = false, label }: { text: string; compact?: boolean; label?: string }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setCopied(false); setFailed(false); }, [text]);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); }
    catch { setFailed(true); }
  }
  return <div className={`prompt-box ${compact ? "compact" : ""}`}>
    <div className="prompt-bar"><span>{label ?? words(locale, "A prompt for Codex", "Codexに貼り付けるプロンプト")}</span><button className="copy-button" type="button" onClick={copy}><Icon name={copied ? "check" : "copy"} size={16} />{copied ? words(locale, "Copied", "コピーしました") : words(locale, "Copy prompt", "コピー")}</button></div>
    <textarea aria-label={label ?? words(locale, "Prompt", "プロンプト")} readOnly value={text} onFocus={(event) => event.currentTarget.select()} rows={compact ? 4 : 7} spellCheck={false} />
    <span className="sr-only" role="status">{copied ? words(locale, "Prompt copied to clipboard.", "プロンプトをコピーしました。") : ""}</span>
    {failed && <p className="inline-note" role="status">{words(locale, "Select the text above and copy it with your keyboard.", "上のテキストを選択して、キーボードでコピーしてください。")}</p>}
  </div>;
}
