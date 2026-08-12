# Cadence — CopilotKit × CrewAI demo (ag-ui-crewai 0.3.0)

**Purpose.** A single narrative demo for the CrewAI partner co-marketing update: a
competitive-intelligence brief workspace where the new capabilities in
`ag-ui-crewai` 0.3.0 appear because the product needs them, not because a tab
exists to show them off.

**Audience.** CrewAI's developers and ours. The demo must be recordable (video),
screenshottable (posts), and forkable (starter).

## Verified ground truth

Everything below was probed against a real install of `ag-ui-crewai==0.3.0` +
`crewai==1.15.15` on Python 3.12, not inferred from docs.

| Fact | Value | Consequence for the demo |
|---|---|---|
| Conversational Flows | supported, entrypoint `stream_turn`, session = `threadId` | register the flow `conversational=True` |
| Reasoning | supported; litellm + Responses channels | reasoning streams without `emit_raw_events` |
| Native HITL interrupt/resume | **available** (`_human_feedback_available: True`) | use the real pause/resume path |
| `get_capabilities()` HITL report | hardcoded `interrupts: false` | **upstream bug**, see below |
| State | `snapshots: true`, `deltas: false`, `persistentState: false` | canvas updates by snapshot; no time-travel |
| MCP | `crewai.mcp` present (needs crewai >= 1.4) | real stdio MCP server, not a mock |
| Wire shape | `triples` default; MCP calls carry `TOOL_CALL_RESULT` | backend tool results render client-side |

### Upstream bug to file before the post ships

`ag_ui_crewai._capabilities.get_capabilities()` returns
`humanInTheLoop: {supported: true, mechanism: "frontend-tool-calls", interrupts: false}`
as a **static literal**, while the same module computes
`_human_feedback_available = True` and the package exports a working
`AGUIFeedbackProvider` driving crewai's `@human_feedback` pause/resume.

Interrupts work. The capability blob under-reports them. Anyone probing
capabilities programmatically would conclude CrewAI *lacks* the interrupt
support this update announces.

## Architecture

```
agent/  Python 3.12 · uv · FastAPI · ag-ui-crewai 0.3.0 · crewai 1.15.15
  cadence/
    flow.py      BriefFlow(Flow[BriefState]) — the one flow, conversational=True
    crew.py      Researcher → Analyst → Writer
    tools.py     corpus-backed backend tools
    a2ui.py      comparison card + score breakdown components
    state.py     BriefState
    server.py    FastAPI app + endpoint registration
  corpus/        committed competitor data — offline, deterministic
web/    Next.js 16 · React 19 · CopilotKit 1.67.1 + @copilotkit/a2ui-renderer
```

CopilotKit version note: the AG-UI dojo runs this same package set at 1.55.1.
That is the documented fallback if A2UI or interrupt wiring misbehaves at latest.

## The flow, step by step

| Step | Viewer sees | Capability earned |
|---|---|---|
| `intake` | model reasons about the ask before acting | reasoning stream |
| `research` | Researcher → Analyst → Writer, attributed and nested | crew-inside-flow attribution |
| tools | `search_sources` / `fetch_page` / `get_pricing` run server-side | backend tool rendering (`TOOL_CALL_RESULT`) |
| `approve_outline` | run genuinely pauses, then resumes on approve | interrupt / resume |
| `write` | BRIEF fills in section by section | shared-state streaming (`copilotkit_emit_state`) |
| card | competitor table + score as declarative components | generative UI / A2UI |

## Data

`agent/corpus/` holds 3 competitors × pricing page, docs page, review snippets,
changelog, as committed JSON. Tools read only from there. Offline, byte-identical
per take, `OPENAI_API_KEY` the only secret.

## Sequencing

1. Core six rows of the table above — always leaves a recordable demo in hand.
2. Then MCP (real stdio server over the corpus via `crewai.mcp.MCPServerStdio` +
   `Agent(mcps=[...])`) and multimodal (drop a pricing screenshot into chat).

## Out of scope

Thread persistence / time-travel (runtime reports `persistentState: false`;
building it would mean faking it), auth, deployment, live web research.

## Verification is the deliverable

`agent/scripts/verify_stream.py` drives one full run and asserts the AG-UI event
stream actually contains `REASONING_*`, `TOOL_CALL_RESULT`, MCP `CUSTOM`
lifecycle, `STATE_SNAPSHOT`, and an interrupt outcome. Its output is the
"showcase table checklist" visual for the update — evidence, not assertion.
