import type { CSSProperties } from "react";

export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    back: <path d="M19 12H5m5-5-5 5 5 5" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V4H4v11h4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6" /></>,
    new: <><path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6" /><path d="m11 14 2.5-.5L21 6l-3-3-7.5 7.5L10 14z" /></>,
    split: <><path d="M4 12h7c4 0 4-7 7-7h2m-5-2h5v5M11 12c4 0 4 7 7 7h2m-5 2h5v-5" /></>,
    brain: <><path d="M12 4v16M12 5C8 1 5 4 6 7c-5 1-4 6-1 7-2 4 3 8 7 5M12 5c4-4 7-1 6 2 5 1 4 6 1 7 2 4-3 8-7 5" /></>,
    send: <><path d="m3 11 17-7-6 17-3-8-8-2Z" /><path d="m11 13 9-9" /></>,
    codex: <><path d="M9 3.5 14 3l2.8 3 3.3 2-.1 5-2.3 3.7-4.8 3.2-4.7-1.7-3.8-2.7L3 10.7l2.7-4.4L9 3.5Z" /><path d="m9 9 5-1 2.5 4-3 4-5-1-1-3 3-2 3 2-1.5 2" /></>,
    bug: <><rect x="7" y="8" width="10" height="12" rx="5" /><path d="M9 8V5h6v3m-8 3H3m14 0h4M7 15H3m14 0h4M8 19l-3 3m11-3 3 3M9 5 7 2m8 3 2-3M12 9v10" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" /></>,
    archive: <><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" /></>,
    magic: <><path d="m4 20 12-12 4 4L8 24M14 4V1m-3 3H8m10 1 3-3M4 12V8M2 10h4" /></>,
    diff: <><path d="M7 3v18m10-18v18M4 7h6m4 10h6m-3-3v6" /></>,
    play: <path d="m7 4 13 8-13 8z" />,
    git: <><circle cx="7" cy="5" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="7" cy="19" r="2" /><path d="M7 7v10m0-5c7 0 10-1 10-3" /></>,
    merge: <><circle cx="7" cy="5" r="2" /><circle cx="17" cy="19" r="2" /><path d="M7 7c0 7 10 4 10 10M17 3v11m-3-8 3-3 3 3" /></>,
    paint: <><path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-4-4-6-9-6Z" /><path d="M7 8h.01m5-2h.01m5 2h.01M6 13h.01" /></>,
    lab: <path d="M9 3h6m-5 0v6L4 19c-.6 1 .1 2 1 2h14c1 0 1.6-1 1-2L14 9V3M7 15h10" />,
    time: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    setup: <><path d="m10 3-1 3-3 1-3 3 2 3-1 3 3 3 3-1 3 2 3-2 1-3 3-2-2-3 1-3-3-2-3 1-3-3Z" /><circle cx="12" cy="12" r="3" /></>,
    folder: <path d="M3 6h7l2 3h9v11H3V6Z" />,
    apps: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    fast: <path d="m14 2-9 12h7l-2 8 9-13h-7z" />,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 1h4" /></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 6.5h.01m3 0h.01" /></>,
    zoom: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5M7 10.5h7m-3.5-3.5v7" /></>,
    shuffle: <><path d="m3 5 4 0 10 14h4m-4-4 4 4-4 3M3 19h4L17 5h4m-4-3 4 3-4 4" /></>,
    external: <><path d="M13 4h7v7m0-7L9 15M9 4H4v16h16v-5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" /></>,
    logout: <><path d="M9 3H4v18h5m-1-9h13m-4-4 4 4-4 4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">{paths[name] ?? <circle cx="12" cy="12" r="7" />}</svg>;
}

export function BrandMark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>; }
