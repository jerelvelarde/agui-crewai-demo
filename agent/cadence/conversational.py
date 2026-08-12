"""ConciergeFlow — Conversational Flows, where it is actually the subject.

CrewAI's Conversational Flows (1.15.11+) install their own conversational graph:
a router classifies each turn into an intent, and ``@listen("<intent>")``
handlers answer it. Built-in routes are ``converse``, ``answer_from_history`` and
``end``; the routes below are ours.

This is a *separate* endpoint from ``BriefFlow`` on purpose. Opting a flow into
``conversational = True`` replaces a hand-authored graph with this one, so the
brief pipeline (intake → research → approve → write) cannot live here.

Registered with ``conversational=True``, the bridge drives it through the public
``stream_turn`` entrypoint and scopes the session by ``threadId`` — the same
AG-UI event translation, state sync and tooling as a regular Flow.
"""

import json

from ag_ui_crewai import CopilotKitState
from crewai.experimental.conversational import ConversationConfig, RouterConfig
from crewai.flow.flow import Flow, listen

from . import corpus
from .crew import MODEL

_SYSTEM_PROMPT = (
    f"You are the Cadence concierge for {corpus.us()['name']}. You answer quick "
    "questions about the competitors we track. Be brief and concrete. If someone "
    "wants a full written brief, tell them to ask for a brief on a named "
    "competitor, which runs the research crew."
)


@ConversationConfig(
    system_prompt=_SYSTEM_PROMPT,
    llm=MODEL,
    router=RouterConfig(
        llm=MODEL,
        routes=["pricing_lookup", "coverage", "converse", "end"],
        route_descriptions={
            "pricing_lookup": "The user asks what a specific competitor charges, or about tiers, seats or limits.",
            "coverage": "The user asks which competitors we track or what this assistant can do.",
            "converse": "Anything else — general discussion about the competitive landscape.",
            "end": "The user is done and says goodbye.",
        },
    ),
)
class ConciergeFlow(Flow[CopilotKitState]):
    """Quick competitor Q&A over the same corpus, routed per turn."""

    conversational = True

    def _turn_text(self) -> str:
        return (self.state.current_user_message or self.state.last_user_message or "").strip()

    # In a conversational flow, @listen labels are router route names and share
    # the trigger namespace with method-completion events — so a handler may not
    # be named after its own route. Hence the handle_ prefix.
    @listen("pricing_lookup")
    def handle_pricing_lookup(self) -> str:
        """Answer a pricing question from the corpus."""
        record = corpus.resolve(self._turn_text())
        if record is None:
            names = ", ".join(r["name"] for r in corpus.competitors())
            content = (
                "I could not tell which competitor you meant. I have pricing for: "
                f"{names}."
            )
            self.append_assistant_message(content)
            return content

        tiers = json.dumps(record.get("pricing", []), indent=2)
        lines = [f"**{record['name']}** — {record['tagline']}", "", "```json", tiers, "```"]
        if not record.get("is_us"):
            ours = corpus.us()
            lines += [
                "",
                f"For contrast, {ours['name']}: "
                + "; ".join(
                    f"{tier['tier']} "
                    + (f"${tier['monthly_usd']}/mo" if tier.get("monthly_usd") else "custom")
                    for tier in ours.get("pricing", [])
                ),
            ]
        content = "\n".join(lines)
        self.append_assistant_message(content)
        return content

    @listen("coverage")
    def handle_coverage(self) -> str:
        """List the competitors in the corpus."""
        rows = [
            f"- **{r['name']}** ({r['slug']}) — {r['tagline']}. {r['positioning']}"
            for r in corpus.competitors()
        ]
        content = "\n".join(
            ["I track these competitors:", *rows, "", "Ask for a brief on any of them to run the full research crew."]
        )
        self.append_assistant_message(content)
        return content
