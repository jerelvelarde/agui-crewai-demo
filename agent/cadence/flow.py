"""BriefFlow — the one flow behind the Cadence demo.

    intake  →  research  →  present  →  approve_outline  ⇢ (pause) ⇢  write
                                                          approved / revise

Each step exists because the product needs it, and each one happens to exercise
a distinct 0.3.0 capability:

* ``intake``          reasoning stream + predictive state (``target`` streams in
                      from the tool argument before the call completes)
* ``research``        a Crew of two agents inside a Flow → per-agent attribution;
                      corpus tools run server-side → ``TOOL_CALL_RESULT``
* ``present``         A2UI generative UI, when the client forwards injectA2UITool
* ``approve_outline`` a real pause via crewai ``@human_feedback`` + the bridge's
                      ``AGUIFeedbackProvider`` → an AG-UI interrupt, then resume
* ``write``           progressive ``copilotkit_emit_state`` snapshots as each
                      section lands
"""

import json
import logging
import os
from typing import Any

from ag_ui_crewai import (
    StateItem,
    agui_feedback_provider,
    apply_a2ui_plan_to_tools,
    copilotkit_emit_state,
    copilotkit_predict_state,
    copilotkit_responses,
    copilotkit_stream,
    plan_a2ui_injection,
    responses_channel_available,
)
from crewai.flow.flow import Flow, listen, start
from crewai.flow.human_feedback import human_feedback
from litellm import acompletion

from . import corpus
from .crew import MODEL, build_research_crew, build_section_crew
from .parsing import match_section, parse_findings, parse_outline, parse_scorecard, split_sections
from .state import AgentActivity, BriefState, Section

_LOGGER = logging.getLogger(__name__)

SET_TARGET_TOOL = {
    "type": "function",
    "function": {
        "name": "set_brief_target",
        "description": (
            "Record which competitor the brief is about and which axis to compare on. "
            "Call this once you know the competitor."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": "The competitor slug to brief on.",
                    "enum": [r["slug"] for r in corpus.competitors()],
                },
                "axis": {
                    "type": "string",
                    "description": "What to compare on, e.g. pricing, governance, developer experience.",
                },
            },
            "required": ["target", "axis"],
        },
    },
}


def _system_prompt() -> str:
    known = ", ".join(f"{r['name']} ({r['slug']})" for r in corpus.competitors())
    return (
        f"You are Cadence, a competitive-intelligence assistant for {corpus.us()['name']}.\n"
        f"You can brief on these competitors only: {known}.\n\n"
        "When the user asks for a brief, reply with ONE short sentence naming who you "
        "are about to research and on what axis, then call set_brief_target.\n"
        "The user may attach a screenshot of a competitor's pricing page. If they do, "
        "read it and say in that same sentence what you can see in it, then continue.\n"
        "If the competitor is not in the list above, say so plainly and name the ones "
        "you do cover. Do not call the tool in that case.\n\n"
        "Never narrate progress. The UI already shows which agent is working, which "
        "tools ran and what was found, so commentary between steps is the same "
        "information rendered twice."
    )


def _crew_roster() -> list[AgentActivity]:
    return [
        AgentActivity(agent="Researcher", role="Gathers sourced facts", status="idle"),
        AgentActivity(agent="Analyst", role="Scores and outlines", status="idle"),
        AgentActivity(agent="Writer", role="Writes the brief", status="idle"),
    ]


