"""A real MCP server over the corpus, spoken to over stdio.

This exists so the demo's MCP beat is genuine. CrewAI connects to this as a
subprocess (`crewai.mcp.MCPServerStdio`), the agent calls its tools, and the
AG-UI bridge translates those executions into `TOOL_CALL_*` + `TOOL_CALL_RESULT`
plus `CUSTOM` lifecycle events — so the UI can tell an MCP call apart from a
plain backend tool call.

The tools here are deliberately *not* duplicates of the ones in tools.py. These
answer "how fast are they shipping, and what did they change recently", which is
the shipping-velocity read the Analyst wants and a natural thing to reach for
over MCP.

Run standalone for a sanity check:

    .venv/bin/python -m cadence.mcp_server
"""

from mcp.server.fastmcp import FastMCP

from . import corpus

mcp = FastMCP("cadence-corpus")


@mcp.tool()
def shipping_velocity(competitor: str) -> str:
    """How fast a competitor is shipping, from their changelog.

    Returns the entry count, the most recent date, and the entries themselves.
    """
    record = corpus.resolve(competitor)
    if record is None:
        return f"Unknown competitor {competitor!r}. Known: {', '.join(corpus.all_slugs())}."

    changelog = record.get("changelog", [])
    if not changelog:
        return f"{record['name']} has no changelog entries in the corpus."

    entries = sorted(changelog, key=lambda item: item["date"], reverse=True)
    lines = [
        f"{record['name']}: {len(entries)} changelog entries, latest {entries[0]['date']}.",
        "",
    ]
    lines += [f"- {entry['date']}: {entry['entry']}" for entry in entries]
    return "\n".join(lines)


@mcp.tool()
def compare_shipping(competitor: str) -> str:
    """Compare a competitor's recent shipping against ours, side by side."""
    record = corpus.resolve(competitor)
    if record is None:
        return f"Unknown competitor {competitor!r}. Known: {', '.join(corpus.all_slugs())}."

    ours = corpus.us()

    def summarise(entry_owner: dict) -> list[str]:
        entries = sorted(
            entry_owner.get("changelog", []), key=lambda item: item["date"], reverse=True
        )
        header = f"{entry_owner['name']} ({len(entries)} entries)"
        return [header] + [f"  - {e['date']}: {e['entry']}" for e in entries]

    return "\n".join([*summarise(record), "", *summarise(ours)])


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
