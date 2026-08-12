"use client";

/** Attribution store + the chat card that shows which sub-agent is being tasked.
 *
 * Where the attribution comes from: AG-UI `STEP_STARTED` / `STEP_FINISHED` carry
 * `rawEvent.attribution` with a `boundary` ("flow_method" | "crew" | "agent"), a
 * `path` like ["research", "crew", "Researcher"], and a depth. Tool-call events
 * themselves carry no agent field, so a tool call is attributed to whichever
 * agent step was open when it started. That is the honest reading of the wire —
 * we are not guessing from tool names.
 *
 * Grouping: contiguous tool calls belonging to the same agent form one group.
 * Every call registers itself; only the group's first call renders the card, and
 * it renders the whole group. The rest render nothing. That is what makes N tool
 * calls collapse into a single card once the group finishes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TaskStatus = "inProgress" | "executing" | "complete";

export interface TaskCall {
  toolCallId: string;
  name: string;
  parameters: unknown;
  status: TaskStatus;
  result?: string;
}

interface Group {
  id: string;
  /** Agent display name, or null when the call ran outside any agent step. */
  agent: string | null;
  /** Flow method the group ran under, e.g. "research". */
  step: string | null;
  order: string[];
  /** False once the owning agent step finished.
   *
   * Group completion is tied to the agent's step, not to its tool calls: each
   * backend tool returns in milliseconds, so keying off calls alone makes the
   * card flicker between "tasking" and "done" and the live state is never
   * really visible. An agent is being tasked until its step closes. */
  open: boolean;
}

export interface AgentTools {
  /** Tool names this agent invoked, deduplicated, in first-seen order. */
  names: string[];
  count: number;
  usesMcp: boolean;
}

interface Store {
  register: (call: TaskCall) => void;
  /** Per-agent tool usage read from TOOL_CALL_START on the wire.
   *
   * Needed because MCP tool executions arrive with `parentMessageId: null`, so
   * the chat transcript has no assistant message to hang them on and the
   * wildcard tool renderer never fires for them. Reading the wire directly is
   * the only way to surface that work. */
  toolsFor: (agent: string) => AgentTools | undefined;
  groupOf: (toolCallId: string) => Group | undefined;
  callsIn: (groupId: string) => TaskCall[];
  isLeader: (toolCallId: string) => boolean;
  version: number;
}

const AgentTaskContext = createContext<Store | null>(null);

interface Attribution {
  boundary?: string;
  path?: string[];
  depth?: number;
}

function attributionOf(event: unknown): Attribution | undefined {
  const raw = (event as { rawEvent?: { attribution?: Attribution } } | undefined)?.rawEvent;
  return raw?.attribution;
}

