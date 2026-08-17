"use client";

import Image from "next/image";
import { useState } from "react";
import type { AgentActivity, Finding, Scorecard, Section, Stage } from "../lib/types";

export function SectionTitle({
  title,
  trailing,
  onClick,
  chevron,
}: {
  title: string;
  trailing?: string;
  onClick?: () => void;
  chevron?: "open" | "closed";
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 4px",
        marginBottom: 10,
        width: "100%",
        border: "none",
        background: "transparent",
        font: "inherit",
        color: "inherit",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-container)" }} />
      {trailing ? (
        <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)" }}>
          {trailing}
        </span>
      ) : null}
      {chevron ? (
        <span aria-hidden style={{ fontSize: 11, color: "var(--text-disabled)" }}>
          {chevron === "open" ? "▾" : "▸"}
        </span>
      ) : null}
    </Tag>
  );
}

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "intake", label: "Intake" },
  { stage: "research", label: "Research" },
  { stage: "awaiting_approval", label: "Approval" },
  { stage: "writing", label: "Writing" },
  { stage: "done", label: "Done" },
];

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Idle",
  intake: "Understanding the ask",
  research: "Crew researching",
  awaiting_approval: "Waiting on you",
  writing: "Writing the brief",
  done: "Complete",
};

/** The pipeline, inline in the transcript.
 *
 * This was a sticky panel above the chat, which meant the run narrated itself in
 * two places: a floating header for the stage, and the log for everything else.
 * It renders as the intake tool's own component instead — identifying the target
 * IS the first step, so the card that reports it is the right place to show how
 * far the rest of the pipeline has got. It sits on the same rail as the agent
 * cards, so the log reads as one column.
 */
