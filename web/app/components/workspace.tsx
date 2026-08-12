"use client";

import { useState } from "react";
import { useAgent, useInterrupt, UseAgentUpdate, CopilotChat } from "@copilotkit/react-core/v2";
import type { BriefState, Stage } from "../lib/types";
import { BlurCircles } from "./blur-circles";
import { BriefDoc, CrewTimeline, FindingsPanel, ScorecardPanel, SectionTitle, StageBar } from "./panels";

/** The outline-approval card.
 *
 * This renders from a genuine AG-UI interrupt: the CrewAI flow paused inside
 * `@human_feedback`, the bridge ended the run with `RUN_FINISHED` carrying an
 * interrupt outcome, and `resolve()` submits a resume that restarts the flow
 * from the pause. The resume payload becomes the feedback string CrewAI
 * collapses into one of `response_schema.enum`.
 */
function ApprovalCard({
  interrupt,
  resolve,
}: {
  interrupt: any;
  resolve: (value: string) => void;
}) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const outline: string = interrupt?.metadata?.crewai?.output ?? "";
  const options: string[] = interrupt?.response_schema?.enum ?? ["approved", "revise"];

  const send = (value: string) => {
    setSent(true);
    resolve(value);
  };

  return (
    <div
      className="glass"
      style={{ padding: 16, zIndex: 1, position: "relative", background: "var(--white-70)" }}
    >
      <SectionTitle title="Approval required" trailing="run paused" />
      <p style={{ fontSize: 14, lineHeight: "22px", margin: "0 4px 12px" }}>
        {interrupt?.message ?? "Approve this outline?"}
      </p>
      {outline ? (
        <pre
          className="mono"
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            margin: "0 0 16px",
            padding: 12,
            borderRadius: 4,
            background: "var(--surface-container)",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          }}
        >
          {outline}
        </pre>
      ) : null}

      <input
        value={note}
        disabled={sent}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional: what should change?"
        style={{
          width: "100%",
          height: 32,
          fontSize: 14,
          padding: "0 12px",
          marginBottom: 12,
          borderRadius: 4,
          border: "1px solid var(--border-container)",
          background: "var(--surface-container)",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={sent}
          onClick={() => send(note.trim() ? note.trim() : options[0])}
          style={{
            flex: 1,
            height: 32,
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            borderRadius: 8,
            cursor: sent ? "default" : "pointer",
            background: "var(--text-primary)",
            color: "var(--text-invert)",
            opacity: sent ? 0.5 : 1,
          }}
        >
          {note.trim() ? "Send changes" : "Approve"}
        </button>
        <button
          disabled={sent}
          onClick={() => send(options[1] ?? "revise")}
          style={{
            flex: 1,
            height: 32,
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            borderRadius: 8,
            cursor: sent ? "default" : "pointer",
            background: "var(--surface-container)",
            opacity: sent ? 0.5 : 1,
          }}
        >
          Rework outline
        </button>
      </div>
    </div>
  );
}

export function Workspace() {
  const { agent } = useAgent({
    agentId: "brief",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const state = (agent.state ?? {}) as BriefState;
  const stage: Stage = state.stage ?? "idle";

  // renderInChat: false so the approval card lands in the canvas beside the
  // outline it is about, rather than inside the chat transcript.
  const approvalCard = useInterrupt({
    renderInChat: false,
    render: ({ interrupt, resolve }: any) => (
      <ApprovalCard interrupt={interrupt} resolve={resolve} />
    ),
  });

  const hasWork = Boolean(state.target) || (state.crew?.length ?? 0) > 0;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
        display: "flex",
        gap: 8,
        padding: 8,
      }}
    >
      <BlurCircles />

      {/* Canvas */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflowY: "auto",
          maxHeight: "calc(100vh - 16px)",
        }}
      >
        <StageBar stage={stage} target={state.target} axis={state.axis} />

        {approvalCard}

        {hasWork ? (
          <>
            <CrewTimeline crew={state.crew ?? []} />
            {state.scorecard ? <ScorecardPanel card={state.scorecard} /> : null}
            <FindingsPanel findings={state.findings ?? []} />
            <BriefDoc sections={state.sections ?? []} />
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Copilot */}
      <div
        className="glass"
        style={{
          width: 420,
          flexShrink: 0,
          zIndex: 1,
          position: "relative",
          overflow: "hidden",
          maxHeight: "calc(100vh - 16px)",
          display: "flex",
        }}
      >
        <CopilotChat
          labels={{
            welcomeMessageText:
              "Ask me for a competitive brief — try “brief me on Pulsegrid’s pricing vs ours”.",
            chatInputPlaceholder: "Ask for a brief…",
          }}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  const prompts = [
    "Brief me on Pulsegrid's pricing vs ours",
    "How does Beacon Analytics compare on governance?",
    "Where is Telemetryx exposed?",
  ];

  return (
    <div className="glass" style={{ padding: 24, zIndex: 1, position: "relative" }}>
      <SectionTitle title="What this demo shows" />
      <p style={{ fontSize: 14, lineHeight: "22px", margin: "0 4px 16px" }}>
        A three-agent CrewAI crew researches a competitor, an analyst scores them, the
        run pauses for your approval, then a writer fills in the brief section by
        section. Every step streams over AG-UI.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {prompts.map((prompt) => (
          <div
            key={prompt}
            className="mono"
            style={{
              fontSize: 12,
              padding: "8px 12px",
              borderRadius: 4,
              background: "var(--white-50)",
              color: "var(--text-secondary)",
            }}
          >
            {prompt}
          </div>
        ))}
      </div>
    </div>
  );
}
