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
      style={{
        padding: "16px 18px",
        margin: "6px 0",
        borderRadius: 10,
        background: "var(--surface-container)",
        // The agent is the one asking, so the card is outlined in the agent's
        // own voice rather than in a loud neutral border.
        border: "1px solid var(--agent)",
        boxShadow: "0 0 0 3px rgba(190, 194, 255, 0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 600,
          }}
        >
          Approval required
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border-container)" }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)" }}>
          run paused
        </span>
      </div>

      <p style={{ fontSize: 16, lineHeight: "26px", margin: "0 0 14px", maxWidth: "56ch" }}>
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
          }}
        >
          {items.map((item, index) => (
            <li key={index} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--text-disabled)", flexShrink: 0 }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.5 }}>
                {item.replace(/^\s*\d+[.)]\s*/, "")}
              </span>
            </li>
          ))}
        </ol>
      ) : outline ? (
        <pre
          className="mono"
          style={{
            fontSize: 14,
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
          height: 36,
          fontSize: 15,
          padding: "0 12px",
          marginBottom: 12,
          borderRadius: 4,
          border: "1px solid var(--border-container)",
          background: "var(--surface-main)",
          fontFamily: "inherit",
          display: "block",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={sent}
          onClick={() => send(note.trim() ? note.trim() : options[0])}
          style={{
            flex: 1,
            height: 36,
            fontSize: 15,
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
            height: 36,
            fontSize: 15,
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

  // Human-in-the-loop belongs in the conversation. The pause is the agent asking
  // the user a question, so it renders in the transcript where the question was
  // asked — not as a separate panel the user has to look away to find.
  useInterrupt({
    render: ({ interrupt, resolve }: any) => (
      <ApprovalCard interrupt={interrupt} resolve={resolve} />
    ),
  });

  const findings = state.findings ?? [];
  const verdict = state.scorecard?.verdict;
  const written = (state.sections ?? []).some((section) => (section.body ?? "").trim());
  const started = Boolean(state.target) || (state.crew?.length ?? 0) > 0;

  // The canvas opens when there is an insight to present, not when the request
  // starts. Until the Analyst has scored something there is nothing to put in it,
  // and an empty panel full of skeletons reads as a layout that failed to load.
  // Progress during that window lives in the chat, where it is real: reasoning,
  // and a card per agent being tasked.
  const canvasOpen = Boolean(state.scorecard) || written;

  const send = (prompt: string) => {
    void agent?.addMessage?.({ id: crypto.randomUUID(), role: "user", content: prompt });
    // Drive through copilotkit, not agent.runAgent(): the raw agent method runs
    // without the tools and renderers registered by hooks.
    void copilotkit?.runAgent?.({ agent });
  };

  const rail = (
    <div
      style={{
        flex: "0 1 380px",
        minWidth: 300,
        display: "flex",
        flexDirection: "column",
        gap: 10,
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

      {canvasOpen ? (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            maxHeight: "calc(100vh - 20px)",
          }}
        >
          <StageHeader stage={stage} target={state.target} axis={state.axis} />

          {written ? (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 620px", minWidth: 0, maxWidth: 1000 }}>
                <BriefDoc
                  sections={state.sections ?? []}
                  target={state.target}
                  verdict={verdict}
                />
              </div>
              {rail}
            </div>
          ) : (
            /* Analysis is in, the brief is not written yet: present the insight
               itself rather than a placeholder for the document. */
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 860 }}>
              {state.scorecard ? <ScorecardPanel card={state.scorecard} /> : null}
              <CrewTimeline crew={state.crew ?? []} toolsFor={tasks?.toolsFor} />
              <FindingsPanel findings={findings} defaultOpen />
            </div>
          )}
        </div>
      ) : null}

      {/* One chat, two boxes. The component never unmounts across the layout
          change — only the box around it changes width — so the conversation and
          its scroll position survive the canvas opening. */}
      <div
        style={{
          width: canvasOpen ? 460 : "min(880px, 100%)",
          margin: canvasOpen ? undefined : "0 auto",
          flexShrink: 0,
          zIndex: 1,
          position: "relative",
          height: "calc(100vh - 20px)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          transition: "width 240ms ease",
        }}
      >
        {!canvasOpen ? (
          <>
            <StageHeader stage={stage} target={state.target} axis={state.axis} />
            {!started ? <EmptyState onPick={send} /> : null}
          </>
        ) : null}

        <div
          className="glass"
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <CopilotChat
            // Object slots merge over the bound props. Nobody copies an agent's
            // reply in a demo, and a floating copy icon after every message was
            // the main source of visual noise in the rail.
            messageView={{ assistantMessage: { toolbarVisible: false } }}
            labels={{
              welcomeMessageText:
                "Ask me for a competitive brief \u2014 try \u201cbrief me on Pulsegrid\u2019s pricing vs ours\u201d.",
              chatInputPlaceholder: "Ask for a brief\u2026",
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
        gap: 10,
        padding: 10,
      }}
    >
      <BlurCircles />
      <AgentTaskProvider agent={agent as any}>
        <WorkspaceInner agent={agent} />
      </AgentTaskProvider>
    </div>
  );
}
