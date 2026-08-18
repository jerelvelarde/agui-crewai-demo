/** Mirrors BriefState in agent/cadence/state.py. */

export type Stage =
  | "idle"
  | "intake"
  | "research"
  | "awaiting_approval"
  | "writing"
  | "done";

export interface Finding {
  source: string;
  claim: string;
  competitor: string;
}

export interface Section {
  key: string;
  title: string;
  status: "pending" | "writing" | "done";
  body: string;
}

export interface AgentActivity {
  agent: string;
  role: string;
  status: "idle" | "working" | "done";
  detail: string;
}

export interface Scorecard {
  competitor: string;
  pricing_pressure: number;
  governance: number;
  time_to_value: number;
  verdict: string;
}

export type VisualKind = "tier-ladder" | "gate-ladder";

/** One plotted row. `value` is null for a tier with no public price, so the
 *  renderer can show `display` off-scale instead of a bar of length zero. */
export interface VisualPoint {
  label: string;
  value?: number | null;
  display: string;
  note?: string;
  ours?: boolean;
}

/** The hero comparison. The Illustrator writes `title` and `takeaway`; every
 *  figure in `points` is built from the corpus server-side. */
export interface BriefVisual {
  kind: VisualKind;
  title: string;
  takeaway?: string;
  caption?: string;
  points?: VisualPoint[];
}

export interface BriefState {
  target?: string | null;
  axis?: string;
  stage?: Stage;
  crew?: AgentActivity[];
  findings?: Finding[];
  outline?: string[];
  sections?: Section[];
  scorecard?: Scorecard | null;
  visual?: BriefVisual | null;
  outline_decision?: string | null;
}
