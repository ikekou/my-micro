import { useState, type ReactNode } from "react";
import { actionLabel, type Locale, type MicroSettings, type MicroSlot, type PublicAction } from "@my-micro/shared";
import { useLocale, words } from "../lib/i18n";
import { Icon } from "./icon";

const agentPositions = [[1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [2, 4]];
const actionPositions: Record<string, [number, number]> = { ACT06: [3, 1], ACT07: [3, 2], ACT08: [3, 3], ACT09: [3, 4], ACT10: [4, 2], ACT11: [4, 3], ACT10_ACT11: [4, 2], ACT12: [4, 4] };

export function optionLabel(value: string, locale: Locale): string {
  const labels: Record<string, [string, string]> = {
    recent: ["Most recent chats", "最近のチャット"], pinned: ["Pinned chats", "ピン留めしたチャット"], priority: ["Priority chats", "優先度の高いチャット"], custom: ["Custom assignments", "カスタム割り当て"],
    "conversation-scroll": ["Conversation scrolling", "会話のスクロール"], "composer-navigation": ["Composer navigation", "入力欄の操作"], reasoning: ["Reasoning effort", "推論の強度"], "push-to-talk": ["Push to talk", "プッシュトゥトーク"], realtime: ["Voice chat", "音声チャット"],
    never: ["Never", "なし"], off: ["Off", "オフ"], "30-seconds": ["30 seconds", "30秒"], "1-minute": ["1 minute", "1分"], "3-minutes": ["3 minutes", "3分"], "5-minutes": ["5 minutes", "5分"], "10-minutes": ["10 minutes", "10分"], "15-minutes": ["15 minutes", "15分"], "30-minutes": ["30 minutes", "30分"], "1-hour": ["1 hour", "1時間"],
  };
  return labels[value]?.[locale === "ja" ? 1 : 0] ?? value;
}

function Keycap({ id }: { id: string }) {
  if (id.startsWith("MIND")) return <span className="mind-key"><Icon name="brain" size={23} /><small>{id.endsWith("+") ? "+" : "−"}</small></span>;
  const names: Record<string, string> = { MIC: "mic", MIC1: "mic", NEW: "new", SPLIT: "split", CODEX: "codex", OAI: "codex", SEND: "send", FAST: "fast", APPR: "check", APPROVE: "check", YES: "check", REJ: "close", DECLINE: "close", NO: "close", TERM: "terminal", TERMINAL: "terminal", BROWSER: "browser", NAV: "browser", BUG: "bug", DWN: "download", UPL: "upload", DEL: "archive", MAGIC: "magic", DIFF: "diff", PLAY: "play", GIT: "git", BRCH: "git", BRANCH: "git", MRG: "merge", PR: "git", PAINT: "paint", LAB: "lab", PARTY: "apps", TIME: "time", SETUP: "setup", FOLD: "folder", APPS: "apps" };
  if (id.startsWith("EMPT") || id === "EMPTY" || id === "BLANK") return null;
  return names[id] ? <Icon name={names[id]} size={23} /> : <span className="keycap-text">{id}</span>;
}

export function MicroBoard({ settings, interactive = false, selected, onSelect }: { settings: MicroSettings; interactive?: boolean; selected?: string; onSelect?: (id: string) => void }) {
  const locale = useLocale();
  function control(id: string, label: string, content: ReactNode, className: string, row: number, column: number, wide = false) {
    const style = { gridRow: row, gridColumn: wide ? `${column} / span 2` : column };
    return interactive
      ? <button type="button" key={id} className={`${className} ${selected === id ? "selected" : ""}`} style={style} aria-label={label} aria-pressed={selected === id} onClick={() => onSelect?.(id)}>{content}</button>
      : <span key={id} className={className} style={style}>{content}</span>;
  }
  const slots = settings.layout.slots.filter((slot) => actionPositions[slot.slotId]);
  return <div className="micro-board" role={interactive ? "group" : undefined} aria-label={interactive ? words(locale, "Codex Micro controls", "Codex Microの操作部") : undefined} aria-hidden={!interactive || undefined}>
    {control("encoder", words(locale, "Dial — show assignments", "ノブの割り当てを見る"), <span className="dial-cap" />, "dial-control", 1, 1)}
    {agentPositions.map(([row, column], index) => control(`AG0${index}`, words(locale, `Agent key ${index + 1}`, `エージェントキー ${index + 1}`), <i className="agent-dot" />, "micro-key agent-key", row, column))}
    {control("stick", words(locale, "Analog stick — show assignments", "スティックの割り当てを見る"), <span className="stick-cap" />, "stick-control", 1, 4)}
    {slots.map((slot) => { const [row, column] = actionPositions[slot.slotId]; return control(slot.slotId, `${slot.keycapId}: ${actionLabel(slot.action, locale)}`, <Keycap id={slot.keycapId} />, "micro-key command-key", row, column, slot.slotId === "ACT10_ACT11"); })}
    <span className="connection-control" style={{ gridRow: 4, gridColumn: 1 }} aria-hidden="true"><span className="connection-dots"><i /><i /><i /></span><span className="connection-cap" /></span>
  </div>;
}

function ActionValue({ action }: { action: PublicAction }) {
  const locale = useLocale();
  return <span className={action.kind === "unsupported" || action.kind === "none" ? "muted" : ""}>{actionLabel(action, locale)}{action.kind === "skill" && <small className="action-kind">{words(locale, "Skill", "スキル")}</small>}</span>;
}

function DirectionAssignments({ settings, kind }: { settings: MicroSettings; kind: "encoder" | "stick" }) {
  const locale = useLocale();
  const entries: [string, PublicAction][] = kind === "encoder" ? [
    [words(locale, "Turn left", "左に回す"), settings.layout.encoder.counterclockwise], [words(locale, "Turn right", "右に回す"), settings.layout.encoder.clockwise], [words(locale, "Press", "押す"), settings.layout.encoder.press], [words(locale, "Press and hold", "長押し"), settings.layout.encoder.longPress],
  ] : [
    [words(locale, "Up", "上"), settings.layout.analogStick.up], [words(locale, "Right", "右"), settings.layout.analogStick.right], [words(locale, "Down", "下"), settings.layout.analogStick.down], [words(locale, "Left", "左"), settings.layout.analogStick.left],
  ];
  return <dl className="control-assignments">{entries.map(([label, action]) => <div key={label}><dt>{label}</dt><dd><ActionValue action={action} /></dd></div>)}</dl>;
}

export function MicroInspector({ settings }: { settings: MicroSettings }) {
  const locale = useLocale();
  const [selected, setSelected] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const slot = settings.layout.slots.find((item) => item.slotId === selected);
  return <>
    <section className={`device-panel ${expanded ? "expanded" : ""}`} aria-label={words(locale, "Layout", "レイアウト")}>
      <div className="device-toolbar"><span>{words(locale, "Layout", "レイアウト")}</span><button type="button" className="text-button" onClick={() => setExpanded(!expanded)} aria-pressed={expanded}><Icon name="zoom" size={16} />{expanded ? words(locale, "Smaller", "縮小") : words(locale, "Enlarge", "拡大")}</button></div>
      <div className="device-stage"><MicroBoard settings={settings} interactive selected={selected} onSelect={setSelected} /></div>
      <div className="selected-control" aria-live="polite">
        {!selected && <div className="selection-hint"><span className="hint-dot" />{words(locale, "Select a key, dial, or stick to see what it does.", "キー・ノブ・スティックを選ぶと、割り当てが見られます。")}</div>}
        {slot && <div className="key-explanation"><span className="eyebrow">{slot.keycapId}</span><p><ActionValue action={slot.action} /></p>{slot.action.kind === "text" && <p className="muted small">{words(locale, "The assigned text is private and was not shared.", "割り当てた定型文の内容は共有されていません。")}</p>}</div>}
        {selected.startsWith("AG") && <div className="key-explanation"><span className="eyebrow">{words(locale, `Agent key ${Number(selected.slice(2)) + 1}`, `エージェントキー ${Number(selected.slice(2)) + 1}`)}</span><p>{optionLabel(settings.options.agentSource, locale)}</p><p className="muted small">{settings.options.agentSource === "custom" ? words(locale, "Individual assignments are not included in this post.", "キーごとの個別割り当てはこの投稿に含まれていません。") : words(locale, "Chat names and live status lights are not shared.", "会話名と、その時々の状態を示す発光は共有されていません。")}</p></div>}
        {selected === "encoder" && <div><h3>{words(locale, "Dial", "ノブ")} <span className="muted small">{optionLabel(settings.layout.encoder.mode, locale)}</span></h3><DirectionAssignments settings={settings} kind="encoder" /></div>}
        {selected === "stick" && <div><h3>{words(locale, "Analog stick", "スティック")}</h3><DirectionAssignments settings={settings} kind="stick" /></div>}
      </div>
    </section>
    <details className="all-assignments"><summary>{words(locale, "See all assignments", "割り当てを一覧で見る")}<span>+</span></summary><div className="all-assignments-content"><h3>{words(locale, "Agent keys", "エージェントキー")}</h3><dl className="control-assignments">{agentPositions.map((_, index) => <div key={index}><dt>{words(locale, `Agent key ${index + 1}`, `エージェントキー ${index + 1}`)}</dt><dd>{optionLabel(settings.options.agentSource, locale)}</dd></div>)}</dl>{settings.options.agentSource === "custom" && <p className="small muted">{words(locale, "Individual assignments are not included in this post.", "キーごとの個別割り当てはこの投稿に含まれていません。")}</p>}<h3>{words(locale, "Command keys", "コマンドキー")}</h3><dl className="control-assignments">{settings.layout.slots.map((item: MicroSlot) => <div key={item.slotId}><dt>{item.keycapId}</dt><dd><ActionValue action={item.action} /></dd></div>)}</dl><h3>{words(locale, "Dial", "ノブ")}</h3><DirectionAssignments settings={settings} kind="encoder" /><h3>{words(locale, "Analog stick", "スティック")}</h3><DirectionAssignments settings={settings} kind="stick" /></div></details>
  </>;
}

export function MicroOptions({ settings }: { settings: MicroSettings }) {
  const locale = useLocale();
  const onOff = (value: boolean) => value ? words(locale, "On", "オン") : words(locale, "Off", "オフ");
  const items = [
    [words(locale, "Agent keys", "エージェントキー"), words(locale, "What the six agent keys follow or trigger", "6つのエージェントキーがフォロー・トリガーする対象"), optionLabel(settings.options.agentSource, locale)],
    [words(locale, "Dial", "ノブ"), words(locale, "What turning the dial controls", "ノブを回して操作する対象"), optionLabel(settings.layout.encoder.mode, locale)],
    [words(locale, "Microphone key", "マイクキー"), words(locale, "How the microphone key behaves", "マイクキーの動作"), optionLabel(settings.options.voiceButtonMode, locale)],
    [words(locale, "Separate microphone keys", "マイクキーを個別に使用"), words(locale, "Assign the two switches under the wide key separately", "幅広キーの下の2つのスイッチを個別に割り当てる"), onOff(settings.options.separateMicrophoneKeys)],
    [words(locale, "Focus with a single tap", "1回のタップでCodexにフォーカス"), words(locale, "Focus Codex with one tap of an agent key", "エージェントキーを1回タップしてCodexを表示する"), onOff(settings.options.singleTapAgentKeys)],
    [words(locale, "Brightness", "明るさ"), words(locale, "Saved lighting brightness", "保存された照明の明るさ"), `${settings.options.lightingBrightness}%`],
    [words(locale, "Auto-dim", "自動消灯"), words(locale, "Turn off the lights after inactivity", "操作しないときに照明を消すまでの時間"), optionLabel(settings.options.lightingAutoOff, locale)],
  ];
  return <section className="options-section"><h2>{words(locale, "Options", "オプション")}</h2><dl className="settings-list">{items.map(([title, description, value]) => <div key={title}><dt><span>{title}</span><small>{description}</small></dt><dd>{value}</dd></div>)}</dl>{settings.unsupported.length > 0 && <div className="notice"><strong>{words(locale, "Some settings are not supported yet", "まだ表示できない設定があります")}</strong><p>{words(locale, "These fields were left out. No values have been guessed.", "次の項目は未対応のため、値を推測せず省略しています。")}</p><ul>{settings.unsupported.map((entry, index) => <li key={`${entry.field}-${index}`}><code>{entry.field}</code></li>)}</ul></div>}</section>;
}
