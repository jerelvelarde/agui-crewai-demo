"use client";

import { useState } from "react";
import {
  CopilotChat,
  useAgent,
  useCopilotKit,
  useDefaultRenderTool,
  useInterrupt,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import type { BriefState, Stage } from "../lib/types";
import { AgentTaskCard, AgentTaskProvider, useAgentTasks } from "./agent-tasks";
import { BlurCircles } from "./blur-circles";
import {
  BriefDoc,
  CrewTimeline,
  EmptyState,
  FindingsPanel,
  ResearchProgress,
  ScorecardPanel,
  StageHeader,
} from "./panels";

/** The outline-approval card.
 *
 * Renders from a genuine AG-UI interrupt: the CrewAI flow paused inside
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
  const options: string[] = interrupt?.response_schema?.enum ??
    interrupt?.responseSchema?.enum ?? ["approved", "revise"];

  const send = (value: string) => {
    setSent(true);
    resolve(value);
  };

  // Outline arrives as "1. Title" lines under a header line.
  const lines = outline.split("\n").filter(Boolean);
  const items = lines.filter((l) => /^\s*\d+[.)]/.test(l));

  return (
    <div
      className="glass"
      style={{
        padding: "18px 20px",
        zIndex: 2,
        position: "relative",
        background: "var(--surface-container)",
        border: "2px solid var(--text-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 600,
          }}
        >
          Approval required
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border-container)" }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)" }}>
          run paused
        </span>
      </div>

      <p style={{ fontSize: 14, lineHeight: "22px", margin: "0 0 14px", maxWidth: "64ch" }}>
        {interrupt?.message ?? "Approve this outline?"}
      </p>

      {items.length ? (
        <ol
          style={{
            margin: "0 0 18px",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            maxWidth: "68ch",
          }}
        >
          {items.map((item, index) => (
            <li key={index} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--text-disabled)", flexShrink: 0 }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                {item.replace(/^\s*\d+[.)]\s*/, "")}
              </span>
            </li>
          ))}
        </ol>
      ) : outline ? (
        <pre
          className="mono"
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            margin: "0 0 18px",
            padding: 12,
            borderRadius: 4,
            background: "var(--surface-main)",
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
        placeholder="Optional — what should change?"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !sent) {
            send(note.trim() ? note.trim() : options[0]);
          }
        }}
        style={{
          width: "100%",
          maxWidth: 520,
          height: 34,
          fontSize: 13,
          padding: "0 12px",
          marginBottom: 12,
          borderRadius: 4,
          border: "1px solid var(--border-container)",
          background: "var(--surface-main)",
          fontFamily: "inherit",
          display: "block",
        }}
      />

      <div style={{ display: "flex", gap: 8, maxWidth: 520 }}>
        <button
          disabled={sent}
          onClick={() => send(note.trim() ? note.trim() : options[0])}
          style={{
            flex: 1,
            height: 34,
            fontSize: 13,
            fontWeight: 500,
            border: "none",
            borderRadius: 8,
            cursor: sent ? "default" : "pointer",
            background: "var(--text-primary)",
            color: "var(--text-invert)",
            opacity: sent ? 0.4 : 1,
            font: "inherit",
          }}
        >
          {sent ? "Sent" : note.trim() ? "Send changes" : "Approve"}
        </button>
        <button
          disabled={sent}
          onClick={() => send(options[1] ?? "revise")}
          style={{
            flex: 1,
            height: 34,
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 8,
            border: "1px solid var(--border-container)",
            cursor: sent ? "default" : "pointer",
            background: "transparent",
            opacity: sent ? 0.4 : 1,
            font: "inherit",
            color: "inherit",
          }}
        >
          Rework outline
        </button>
      </div>
    </div>
  );
}

/** Registers the wildcard tool renderer. Must live inside AgentTaskProvider so
 *  each call can register itself and let the group leader draw one card. */
function AgentTaskRenderer() {
  const store = useAgentTasks();

  useDefaultRenderTool(
    {
      render: ({ name, toolCallId, parameters, status, result }) => (
        <AgentTaskCard
            toolCallId={toolCallId}
            name={name}
            parameters={parameters}
            status={status}
          result={result}
        />
      ),
    },
    [store],
  );

  return null;
}