/** Tracks open agent steps and buckets tool calls into per-agent groups. */
export function AgentTaskProvider({
  agent,
  children,
}: {
  agent: { subscribe: (s: Record<string, unknown>) => { unsubscribe: () => void } } | undefined;
  children: React.ReactNode;
}) {
  // Mutable refs, not state: these are written from event handlers that fire
  // far more often than we want to re-render. `version` is the render signal.
  const calls = useRef(new Map<string, TaskCall>());
  const groups = useRef(new Map<string, Group>());
  const callGroup = useRef(new Map<string, string>());
  const activeAgent = useRef<string | null>(null);
  const activeStep = useRef<string | null>(null);
  const openGroupId = useRef<string | null>(null);
  const groupSeq = useRef(0);
  const agentTools = useRef(new Map<string, AgentTools>());
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!agent?.subscribe) return;

    const onStart = ({ event }: { event: unknown }) => {
      const attribution = attributionOf(event);
      const stepName = (event as { stepName?: string }).stepName;
      if (!attribution) return;

      if (attribution.boundary === "flow_method") {
        activeStep.current = stepName ?? null;
        // A new flow method always starts a new group.
        openGroupId.current = null;
      }
      if (attribution.boundary === "agent") {
        activeAgent.current = stepName ?? attribution.path?.slice(-1)[0] ?? null;
        openGroupId.current = null;
        bump();
      }
    };

    const onFinish = ({ event }: { event: unknown }) => {
      const attribution = attributionOf(event);
      if (attribution?.boundary === "agent") {
        const open = openGroupId.current;
        if (open) {
          const group = groups.current.get(open);
          if (group) group.open = false;
        }
        activeAgent.current = null;
        openGroupId.current = null;
        bump();
      }
    };

    const onToolCall = ({ event }: { event: unknown }) => {
      const name = (event as { toolCallName?: string }).toolCallName;
      const who = activeAgent.current;
      if (!name || !who) return;
      const entry = agentTools.current.get(who) ?? { names: [], count: 0, usesMcp: false };
      entry.count += 1;
      const shown = isMcpConnection(name) ? "MCP server" : label(name);
      if (!entry.names.includes(shown)) entry.names.push(shown);
      if (isMcp(name)) entry.usesMcp = true;
      agentTools.current.set(who, entry);
      bump();
    };

    const { unsubscribe } = agent.subscribe({
      onStepStartedEvent: onStart,
      onStepFinishedEvent: onFinish,
      onToolCallStartEvent: onToolCall,
      onRunFinishedEvent: () => {
        groups.current.forEach((g) => {
          g.open = false;
        });
        activeAgent.current = null;
        openGroupId.current = null;
        bump();
      },
      onRunStartedEvent: () => {
        // Fresh run: drop everything so a second brief does not inherit groups.
        calls.current.clear();
        groups.current.clear();
        callGroup.current.clear();
        activeAgent.current = null;
        activeStep.current = null;
        openGroupId.current = null;
        agentTools.current.clear();
        bump();
      },
    } as Record<string, unknown>);

    return () => unsubscribe();
  }, [agent, bump]);

  const register = useCallback(
    (call: TaskCall) => {
      const existing = calls.current.get(call.toolCallId);
      calls.current.set(call.toolCallId, call);

      if (!callGroup.current.has(call.toolCallId)) {
        // First sighting: attach it to the open group, or start a new one.
        let groupId = openGroupId.current;
        if (!groupId) {
          groupSeq.current += 1;
          groupId = `g${groupSeq.current}`;
          groups.current.set(groupId, {
            id: groupId,
            agent: activeAgent.current,
            step: activeStep.current,
            order: [],
            open: activeAgent.current !== null,
          });
          openGroupId.current = groupId;
        }
        groups.current.get(groupId)!.order.push(call.toolCallId);
        callGroup.current.set(call.toolCallId, groupId);
        bump();
        return;
      }

      // Re-render only when the status actually moved.
      if (existing && existing.status !== call.status) bump();
    },
    [bump],
  );

  const store = useMemo<Store>(
    () => ({
      register,
      version,
      toolsFor: (agent) => agentTools.current.get(agent),
      groupOf: (toolCallId) => {
        const id = callGroup.current.get(toolCallId);
        return id ? groups.current.get(id) : undefined;
      },
      callsIn: (groupId) => {
        const group = groups.current.get(groupId);
        if (!group) return [];
        return group.order
          .map((id) => calls.current.get(id))
          .filter((c): c is TaskCall => Boolean(c));
      },
      isLeader: (toolCallId) => {
        const id = callGroup.current.get(toolCallId);
        if (!id) return false;
        return groups.current.get(id)?.order[0] === toolCallId;
      },
    }),
    [register, version],
  );

  return <AgentTaskContext.Provider value={store}>{children}</AgentTaskContext.Provider>;
}

export function useAgentTasks(): Store | null {
  return useContext(AgentTaskContext);
}

/** Every tool call gets a row. Nothing is hidden, for two reasons: the wildcard
 *  renderer must return an element (returning nothing still leaves the chat's
 *  list marker behind as a stray bullet), and each of these calls really is work
 *  worth showing — including the MCP connection itself. */

/** MCP server tools arrive named after the spawned command, which is a file
 *  path, e.g. users_..._venv_bin_pyt_4a00553b. That row is the server
 *  connection, so label it as such rather than leaking a path into the UI. */
function isMcpConnection(name: string): boolean {
  return /_venv_bin_|users_[a-z0-9_]{20,}/i.test(name) || name.length > 48;
}

