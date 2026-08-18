"use client";

import { useState } from "react";
import {
  CopilotChat,
  useAgent,
  useCopilotKit,
  useDefaultRenderTool,
  useHumanInTheLoop,
  useInterrupt,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import type { BriefState, Stage } from "../lib/types";
import { AgentTaskCard, AgentTaskProvider, useAgentTasks } from "./agent-tasks";
import { BlurCircles } from "./blur-circles";
import {
  BrandBar,
  BriefDoc,
  BriefPipelineCard,
  CrewTimeline,
  FindingsPanel,
  Hero,
  HeroSuggestions,
  ScorecardPanel,
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
  // Two gates now share this card. The outcome names are the only thing that
  // distinguishes them, so the heading follows those rather than the stage —
  // the card must stay correct even if it renders after state has moved on.
  const isPlan = options.some((o) => o.startsWith("plan"));
  const heading = isPlan ? "Research plan" : "Approval required";

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
          {heading}
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
          {isPlan ? "Change scope" : "Rework outline"}
        </button>
      </div>
    </div>
  );
}

/** The research plan gate.
 *
 * Reads the plan off shared state rather than tool arguments: the backend has
 * already emitted it, so the card stays rich without shipping a payload twice,
 * and the MCP row can be flagged properly instead of as text in a string.
 */
