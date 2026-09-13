import svg0 from "../assets/micro-keycaps/FAST.svg?raw";
import svg1 from "../assets/micro-keycaps/APPR.svg?raw";
import svg2 from "../assets/micro-keycaps/REJ.svg?raw";
import svg3 from "../assets/micro-keycaps/SPLIT.svg?raw";
import svg4 from "../assets/micro-keycaps/MIC.svg?raw";
import svg5 from "../assets/micro-keycaps/MIC1.svg?raw";
import svg6 from "../assets/micro-keycaps/CODEX.svg?raw";
import svg7 from "../assets/micro-keycaps/BUG.svg?raw";
import svg8 from "../assets/micro-keycaps/OAI.svg?raw";
import svg9 from "../assets/micro-keycaps/TERM.svg?raw";
import svg10 from "../assets/micro-keycaps/DWN.svg?raw";
import svg11 from "../assets/micro-keycaps/DEL.svg?raw";
import svg12 from "../assets/micro-keycaps/NEW.svg?raw";
import svg13 from "../assets/micro-keycaps/NAV.svg?raw";
import svg14 from "../assets/micro-keycaps/MAGIC.svg?raw";
import svg15 from "../assets/micro-keycaps/DIFF.svg?raw";
import svg16 from "../assets/micro-keycaps/PLAY.svg?raw";
import svg17 from "../assets/micro-keycaps/GIT.svg?raw";
import svg18 from "../assets/micro-keycaps/BRCH.svg?raw";
import svg19 from "../assets/micro-keycaps/BRANCH.svg?raw";
import svg20 from "../assets/micro-keycaps/MRG.svg?raw";
import svg21 from "../assets/micro-keycaps/PR.svg?raw";
import svg22 from "../assets/micro-keycaps/PAINT.svg?raw";
import svg23 from "../assets/micro-keycaps/LAB.svg?raw";
import svg24 from "../assets/micro-keycaps/PARTY.svg?raw";
import svg25 from "../assets/micro-keycaps/TIME.svg?raw";
import svg26 from "../assets/micro-keycaps/MIND-plus.svg?raw";
import svg27 from "../assets/micro-keycaps/MIND-minus.svg?raw";
import svg28 from "../assets/micro-keycaps/SETUP.svg?raw";
import svg29 from "../assets/micro-keycaps/FOLD.svg?raw";
import svg30 from "../assets/micro-keycaps/UPL.svg?raw";
import svg31 from "../assets/micro-keycaps/APPS.svg?raw";
import { Icon } from "./icon";

const icons: Record<string, string> = {
  "FAST": svg0,
  "APPR": svg1,
  "REJ": svg2,
  "SPLIT": svg3,
  "MIC": svg4,
  "MIC1": svg5,
  "CODEX": svg6,
  "BUG": svg7,
  "OAI": svg8,
  "TERM": svg9,
  "DWN": svg10,
  "DEL": svg11,
  "NEW": svg12,
  "NAV": svg13,
  "MAGIC": svg14,
  "DIFF": svg15,
  "PLAY": svg16,
  "GIT": svg17,
  "BRCH": svg18,
  "BRANCH": svg19,
  "MRG": svg20,
  "PR": svg21,
  "PAINT": svg22,
  "LAB": svg23,
  "PARTY": svg24,
  "TIME": svg25,
  "MIND+": svg26,
  "MIND-": svg27,
  "SETUP": svg28,
  "FOLD": svg29,
  "UPL": svg30,
  "APPS": svg31
};

const aliases: Record<string, string> = { FORK: "SPLIT", DRAFT: "BRCH", "MIND−": "MIND-", APPROVE: "APPR", YES: "APPR", DECLINE: "REJ", NO: "REJ", TERMINAL: "TERM" };

export function Keycap({ id }: { id: string }) {
  if (id === "YOLO" || id === "YEET") return <span className="micro-keycap-legend">:{id.toLowerCase()}:</span>;
  if (id.startsWith("EMPT") || id === "EMPTY" || id === "BLANK") return null;
  const svg = icons[aliases[id] ?? id];
  // Only bundled SVG files enter this markup; user-provided strings never do.
  if (svg) return <span className="micro-keycap-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
  if (id === "SEND" || id === "BROWSER") return <Icon name={id === "SEND" ? "send" : "browser"} size={20} />;
  return <span className="keycap-text">{id}</span>;
}
