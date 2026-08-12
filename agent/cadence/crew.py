"""The research crew: Researcher → Analyst → Writer.

Three agents with distinct tools and distinct jobs. This runs *inside* the flow,
which is what exercises 0.3.0's multi-agent attribution — the bridge nests each
agent's work and attributes it, so the UI can show who did what instead of one
undifferentiated blob of agent output.
"""

import logging
import os
import sys

from crewai import Agent, Crew, Process, Task

from .tools import RESEARCH_TOOLS

_LOGGER = logging.getLogger(__name__)

MODEL = os.getenv("CADENCE_MODEL", "openai/gpt-5.4")

# Set CADENCE_DISABLE_MCP=1 to drop the MCP subprocess (useful when recording on
# a slow machine, or to show the demo degrading cleanly).
_MCP_DISABLED = bool(os.getenv("CADENCE_DISABLE_MCP"))


def _mcp_servers() -> list:
    """The corpus MCP server, as a stdio subprocess.

    Real MCP, not a stand-in: CrewAI spawns cadence.mcp_server and the bridge
    translates its executions into TOOL_CALL_* + TOOL_CALL_RESULT plus CUSTOM
    lifecycle events. Returns [] when unavailable so the crew still runs.
    """
    if _MCP_DISABLED:
        return []
    try:
        from crewai.mcp import MCPServerStdio
    except ImportError:
        _LOGGER.warning("crewai.mcp unavailable (needs crewai >= 1.4); MCP tools disabled")
        return []
    return [MCPServerStdio(command=sys.executable, args=["-m", "cadence.mcp_server"])]


def _researcher() -> Agent:
    return Agent(
        role="Researcher",
        goal=(
            "Gather sourced facts about {target} on the axis of {axis}, and the "
            "equivalent facts about our own product, using only the tools provided."
        ),
        backstory=(
            "You are rigorous and allergic to unsourced claims. You always call "
            "our_positioning so the comparison has a baseline, and you quote "
            "specifics — numbers, tier names, limits — never vibes."
        ),
        tools=RESEARCH_TOOLS,
        llm=MODEL,
        verbose=True,
        allow_delegation=False,
    )


def _analyst() -> Agent:
    return Agent(
        role="Analyst",
        goal="Turn the Researcher's facts into a defensible read on where {target} beats us and where they are exposed.",
        backstory=(
            "You score competitors on pricing pressure, governance and time to "
            "value, from 1 to 5. You are willing to say we lose when we lose — a "
            "brief that flatters us is worthless to the person reading it. You "
            "always check shipping velocity before scoring, because a competitor "
            "shipping fast is a different threat from one standing still."
        ),
        llm=MODEL,
        # Shipping-velocity tools arrive over MCP rather than as local tools, so
        # the run exercises the MCP path end to end.
        mcps=_mcp_servers(),
        verbose=True,
        allow_delegation=False,
    )


def _writer() -> Agent:
    return Agent(
        role="Writer",
        goal="Write the approved brief sections about {target} in tight, quotable prose.",
        backstory=(
            "You write for a busy product leader. Short paragraphs, concrete "
            "numbers, no hedging, no marketing language. Every claim traces back "
            "to something the Researcher found."
        ),
        llm=MODEL,
        verbose=True,
        allow_delegation=False,
    )


def build_research_crew() -> Crew:
    """Crew for the research + analysis phase, before the approval pause."""
    researcher = _researcher()
    analyst = _analyst()

    gather = Task(
        description=(
            "Research {target} on the axis of {axis}.\n"
            "1. Call our_positioning first to establish our baseline.\n"
            "2. Call get_pricing and get_reviews for {target}.\n"
            "3. Use search_sources and fetch_page for any page that would sharpen "
            "the comparison (docs limits, quickstart friction, changelog).\n"
            "Report 5-8 sourced findings. Each finding names its source and makes "
            "one specific claim with a number or a named tier in it."
        ),
        expected_output=(
            "A numbered list of 5-8 findings. Format each as:\n"
            "SOURCE: <page or review source> | CLAIM: <one specific sentence>"
        ),
        agent=researcher,
    )

    analyse = Task(
        description=(
            "First call shipping_velocity for {target} to see how fast they are "
            "shipping — this tool comes from the corpus MCP server.\n\n"
            "Then, using the Researcher's findings, score {target} against us from 1-5 on:\n"
            "- pricing_pressure: how much their pricing threatens ours\n"
            "- governance: their SSO/audit/compliance strength\n"
            "- time_to_value: how fast a new team gets value\n"
            "Then propose the brief outline: 4-5 section titles that a product "
            "leader would actually want, ordered so the sharpest insight is first."
        ),
        expected_output=(
            "SCORES: pricing_pressure=<n> governance=<n> time_to_value=<n>\n"
            "VERDICT: <one sentence on where they beat us and where they are exposed>\n"
            "OUTLINE:\n- <section title>\n- <section title>\n- ..."
        ),
        agent=analyst,
        context=[gather],
    )

    return Crew(
        agents=[researcher, analyst],
        tasks=[gather, analyse],
        process=Process.sequential,
        verbose=True,
    )


def build_section_crew() -> Crew:
    """Crew that writes exactly one approved section.

    One section per kickoff, so the flow can emit a state snapshot between
    sections and the canvas fills in visibly rather than appearing at once.
    """
    writer = _writer()

    write = Task(
        description=(
            "Write ONLY the section titled '{section_title}' for the brief on {target} "
            "(axis: {axis}).\n\n"
            "Ground every claim in these findings:\n{findings}\n\n"
            "The Analyst's read:\n{analysis}\n\n"
            "{revision_note}"
            "Write 2-3 tight paragraphs. Do not write any other section. Do not "
            "repeat the section title as a heading — return the body prose only."
        ),
        expected_output="2-3 paragraphs of body prose for this one section. No heading.",
        agent=writer,
    )

    return Crew(agents=[writer], tasks=[write], process=Process.sequential, verbose=True)