function WorkspaceInner({ agent }: { agent: any }) {
  const tasks = useAgentTasks();
  const { copilotkit } = useCopilotKit();
  const state = (agent?.state ?? {}) as BriefState;
  const stage: Stage = state.stage ?? "idle";

  // renderInChat: false so the approval card lands in the canvas beside the
  // outline it is about, rather than inside the chat transcript.
  const approvalCard = useInterrupt({
    renderInChat: false,
    render: ({ interrupt, resolve }: any) => (
      <ApprovalCard interrupt={interrupt} resolve={resolve} />
    ),
  });

  const findings = state.findings ?? [];
  const verdict = state.scorecard?.verdict;
  const written = (state.sections ?? []).some((section) => (section.body ?? "").trim());

  // One derived view, not stored. An earlier version tracked layout in state set
  // from several places and the columns disagreed with each other mid-run; a
  // single derivation from the run's own state removes that whole class of bug.
  const view: "idle" | "research" | "approval" | "brief" = !(
    state.target || (state.crew?.length ?? 0) > 0
  )
    ? "idle"
    : approvalCard
      ? "approval"
      : written
        ? "brief"
        : "research";

  const send = (prompt: string) => {
    void agent?.addMessage?.({ id: crypto.randomUUID(), role: "user", content: prompt });
    // Drive through copilotkit, not agent.runAgent(): the raw agent method runs
    // without the tools and renderers registered by hooks, so the run would
    // proceed with no task cards and no interrupt handling.
    void copilotkit?.runAgent?.({ agent });
  };

  const rail = (
    <div
      style={{
        flex: "0 1 330px",
        minWidth: 260,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <CrewTimeline crew={state.crew ?? []} toolsFor={tasks?.toolsFor} />
      {state.scorecard ? <ScorecardPanel card={state.scorecard} /> : null}
      <FindingsPanel findings={findings} defaultOpen={false} />
    </div>
  );

  return (
    <>
      <AgentTaskRenderer />

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
        <StageHeader stage={stage} target={state.target} axis={state.axis} />

        {view === "idle" ? <EmptyState onPick={send} /> : null}

        {/* Research: one centred column. No brief panel and no skeleton of one —
            the brief does not exist yet, so nothing stands in for it. */}
        {view === "research" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 760,
              width: "100%",
              margin: "0 auto",
            }}
          >
            <ResearchProgress findingCount={findings.length} />
            <CrewTimeline crew={state.crew ?? []} toolsFor={tasks?.toolsFor} />
            {state.scorecard ? <ScorecardPanel card={state.scorecard} /> : null}
            <FindingsPanel findings={findings} defaultOpen />
          </div>
        ) : null}

        {/* Approval and brief: the decision or the deliverable takes the primary
            column, evidence moves to the rail. */}
        {view === "approval" || view === "brief" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div
              style={{
                flex: "1 1 560px",
                minWidth: 0,
                maxWidth: 860,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {approvalCard}
              {view === "brief" ? (
                <BriefDoc
                  sections={state.sections ?? []}
                  target={state.target}
                  verdict={verdict}
                />
              ) : null}
            </div>
            {rail}
          </div>
        ) : null}
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
          height: "calc(100vh - 16px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* flex:1 + min-width:0 are load-bearing. Without them this flex child
            shrinks to min-content and the chat wraps one character per line. */}
        <div
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <CopilotChat
            // Object slots merge over the bound props. Nobody copies an agent's
            // reply in a demo, and a floating copy icon after every message was
            // the main source of visual noise in the rail.
            messageView={{ assistantMessage: { toolbarVisible: false } }}
            labels={{
              welcomeMessageText:
                "Ask me for a competitive brief — try “brief me on Pulsegrid’s pricing vs ours”.",
              chatInputPlaceholder: "Ask for a brief…",
            }}
          />
        </div>
      </div>
    </>
  );
}

export function Workspace() {
  const { agent } = useAgent({
    agentId: "brief",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

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
      <AgentTaskProvider agent={agent as any}>
        <WorkspaceInner agent={agent} />
      </AgentTaskProvider>
    </div>
  );
}
