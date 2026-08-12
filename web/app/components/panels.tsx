"use client";

import type { AgentActivity, Finding, Scorecard, Section, Stage } from "../lib/types";

export function SectionTitle({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", marginBottom: 8 }}>
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
    </div>
  );
}

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Idle",
  intake: "Understanding the ask",
  research: "Crew researching",
  awaiting_approval: "Waiting on you",
  writing: "Writing the brief",
  done: "Done",
};

export function StageBar({ stage, target, axis }: { stage: Stage; target?: string | null; axis?: string }) {
  const order: Stage[] = ["intake", "research", "awaiting_approval", "writing", "done"];
  const activeIndex = order.indexOf(stage);

  return (
    <div className="glass" style={{ padding: 16, zIndex: 1, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 300, lineHeight: "20px" }}>
            {target ? `${target} brief` : "Cadence"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-disabled)", marginTop: 4 }}>
            {target ? `Comparing on ${axis ?? "pricing"}` : "Ask for a brief on a competitor to start"}
          </div>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 9999,
            background: stage === "awaiting_approval" ? "var(--text-primary)" : "var(--white-65)",
            color: stage === "awaiting_approval" ? "var(--text-invert)" : "var(--text-primary)",
            whiteSpace: "nowrap",
          }}
        >
          {STAGE_LABEL[stage]}
        </span>
      </div>

      <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
        {order.map((step, index) => (
          <div
            key={step}
            title={STAGE_LABEL[step]}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 9999,
              background:
                activeIndex >= index && activeIndex !== -1
                  ? "var(--text-primary)"
                  : "var(--border-container)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function CrewTimeline({ crew }: { crew: AgentActivity[] }) {
  if (!crew.length) return null;

  const dot = (status: AgentActivity["status"]) =>
    status === "done" ? "var(--text-primary)" : status === "working" ? "#FFAC4D" : "var(--border-container)";

  return (
    <div className="glass" style={{ padding: 16, zIndex: 1, position: "relative" }}>
      <SectionTitle title="Crew" trailing={`${crew.filter((c) => c.status === "done").length}/${crew.length}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {crew.map((member) => (
          <div
            key={member.agent}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "8px 12px",
              borderRadius: 4,
              background: member.status === "working" ? "var(--white-70)" : "transparent",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                marginTop: 5,
                flexShrink: 0,
                background: dot(member.status),
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25 }}>{member.agent}</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: 1.625,
                  color: "var(--text-disabled)",
                }}
              >
                {member.detail || member.role}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)", width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              width: 18,
              height: 6,
              borderRadius: 9999,
              background: n <= value ? "var(--text-primary)" : "var(--border-container)",
            }}
          />
        ))}
      </div>
      <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)" }}>
        {value || "–"}/5
      </span>
    </div>
  );
}

export function ScorecardPanel({ card }: { card: Scorecard }) {
  return (
    <div className="glass" style={{ padding: 16, zIndex: 1, position: "relative" }}>
      <SectionTitle title="Analyst scorecard" trailing={card.competitor} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
        <ScoreRow label="Pricing pressure" value={card.pricing_pressure} />
        <ScoreRow label="Governance" value={card.governance} />
        <ScoreRow label="Time to value" value={card.time_to_value} />
      </div>
      {card.verdict ? (
        <p style={{ fontSize: 14, lineHeight: "22px", margin: "16px 4px 0" }}>{card.verdict}</p>
      ) : null}
    </div>
  );
}

export function FindingsPanel({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;

  return (
    <div className="glass" style={{ padding: 16, zIndex: 1, position: "relative" }}>
      <SectionTitle title="Sourced findings" trailing={String(findings.length)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {findings.map((finding, index) => (
          <div key={index} style={{ padding: "8px 12px", borderRadius: 4 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 9999,
                background: "var(--white-65)",
                marginRight: 8,
              }}
            >
              {finding.source}
            </span>
            <span style={{ fontSize: 14, lineHeight: "22px" }}>{finding.claim}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BriefDoc({ sections }: { sections: Section[] }) {
  if (!sections.length) return null;

  const done = sections.filter((s) => s.status === "done").length;

  return (
    <div
      className="glass"
      style={{ padding: 24, zIndex: 1, position: "relative", background: "var(--white-70)" }}
    >
      <SectionTitle title="Brief" trailing={`${done}/${sections.length} sections`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {sections.map((section) => (
          <div key={section.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 20, fontWeight: 500, lineHeight: "24px", margin: 0 }}>
                {section.title}
              </h3>
              {section.status === "writing" ? (
                <span className="mono" style={{ fontSize: 10, color: "#FFAC4D" }}>
                  writing…
                </span>
              ) : null}
            </div>
            {section.body ? (
              <div className="brief-body">
                {section.body.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <div
                style={{
                  height: 6,
                  width: section.status === "writing" ? "40%" : "100%",
                  borderRadius: 9999,
                  background: "var(--border-container)",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