function PlanGateCard({
  done,
  onApprove,
  onRevise,
}: {
  done: boolean;
  onApprove: () => void;
  onRevise: (note: string) => void;
}) {
  const { agent } = useAgent({ agentId: "brief", updates: [UseAgentUpdate.OnStateChanged] });
  const plan = ((agent?.state ?? {}) as BriefState).plan;
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  if (!plan) return null;

  const answered = done || sent;
  const send = (fn: () => void) => {
    if (answered) return;
    setSent(true);
    fn();
  };

  return (
    <div
      style={{
        padding: "16px 18px",
        margin: "6px 0",
        borderRadius: 10,
        background: "var(--surface-container)",
        border: `1px solid ${answered ? "var(--border-default)" : "var(--agent)"}`,
        opacity: answered ? 0.75 : 1,
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
          Research plan
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border-container)" }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)" }}>
          {answered ? "answered" : "before any work"}
        </span>
      </div>

      <p style={{ fontSize: 16, lineHeight: "26px", margin: "0 0 14px", maxWidth: "56ch" }}>
        Here is what I am about to read on {plan.target}. Approve it, or tell me what to change.
      </p>

      <ol style={{ margin: "0 0 16px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {(plan.items ?? []).map((item, index) => (
          <li key={`${item.label}-${index}`} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)", flexShrink: 0 }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 15 }}>
              {item.label}
              {item.detail ? (
                <span style={{ color: "var(--text-secondary)" }}> — {item.detail}</span>
              ) : null}
            </span>
            {item.via === "mcp" ? (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  flexShrink: 0,
                }}
              >
                MCP
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {answered ? null : (
        <>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional — what should change?"
            style={{
              width: "100%",
              padding: "9px 11px",
              marginBottom: 10,
              borderRadius: 8,
              border: "1px solid var(--border-container)",
              background: "transparent",
              color: "var(--text-primary)",
              font: "inherit",
              fontSize: 14,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => send(onApprove)}
              style={{
                flex: 1,
                padding: "9px 14px",
                borderRadius: 8,
                border: "none",
                background: "var(--text-primary)",
                color: "var(--text-invert)",
                font: "inherit",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Approve
            </button>
            <button
              onClick={() => send(() => onRevise(note))}
              style={{
                flex: 1,
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid var(--border-container)",
                background: "transparent",
                color: "var(--text-primary)",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Change scope
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Reads its own state so the tool renderer below can stay a stable closure —
 *  re-registering the renderer on every state change would remount the cards. */
function InlinePipeline() {
  const { agent } = useAgent({
    agentId: "brief",
    updates: [UseAgentUpdate.OnStateChanged],
  });
  const state = (agent?.state ?? {}) as BriefState;

  return (
    <BriefPipelineCard
      stage={state.stage ?? "intake"}
      target={state.target}
      axis={state.axis}
    />
  );
}

/** Registers the wildcard tool renderer. Must live inside AgentTaskProvider so
 *  each call can register itself and let the group leader draw one card. */
function AgentTaskRenderer() {
  const store = useAgentTasks();

  useDefaultRenderTool(
    {
      render: ({ name, toolCallId, parameters, status, result }) =>
        // Naming the target is the pipeline's first step, so this one call
        // renders as the pipeline itself rather than as another log row.
        name === "set_brief_target" ? (
          <InlinePipeline />
        ) : (
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
  // The plan gate is a frontend tool rather than a flow interrupt, on purpose:
  // a crewai resume emits no STEP_STARTED or TOOL_CALL_START, so gating with an
  // interrupt in front of the research silently cost the tool counts, the MCP
  // badge and the in-chat task cards. Answering a tool starts a fresh run
  // instead, where attribution streams normally.
  useHumanInTheLoop({
    name: "approve_research_plan",
    description: "Show the reviewer the research plan and wait for a decision.",
    // No parameters: the card reads the plan off shared state, which the
    // backend has already emitted.
    render: ({ status, respond }: any) => (
      <PlanGateCard
        done={status === "complete"}
        onApprove={() => respond?.("approved")}
        onRevise={(note: string) =>
          respond?.(note.trim() ? `revise: ${note.trim()}` : "revise")
        }
      />
    ),
  });

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

  // Idle is its own screen, not a stripped-down version of the working one: a
  // hero and a composer, no stage rail with five inert steps and no panel
  // chrome around a chat that has nothing in it yet.
  const idle = !started && !canvasOpen;

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
        gap: "var(--space-card)",
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
            // Greedy only once the brief is here and there is a document plus a
            // rail to spend the width on. Before that the content is capped for
            // reading, so a flex:1 column stretched to fill and stranded the
            // difference as dead space between the panels and the chat. Sizing
            // to the cap instead lets the row centre the two columns as a pair.
            flex: written ? 1 : "0 1 860px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-card)",
            overflowY: "auto",
            maxHeight: "100%",
            // This column scrolls, so its own edges need the inset the frame
            // gives everything else: room for the scrollbar on the right, and a
            // last card that ends short of the bottom instead of being clipped
            // flush against it.
            paddingRight: "var(--space-card)",
            paddingBottom: "var(--space-frame)",
          }}
        >
          {written ? (
            <div
              style={{
                display: "flex",
                gap: "var(--space-region)",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 620px", minWidth: 0, maxWidth: 1000 }}>
                <BriefDoc
                  sections={state.sections ?? []}
                  target={state.target}
                  verdict={verdict}
                  axis={state.axis}
                  visual={state.visual}
                />
              </div>
              {rail}
            </div>
          ) : (
            /* Analysis is in, the brief is not written yet: present the insight
               itself rather than a placeholder for the document. */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-card)",
              }}
            >
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
          width: canvasOpen ? 460 : "min(1040px, 100%)",
          margin: canvasOpen ? undefined : "0 auto",
          flexShrink: 0,
          zIndex: 1,
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          // Idle centres hero + composer + suggestions as one group; working
          // pins the transcript to full height.
          justifyContent: idle ? "center" : undefined,
          gap: idle ? 26 : 10,
          transition: "width 240ms ease",
        }}
      >
        {idle ? <Hero /> : null}

        <div
          // Panel chrome only once the canvas is up and the border has a job to
          // do. On its own — idle, or researching before the canvas opens — a
          // card around the conversation reads as detached from the app.
          className={canvasOpen ? "chat-panel" : "chat-plain"}
          style={{
            flex: idle ? "0 0 auto" : 1,
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
              // The hero is the welcome now. Leaving this set printed the same
              // sentence twice, once as a headline and once inside the chat.
              welcomeMessageText: "",
              chatInputPlaceholder: "Ask for a brief\u2026",
            }}
          />
        </div>

        {idle ? <HeroSuggestions onPick={send} /> : null}
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
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-region)",
        padding: "var(--space-frame)",
      }}
    >
      <BlurCircles />
      {/* The partner lockup stays on screen for the whole run — this is a
          CopilotKit × crewAI demo in every state, not only at the title card. */}
      <BrandBar />
      {/* Centred so any width the columns do not claim is split evenly either
          side of them, rather than piling up between the canvas and the chat.
          A no-op once the brief is written and the canvas takes the slack. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          gap: "var(--space-region)",
        }}
      >
        <AgentTaskProvider agent={agent as any}>
          <WorkspaceInner agent={agent} />
        </AgentTaskProvider>
      </div>
    </div>
  );
}