const FRIENDLY: Record<string, string> = {
  set_brief_target: "Identified the target",
  our_positioning: "Read our own positioning",
  get_pricing: "Fetched pricing tiers",
  get_reviews: "Read customer reviews",
  search_sources: "Searched sources",
  fetch_page: "Fetched a page",
  shipping_velocity: "Checked shipping velocity",
  compare_shipping: "Compared shipping cadence",
  generate_a2ui: "Rendered a component",
  render_a2ui: "Rendered a component",
};

function label(name: string): string {
  if (isMcpConnection(name)) return "Connected to MCP server";
  return FRIENDLY[name] ?? name.replace(/_/g, " ");
}

/** One-line summary of the interesting argument, for the row's right side. */
function argHint(parameters: unknown): string {
  if (!parameters || typeof parameters !== "object") return "";
  const values = Object.values(parameters as Record<string, unknown>)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map(String)
    .filter(Boolean);
  const hint = values.join(" \u00b7 ");
  return hint.length > 46 ? `${hint.slice(0, 45)}\u2026` : hint;
}

function isMcp(name: string): boolean {
  return name === "shipping_velocity" || name === "compare_shipping" || isMcpConnection(name);
}

export function AgentTaskCard(call: TaskCall) {
  const store = useAgentTasks();
  const [expanded, setExpanded] = useState(false);
  const { toolCallId } = call;

  // Register in an effect, never during render: `register` updates provider
  // state, and doing that while another component renders is a React violation
  // (it surfaces as a dev-overlay issue and can drop updates).
  useEffect(() => {
    store?.register(call);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, toolCallId, call.status, call.result]);

  const group = store?.groupOf(toolCallId);
  if (!store || !group) return null;
  if (!store.isLeader(toolCallId)) return null; // collapsed into the leader

  const calls = store.callsIn(group.id);
  if (!calls.length) return null;

  const done = !group.open && calls.every((c) => c.status === "complete");
  const finishedCount = calls.filter((c) => c.status === "complete").length;
  const who = group.agent ?? "Cadence";
  const usesMcp = calls.some((c) => isMcp(c.name));

  // Multiple calls collapse to a summary line once the group is done; a single
  // call stays readable as one row. Either way it is one card, not N.
  const showRows = !done || calls.length === 1 || expanded;

  return (
    <div
      style={{
        border: "1px solid var(--border-container)",
        background: "var(--surface-container)",
        borderRadius: 8,
        padding: "10px 12px",
        margin: "8px 0",
        fontSize: 13,
      }}
    >
      <button
        onClick={() => calls.length > 1 && done && setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: calls.length > 1 && done ? "pointer" : "default",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: done ? "var(--text-primary)" : "#FFAC4D",
          }}
        />
        <span style={{ fontWeight: 600 }}>
          {done ? who : `Tasking ${who}`}
        </span>
        {group.step ? (
          <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)" }}>
            {group.step}
          </span>
        ) : null}
        {usesMcp ? (
          <span
            className="mono"
            style={{
              fontSize: 9,
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
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--text-disabled)" }}>
          {done
            ? `${calls.length} ${calls.length === 1 ? "tool" : "tools"}`
            : finishedCount < calls.length
              ? `${finishedCount}/${calls.length}`
              : `${calls.length} so far`}
        </span>
        {calls.length > 1 && done ? (
          <span aria-hidden style={{ fontSize: 10, color: "var(--text-disabled)" }}>
            {expanded ? "▾" : "▸"}
          </span>
        ) : null}
      </button>

      {showRows ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {calls.map((call) => (
            <div
              key={call.toolCallId}
              style={{ display: "flex", alignItems: "baseline", gap: 8, lineHeight: 1.5 }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  flexShrink: 0,
                  marginTop: 6,
                  background:
                    call.status === "complete" ? "var(--border-container)" : "#FFAC4D",
                }}
              />
              <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>
                {label(call.name)}
              </span>
              <span
                className="mono"
                title={argHint(call.parameters)}
                style={{
                  fontSize: 11,
                  color: "var(--text-disabled)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {argHint(call.parameters)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
