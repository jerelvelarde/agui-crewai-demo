"use client";

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
          fontSize: 10,
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
        <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)" }}>
          {trailing}
        </span>
      ) : null}
      {chevron ? (
        <span aria-hidden style={{ fontSize: 10, color: "var(--text-disabled)" }}>
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

/** Sticky header: what we are working on, and how far along it is. */
export function StageHeader({
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

  return (
    <div
      className="glass"
      style={{
        padding: "14px 16px",
        zIndex: 3,
        position: "sticky",
        top: 0,
        // Sticky over translucent glass needs its own blur, or scrolled content
        // shows through the header.
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 300, lineHeight: "22px" }}>
            {target ? (
              <>
                {target} <span style={{ color: "var(--text-disabled)" }}>brief</span>
              </>
            ) : (
              "Cadence"
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-disabled)", marginTop: 3 }}>
            {target ? `Comparing on ${axis ?? "pricing"}` : "Competitive intelligence, on demand"}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <span
          className="mono"
          style={{
            fontSize: 10,
            padding: "3px 8px",
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

      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {STEPS.map((step, index) => {
          const reached = activeIndex >= index && activeIndex !== -1;
          const current = activeIndex === index;
          return (
            <div key={step.stage} style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  height: 3,
                  borderRadius: 9999,
                  background: reached ? "var(--text-primary)" : "var(--border-container)",
                }}
              />
              <div
                style={{
                  fontSize: 9,
                  marginTop: 5,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: current ? "var(--text-primary)" : "var(--text-disabled)",
                  fontWeight: current ? 600 : 400,
                }}
              >
                {step.label}
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
    <div className="glass" style={{ padding: 14, zIndex: 1, position: "relative" }}>
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
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
                  {member.agent}
                </div>
                <div
                  style={{
                    fontSize: 11,
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
                        style={{ fontSize: 9, color: "var(--text-disabled)" }}
                        title={tools.names.join(", ")}
                      >
                        {tools.count} {tools.count === 1 ? "tool call" : "tool calls"}
                      </span>
                      {tools.usesMcp ? (
                        <span
                          className="mono"
                          style={{
                            fontSize: 8,
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
      <span style={{ fontSize: 11, color: "var(--text-secondary)", width: 92, flexShrink: 0 }}>
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
      <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)", width: 22 }}>
        {value || "–"}/5
      </span>
    </div>
  );
}

/** Scores only. The verdict lives in the brief's lede, not repeated here. */
export function ScorecardPanel({ card }: { card: Scorecard }) {
  return (
    <div className="glass" style={{ padding: 14, zIndex: 1, position: "relative" }}>
      <SectionTitle title="Scorecard" trailing={card.competitor} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 4px" }}>
        <ScoreRow label="Pricing" value={card.pricing_pressure} />
        <ScoreRow label="Governance" value={card.governance} />
        <ScoreRow label="Time to value" value={card.time_to_value} />
      </div>
      <p
        style={{
          fontSize: 10,
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
    <div className="glass" style={{ padding: 14, zIndex: 1, position: "relative" }}>
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
                  fontSize: 9,
                  color: "var(--text-disabled)",
                  marginBottom: 2,
                  overflowWrap: "anywhere",
                }}
              >
                {finding.source}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.55 }}>{finding.claim}</div>
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
        fontSize: 10,
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
        padding: "20px 24px 24px",
        zIndex: 1,
        position: "relative",
        background: "var(--white-70)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-secondary)",
          }}
        >
          Brief
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border-container)" }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)" }}>
          {done}/{sections.length} sections
        </span>
        {done === sections.length ? <CopyButton text={markdown} /> : null}
      </div>

      <div style={{ maxWidth: "68ch" }}>
        {verdict ? (
          <p
            style={{
              fontSize: 15,
              lineHeight: "24px",
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
                  style={{ fontSize: 10, color: "var(--text-disabled)", flexShrink: 0 }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 600, lineHeight: "23px", margin: 0 }}>
                  {section.title}
                </h3>
                {section.status === "writing" ? (
                  <span className="mono" style={{ fontSize: 10, color: "#FFAC4D" }}>
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

/** Shown while the crew researches, in place of a brief skeleton.
 *
 * Deliberately not a skeleton. Research runs ~25s, and a skeleton is a promise
 * about *when* — hold one that long and it reads as a layout that failed to load
 * rather than as anticipation. There is honest progress to show instead (agent
 * activity, evidence landing one item at a time), so we show that and let the
 * brief panel stay absent until it has real content.
 */
export function ResearchProgress({ findingCount }: { findingCount: number }) {
  return (
    <div className="glass" style={{ padding: 20, zIndex: 1, position: "relative" }}>
      <SectionTitle
        title="Researching"
        trailing={findingCount ? `${findingCount} found` : "gathering"}
      />
      <p style={{ fontSize: 14, lineHeight: "22px", margin: "0 4px", maxWidth: "60ch" }}>
        {findingCount
          ? `${findingCount} sourced ${findingCount === 1 ? "finding" : "findings"} so far. The brief appears once the outline is approved.`
          : "The crew is reading pricing pages, docs and reviews. Findings appear here as they land."}
      </p>
    </div>
  );
}

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const prompts = [
    "Brief me on Pulsegrid's pricing vs ours",
    "How does Beacon Analytics compare on governance?",
    "Where is Telemetryx exposed?",
  ];

  return (
    <div className="glass" style={{ padding: 24, zIndex: 1, position: "relative" }}>
      <SectionTitle title="What this demo shows" />
      <p style={{ fontSize: 14, lineHeight: "22px", margin: "0 4px 6px", maxWidth: "64ch" }}>
        A three-agent CrewAI crew researches a competitor, an analyst scores them, the
        run pauses for your approval, then a writer fills in the brief section by
        section. Every step streams over AG-UI.
      </p>
      <p
        style={{
          fontSize: 12,
          lineHeight: "18px",
          margin: "0 4px 16px",
          color: "var(--text-disabled)",
          maxWidth: "64ch",
        }}
      >
        Pick one to start, or type your own.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPick(prompt)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textAlign: "left",
              fontSize: 13,
              padding: "10px 12px",
              borderRadius: 4,
              border: "1px solid transparent",
              background: "var(--white-50)",
              color: "var(--text-primary)",
              cursor: "pointer",
              font: "inherit",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--white-70)";
              e.currentTarget.style.borderColor = "var(--border-container)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--white-50)";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <span aria-hidden style={{ color: "var(--text-disabled)", fontSize: 12 }}>
              →
            </span>
            <span style={{ fontSize: 13 }}>{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