class BriefFlow(Flow[BriefState]):
    """Builds a competitive brief, pausing for outline approval."""

    # ---------------------------------------------------------------- helpers

    async def _mark(self, agent: str, status: str, detail: str = "") -> None:
        """Update one crew member's activity and push a snapshot."""
        for entry in self.state.crew:
            if entry.agent == agent:
                entry.status = status  # type: ignore[assignment]
                if detail:
                    entry.detail = detail
        await copilotkit_emit_state(self.state)

    def _last_user_text(self) -> str:
        for message in reversed(self.state.messages or []):
            role = message.get("role") if isinstance(message, dict) else getattr(message, "role", None)
            if role != "user":
                continue
            content = message.get("content") if isinstance(message, dict) else getattr(message, "content", None)
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                # Multimodal turn: keep the text parts, ignore image parts here.
                return " ".join(
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
        return ""

    async def _complete(self, *, messages: list[Any], tools: list[Any] | None) -> Any:
        """One streamed completion, over the channel that can carry reasoning.

        litellm chat-completions carries no reasoning content for OpenAI's
        reasoning models — OpenAI exposes reasoning summaries only through the
        Responses API. So prefer that channel, and fall back to chat-completions
        when this install cannot open it (the probe is a runtime capability
        check, not a version comparison).

        ``summary`` is required for anything to stream: without it the run
        succeeds but produces no reasoning trace.
        """
        if responses_channel_available():
            return await copilotkit_stream(
                await copilotkit_responses(
                    model=MODEL,
                    messages=messages,
                    tools=tools or None,
                    reasoning={"effort": "medium", "summary": "auto"},
                )
            )

        _LOGGER.info(
            "Responses channel unavailable; falling back to chat-completions "
            "(no reasoning stream on OpenAI reasoning models)."
        )
        return await copilotkit_stream(
            await acompletion(model=MODEL, messages=messages, tools=tools or None, stream=True)
        )

    @staticmethod
    def _tool_calls(message: Any) -> list[Any]:
        calls = (
            message.get("tool_calls")
            if isinstance(message, dict)
            else getattr(message, "tool_calls", None)
        )
        return list(calls or [])

    @staticmethod
    def _call_parts(call: Any) -> tuple[str | None, str | None, str]:
        """Return ``(call_id, name, raw_arguments)`` for one tool call."""
        call_id = call.get("id") if isinstance(call, dict) else getattr(call, "id", None)
        function = call.get("function") if isinstance(call, dict) else getattr(call, "function", None)
        name = function.get("name") if isinstance(function, dict) else getattr(function, "name", None)
        raw = (
            function.get("arguments")
            if isinstance(function, dict)
            else getattr(function, "arguments", "")
        )
        return call_id, name, raw or "{}"

    async def _answer_tool_calls(self, message: Any, *, a2ui_tool: Any = None) -> None:
        """Append a ``role="tool"`` message for every tool call in ``message``.

        OpenAI rejects any later completion whose history contains an assistant
        message with an unanswered ``tool_call_id``. Since this flow keeps the
        whole conversation in ``state.messages`` and runs several completions
        against it, every call the model makes must be answered here — including
        ``generate_a2ui``, which the A2UI contract says the node runs itself.
        """
        for call in self._tool_calls(message):
            call_id, name, raw = self._call_parts(call)
            if not call_id:
                continue

            if a2ui_tool is not None and name == a2ui_tool.tool_name:
                try:
                    args = json.loads(raw)
                except json.JSONDecodeError:
                    args = {}
                try:
                    envelope = await a2ui_tool.run(args, tool_call_id=call_id, flow=self)
                except Exception:
                    _LOGGER.exception("generate_a2ui failed; answering the call so history stays valid")
                    envelope = json.dumps({"error": "a2ui generation failed"})
                self.state.messages.append(
                    {"role": "tool", "tool_call_id": call_id, "content": envelope}
                )
                continue

            if name == "set_brief_target":
                content = f"Recorded: target={self.state.target}, axis={self.state.axis}."
            else:
                # A frontend action, or something we do not execute server-side.
                content = "Acknowledged."
            self.state.messages.append(
                {"role": "tool", "tool_call_id": call_id, "content": content}
            )

    def _findings_block(self) -> str:
        return "\n".join(f"- [{f.source}] {f.claim}" for f in self.state.findings) or "(none)"

    def _analysis_block(self) -> str:
        card = self.state.scorecard
        if card is None:
            return "(no analysis)"
        return (
            f"pricing_pressure={card.pricing_pressure} governance={card.governance} "
            f"time_to_value={card.time_to_value}\nverdict: {card.verdict}"
        )

    # ------------------------------------------------------------------ steps

    @start()
    async def intake(self) -> str:
        """Work out who the brief is about. Streams reasoning and predicted state."""
        self.state.stage = "intake"
        self.state.crew = _crew_roster()
        await copilotkit_emit_state(self.state)

        # Stream the tool's `target` argument straight into state.target, so the
        # canvas names the competitor before the call has even finished.
        await copilotkit_predict_state(
            [StateItem(state_key="target", tool="set_brief_target", tool_argument="target")]
        )

        tools: list[Any] = [SET_TARGET_TOOL, *(self.state.copilotkit.actions or [])]
        plan = plan_a2ui_injection(
            model=MODEL,
            state=self.state.model_dump(by_alias=True),
            existing_tool_names=["set_brief_target"],
            log=_LOGGER,
        )
        tools = apply_a2ui_plan_to_tools(tools, plan)

        response = await self._complete(
            messages=[{"role": "system", "content": _system_prompt()}, *self.state.messages],
            tools=tools,
        )
        message = response.choices[0].message
        self.state.messages.append(message)

        target, axis = self._read_target(message)
        if target is not None:
            record = corpus.resolve(target)
            self.state.target = record["name"] if record else target
            self.state.axis = axis

        # Answer every tool call before returning: the next completion replays
        # this history, and an unanswered tool_call_id is a hard 400.
        await self._answer_tool_calls(message, a2ui_tool=plan["tool"] if plan else None)

        if target is None:
            # Nothing we cover — the assistant already said so in its reply.
            self.state.stage = "done"
            await copilotkit_emit_state(self.state)
            return "no_target"

        await copilotkit_emit_state(self.state)
        return "researching"

    def _read_target(self, message: Any) -> tuple[str | None, str]:
        """Extract the target from the model's tool call, falling back to the text."""
        tool_calls = (
            message.get("tool_calls") if isinstance(message, dict) else getattr(message, "tool_calls", None)
        ) or []
        for call in tool_calls:
            function = call.get("function") if isinstance(call, dict) else getattr(call, "function", None)
            name = function.get("name") if isinstance(function, dict) else getattr(function, "name", None)
            if name != "set_brief_target":
                continue
            raw = function.get("arguments") if isinstance(function, dict) else getattr(function, "arguments", "")
            try:
                args = json.loads(raw or "{}")
            except json.JSONDecodeError:
                _LOGGER.warning("set_brief_target arguments were not valid JSON: %r", raw)
                continue
            target = args.get("target")
            if target:
                return str(target), str(args.get("axis") or "pricing")

        # No tool call — try to spot a known competitor in what the user typed.
        record = corpus.resolve(self._last_user_text())
        if record is not None and not record.get("is_us"):
            return record["slug"], "pricing"
        return None, "pricing"

    @listen(intake)
    async def research(self) -> str:
        """Run the research crew. Two agents, corpus tools, attributed per agent."""
        if not self.state.target:
            return "no_target"

        self.state.stage = "research"
        await self._mark("Researcher", "working", "Gathering sourced facts")

        crew = build_research_crew()
        result = await crew.kickoff_async(
            inputs={"target": self.state.target, "axis": self.state.axis}
        )

        outputs = [task.raw for task in (getattr(result, "tasks_output", None) or [])]
        research_raw = outputs[0] if outputs else ""
        analysis_raw = outputs[1] if len(outputs) > 1 else str(result)

        self.state.findings = parse_findings(research_raw, self.state.target)
        await self._mark("Researcher", "done", f"{len(self.state.findings)} sourced findings")

        await self._mark("Analyst", "working", "Scoring and outlining")
        self.state.scorecard = parse_scorecard(analysis_raw, self.state.target)
        outline = parse_outline(analysis_raw)
        if not outline:
            # Never strand the run on a formatting miss.
            _LOGGER.warning("no outline parsed from analyst output; using a default")
            outline = ["Where they beat us", "Where they are exposed", "What we should do"]
        self.state.outline = outline
        self.state.sections = [
            Section(key=f"s{index}", title=title) for index, title in enumerate(outline)
        ]
        # Short status only — the verdict is shown once, as the brief's lede.
        await self._mark(
            "Analyst", "done", f"Scored 3 axes · {len(outline)} sections proposed"
        )
        return "present"

    @listen(research)
    async def present(self) -> str:
        """Show the scorecard, as an A2UI surface when the client asked for one."""
        if not self.state.target:
            return "no_target"

        plan = plan_a2ui_injection(
            model=MODEL,
            state=self.state.model_dump(by_alias=True),
            existing_tool_names=[],
            log=_LOGGER,
        )
        tools = apply_a2ui_plan_to_tools(list(self.state.copilotkit.actions or []), plan)

        card = self.state.scorecard
        instruction = (
            f"Present your read on {self.state.target} versus {corpus.us()['name']} "
            f"on {self.state.axis}.\n"
            f"Scores (1-5): pricing_pressure={card.pricing_pressure if card else 0}, "
            f"governance={card.governance if card else 0}, "
            f"time_to_value={card.time_to_value if card else 0}.\n"
            f"Verdict: {card.verdict if card else ''}\n"
            f"Proposed outline: {', '.join(self.state.outline)}\n\n"
            "Reply with ONE short sentence: the single sharpest thing the reader "
            "should take away. Do NOT restate the scores or list the outline — both "
            "are already on screen next to your message, and repeating them renders "
            "the same answer twice. If you have a tool for rendering rich UI, use it "
            "to show the comparison."
        )

        response = await self._complete(
            messages=[
                {"role": "system", "content": _system_prompt()},
                *self.state.messages,
                {"role": "user", "content": instruction},
            ],
            tools=tools,
        )
        message = response.choices[0].message
        self.state.messages.append(message)
        # A generate_a2ui call is executed here and its envelope appended as the
        # tool result — that is what puts the scorecard on screen as A2UI.
        await self._answer_tool_calls(message, a2ui_tool=plan["tool"] if plan else None)

        # The pause happens in the very next step, and approve_outline is sync
        # (the @human_feedback contract), so it cannot await an emit. Flip the
        # stage here instead — otherwise the client sits on "research" while it
        # is actually waiting on the user.
        self.state.stage = "awaiting_approval"
        await copilotkit_emit_state(self.state)
        return "approve"

    @listen(present)
    @human_feedback(
        message=(
            "Approve this outline and I'll write the brief, or tell me what to change."
        ),
        emit=["approved", "revise"],
        # A cancelled interrupt resumes with empty feedback, which crewai maps to
        # default_outcome — or, without one, to the FIRST emit option. Without
        # this line, dismissing the approval card would silently approve it.
        default_outcome="revise",
        provider=agui_feedback_provider,
    )
    def approve_outline(self) -> str:
        """Pause for outline approval.

        The provider raises ``HumanFeedbackPending``, crewai persists the pending
        state, and the bridge terminates the run with an AG-UI interrupt. The next
        request resumes from here — keyed by ``thread_id``.

        Sync on purpose, and it does not emit: ``present`` already published the
        awaiting_approval stage.
        """
        lines = "\n".join(f"{i + 1}. {title}" for i, title in enumerate(self.state.outline))
        return f"Proposed outline for the {self.state.target} brief:\n{lines}"

    @listen("approved")
    async def write(self) -> str:
        """Write the approved brief, one section at a time."""
        return await self._write_sections(revision_note="")

    # Handler name deliberately differs from the "revise" outcome it listens to:
    # crewai rejects a listener whose name matches its own trigger.
    @listen("revise")
    async def revise_and_write(self) -> str:
        """Apply the reviewer's note, then write."""
        feedback = getattr(self.human_feedback, "feedback", "") or ""
        self.state.outline_decision = f"revise: {feedback}" if feedback else "revise"
        await copilotkit_emit_state(self.state)
        note = (
            f"The reviewer asked for this change — honour it: {feedback}\n\n"
            if feedback
            else ""
        )
        return await self._write_sections(revision_note=note)

    async def _write_sections(self, *, revision_note: str) -> str:
        if not self.state.sections:
            return "nothing_to_write"

        if self.state.outline_decision is None:
            self.state.outline_decision = "approved"
        self.state.stage = "writing"
        await self._mark("Writer", "working", "Writing the brief")

        crew = build_section_crew()
        findings = self._findings_block()
        analysis = self._analysis_block()

        for section in self.state.sections:
            section.status = "writing"
            await copilotkit_emit_state(self.state)

            result = await crew.kickoff_async(
                inputs={
                    "target": self.state.target,
                    "axis": self.state.axis,
                    "section_title": section.title,
                    "findings": findings,
                    "analysis": analysis,
                    "revision_note": revision_note,
                }
            )
            body = str(result).strip()
            # The writer is told to skip headings, but tolerate one if it appears.
            written = split_sections(body)
            section.body = match_section(section.title, written) or body
            section.status = "done"
            await copilotkit_emit_state(self.state)

        await self._mark("Writer", "done", f"{len(self.state.sections)} sections written")
        self.state.stage = "done"
        await copilotkit_emit_state(self.state)
        return "done"