export function BriefPipelineCard({
  stage,
  target,
  axis,
}: {
  stage: Stage;
  target?: string | null;
  axis?: string;
}) {
  const activeIndex = STEPS.findIndex((s) => s.stage === stage);
  const waiting = stage === "awaiting_approval";
  const done = stage === "done";

  return (
    <div
      style={{
        borderLeft: "1px solid var(--border-container)",
        padding: "8px 0 10px 14px",
        fontSize: 15,
        position: "relative",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -4,
          top: 13,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: done ? "var(--text-primary)" : "var(--agent)",
          outline: "3px solid var(--surface-chat)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600 }}>
          {target ? `${target} brief` : "Cadence"}
        </span>
        {target ? (
          <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)" }}>
            {axis ?? "pricing"}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span
          className="mono"
          style={{
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 9999,
            whiteSpace: "nowrap",
            background: waiting ? "var(--text-primary)" : "var(--white-65)",
            color: waiting ? "var(--text-invert)" : "var(--text-secondary)",
            border: waiting ? "none" : "1px solid var(--border-container)",
          }}
        >
          {STAGE_LABEL[stage]}
        </span>
      </div>

      <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
        {STEPS.map((step, index) => {
          const reached = activeIndex >= index && activeIndex !== -1;
          const current = activeIndex === index;
          return (
            <div key={step.stage} style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  height: 2,
                  borderRadius: 9999,
                  background: reached ? "var(--text-primary)" : "var(--border-container)",
                }}
              />
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  marginTop: 5,
                  letterSpacing: "0.04em",
                  color: current ? "var(--text-primary)" : "var(--text-disabled)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {step.label.toLowerCase()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CrewTimeline({
  crew,
  toolsFor,
}: {
  crew: AgentActivity[];
  /** Per-agent tool usage read from the wire. Covers MCP calls, which never
   *  reach the chat transcript because they arrive without a parent message. */
  toolsFor?: (agent: string) => { names: string[]; count: number; usesMcp: boolean } | undefined;
}) {
  if (!crew.length) return null;

  const doneCount = crew.filter((c) => c.status === "done").length;

  return (
    <div className="glass" style={{ padding: "var(--space-inset)", zIndex: 1, position: "relative" }}>
      <SectionTitle title="Crew" trailing={`${doneCount}/${crew.length}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {crew.map((member) => {
          const working = member.status === "working";
          return (
            <div
              key={member.agent}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "7px 10px",
                borderRadius: 4,
                background: working ? "var(--white-70)" : "transparent",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  marginTop: 5,
                  flexShrink: 0,
                  background:
                    member.status === "done"
                      ? "var(--text-primary)"
                      : working
                        ? "var(--agent)"
                        : "var(--border-container)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>
                  {member.agent}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--text-disabled)",
                  }}
                >
                  {member.detail || member.role}
                </div>
                {(() => {
                  const tools = toolsFor?.(member.agent);
                  if (!tools?.count) return null;
                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginTop: 5,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 11, color: "var(--text-disabled)" }}
                        title={tools.names.join(", ")}
                      >
                        {tools.count} {tools.count === 1 ? "tool call" : "tool calls"}
                      </span>
                      {tools.usesMcp ? (
                        <span
                          className="mono"
                          style={{
                            fontSize: 10,
                            padding: "1px 5px",
                            borderRadius: 9999,
                            background: "var(--white-65)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-container)",
                          }}
                        >
                          MCP
                        </span>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** All three axes read the same way: higher = worse for us. So colour by threat
 *  rather than painting every bar the same ink. Verified accent tokens only. */
function threatColor(value: number): string {
  if (value >= 4) return "var(--threat-high)";
  if (value === 3) return "var(--threat-mid)";
  return "var(--threat-low)";
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = threatColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)", width: 92, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 3, flex: 1 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 9999,
              background: n <= value ? color : "var(--border-container)",
            }}
          />
        ))}
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)", width: 22 }}>
        {value || "–"}/5
      </span>
    </div>
  );
}

/** Scores only. The verdict lives in the brief's lede, not repeated here. */
export function ScorecardPanel({ card }: { card: Scorecard }) {
  return (
    <div className="glass" style={{ padding: "var(--space-inset)", zIndex: 1, position: "relative" }}>
      <SectionTitle title="Scorecard" trailing={card.competitor} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 4px" }}>
        <ScoreRow label="Pricing" value={card.pricing_pressure} />
        <ScoreRow label="Governance" value={card.governance} />
        <ScoreRow label="Time to value" value={card.time_to_value} />
      </div>
      <p
        style={{
          fontSize: 11,
          color: "var(--text-disabled)",
          margin: "10px 4px 0",
          lineHeight: 1.5,
        }}
      >
        Every axis reads the same way: higher means more of a threat to us.
      </p>
    </div>
  );
}

export function FindingsPanel({
  findings,
  defaultOpen,
}: {
  findings: Finding[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!findings.length) return null;

  return (
    <div className="glass" style={{ padding: "var(--space-inset)", zIndex: 1, position: "relative" }}>
      <SectionTitle
        title="Evidence"
        trailing={String(findings.length)}
        onClick={() => setOpen((o) => !o)}
        chevron={open ? "open" : "closed"}
      />
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {findings.map((finding, index) => (
            <div key={index} style={{ padding: "0 4px" }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--text-disabled)",
                  marginBottom: 2,
                  overflowWrap: "anywhere",
                }}
              >
                {finding.source}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>{finding.claim}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard can be blocked (insecure origin, permissions). Say so
          // rather than showing a success state that did not happen.
          setCopied(false);
        }
      }}
      className="mono"
      style={{
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 9999,
        border: "1px solid var(--border-container)",
        background: "var(--surface-container)",
        cursor: "pointer",
        color: "var(--text-secondary)",
      }}
    >
      {copied ? "Copied" : "Copy markdown"}
    </button>
  );
}

/** The deliverable. Prose is measure-constrained — full-width lines at 1080p+
 *  are close to unreadable, which is the main thing wrong with a naive layout. */
export function BriefDoc({
  sections,
  target,
  verdict,
}: {
  sections: Section[];
  target?: string | null;
  verdict?: string;
}) {
  if (!sections.length) return null;

  const done = sections.filter((s) => s.status === "done").length;
  const markdown = [
    `# ${target ?? "Competitive"} brief`,
    verdict ? `\n> ${verdict}\n` : "",
    ...sections.map((s) => `\n## ${s.title}\n\n${s.body}`),
  ].join("\n");

  return (
    <div
      className="glass"
      style={{
        // The brief is the one reading surface in the app rather than a data
        // card, so it gets more inset than the scale's default: long-form prose
        // set hard against a border is the thing that reads as cramped.
        padding: "26px 30px 30px",
        zIndex: 1,
        position: "relative",
        background: "var(--white-70)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-secondary)",
          }}
        >
          Brief
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border-container)" }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-disabled)" }}>
          {done}/{sections.length} sections
        </span>
        {done === sections.length ? <CopyButton text={markdown} /> : null}
      </div>

      <div style={{ maxWidth: "68ch" }}>
        {verdict ? (
          <p
            style={{
              fontSize: 17,
              lineHeight: "30px",
              margin: "0 0 22px",
              paddingLeft: 12,
              borderLeft: "2px solid var(--text-primary)",
              fontWeight: 500,
            }}
          >
            {verdict}
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {sections.map((section, index) => (
            <div key={section.key}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--text-disabled)", flexShrink: 0 }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 style={{ fontSize: 20, fontWeight: 600, lineHeight: "28px", margin: 0 }}>
                  {section.title}
                </h3>
                {section.status === "writing" ? (
                  <span className="mono" style={{ fontSize: 11, color: "#FFAC4D" }}>
                    writing…
                  </span>
                ) : null}
              </div>
              {section.body ? (
                <div className="brief-body" style={{ paddingLeft: 26 }}>
                  {section.body.split(/\n{2,}/).map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <div style={{ paddingLeft: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                  {[92, 78].map((width, i) => (
                    <div
                      key={i}
                      style={{
                        height: 5,
                        width: `${section.status === "writing" ? width / 2 : width}%`,
                        borderRadius: 9999,
                        background: "var(--border-container)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Short enough to sit on one row under the composer — three pills that wrap to a
 *  second line read as overflow rather than as a set of choices. */
export const DEMO_PROMPTS = [
  "Pulsegrid's pricing vs ours",
  "Beacon Analytics on governance",
  "Where is Telemetryx exposed?",
];

/** The persistent partner lockup.
 *
 * Both marks are the shipped assets, not traced approximations: the CopilotKit
 * logotype is the brandbook lockup with the wordmark reversed for a near-black
 * surface (its approved dark treatment), and the crewAI mark is the one crewAI
 * itself serves for both light and dark. Clearspace is held by the gap, and both
 * sit above the verified minimum sizes.
 */
export function BrandBar() {
  const pills = [
    { label: "crew · 3 agents", color: "var(--mint)" },
    { label: "hitl · interrupt/resume", color: "var(--agent)" },
    { label: "mcp + generative ui", color: "var(--orange)" },
  ];

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexShrink: 0,
        padding: "2px 6px",
        zIndex: 1,
        position: "relative",
      }}
    >
      <Image
        src="/copilotkit-logo-dark.svg"
        alt="CopilotKit"
        width={128}
        height={25}
        priority
      />
      <span className="mono" style={{ fontSize: 12, color: "var(--text-disabled)" }}>
        ×
      </span>
      <Image src="/crewai-logo.png" alt="crewAI" width={79} height={24} priority />

      <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        {pills.map((pill) => (
          <span
            key={pill.label}
            className="pill mono"
            style={{ color: pill.color, borderColor: pill.color }}
          >
            {pill.label}
          </span>
        ))}
      </span>
    </header>
  );
}

/** The idle screen: one headline, one line of explanation, the composer, and
 *  three things to try. The previous version stacked a bordered "what this demo
 *  shows" card on top of a bordered chat card on top of the chat's own welcome
 *  headline — three nested boxes saying the same thing before anything had
 *  happened. The hero replaces all of it, and the composer sits directly under
 *  the copy it belongs to. */
export function Hero() {
  return (
    <div style={{ textAlign: "center", padding: "0 16px" }}>
      {/* Sized against the viewport rather than in fixed px: on a 16:9 recording
          a fixed headline strands the hero in the middle of the frame. */}
      <h1
        style={{
          fontSize: "clamp(40px, 4.4vw, 74px)",
          lineHeight: 1.03,
          fontWeight: 600,
          letterSpacing: "-0.04em",
          margin: "0 0 18px",
        }}
      >
        Brief me on any competitor
      </h1>
      <p
        style={{
          fontSize: "clamp(16px, 1.25vw, 21px)",
          lineHeight: 1.5,
          color: "var(--text-secondary)",
          margin: "0 auto",
          maxWidth: "44ch",
        }}
      >
        A CrewAI crew researches, scores, and writes the brief — pausing for your
        approval before it commits. Every step streams over AG-UI.
      </p>
    </div>
  );
}

export function HeroSuggestions({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        flexWrap: "wrap",
        padding: "0 16px",
      }}
    >
      {DEMO_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onPick(prompt)}
          className="pill mono suggestion"
          style={{ background: "transparent", cursor: "pointer", font: "inherit" }}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
