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

export interface BriefState {
  target?: string | null;
  axis?: string;
  stage?: Stage;
  crew?: AgentActivity[];
  findings?: Finding[];
  outline?: string[];
  sections?: Section[];
  scorecard?: Scorecard | null;
  outline_decision?: string | null;
}
