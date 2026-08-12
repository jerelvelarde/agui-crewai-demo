"""Backend tools for the research crew.

These run server-side on the CrewAI agents. The AG-UI bridge surfaces each call
as ``TOOL_CALL_START/ARGS/END`` plus a ``TOOL_CALL_RESULT``, so the client
renders the call and its result without ever executing the tool itself — that is
the "backend tool rendering" capability in 0.3.0.

Every tool reads the committed corpus, so results are identical run to run.
"""

import json

from crewai.tools import tool

from . import corpus


@tool("search_sources")
def search_sources(query: str) -> str:
    """Search the competitive-intel corpus for pages matching a query.

    Returns matching page titles with their competitor slug and path, so a
    follow-up fetch_page call can retrieve the full text.
    """
    needle = (query or "").strip().lower()
    hits = []
    for record in corpus.competitors() + [corpus.us()]:
        for page in record.get("pages", []):
            haystack = f"{page['title']} {page['path']} {page['text']}".lower()
            if not needle or needle in haystack:
                hits.append(
                    {
                        "competitor": record["slug"],
                        "path": page["path"],
                        "title": page["title"],
                    }
                )
    if not hits:
        return f"No pages matched {query!r}. Known competitors: {', '.join(corpus.all_slugs())}."
    return json.dumps(hits, indent=2)


@tool("fetch_page")
def fetch_page(competitor: str, path: str) -> str:
    """Fetch the full text of one page for one competitor.

    ``competitor`` is a slug or name; ``path`` is a path like /pricing.
    """
    record = corpus.resolve(competitor)
    if record is None:
        return f"Unknown competitor {competitor!r}. Known: {', '.join(corpus.all_slugs())}."
    wanted = (path or "").strip().rstrip("/").lower()
    for page in record.get("pages", []):
        if page["path"].rstrip("/").lower() == wanted:
            return f"# {page['title']}\n\n{page['text']}"
    available = ", ".join(p["path"] for p in record.get("pages", []))
    return f"No page {path!r} for {record['name']}. Available: {available}."


@tool("get_pricing")
def get_pricing(competitor: str) -> str:
    """Get the structured pricing tiers for one competitor."""
    record = corpus.resolve(competitor)
    if record is None:
        return f"Unknown competitor {competitor!r}. Known: {', '.join(corpus.all_slugs())}."
    return json.dumps(
        {"competitor": record["name"], "tiers": record.get("pricing", [])}, indent=2
    )


@tool("get_reviews")
def get_reviews(competitor: str) -> str:
    """Get customer reviews and community sentiment for one competitor."""
    record = corpus.resolve(competitor)
    if record is None:
        return f"Unknown competitor {competitor!r}. Known: {', '.join(corpus.all_slugs())}."
    return json.dumps(
        {"competitor": record["name"], "reviews": record.get("reviews", [])}, indent=2
    )


@tool("our_positioning")
def our_positioning() -> str:
    """Get our own product's pricing, positioning and recent changelog.

    Use this to ground any comparison — the brief is always 'them vs us'.
    """
    record = corpus.us()
    return json.dumps(
        {
            "name": record["name"],
            "positioning": record["positioning"],
            "pricing": record.get("pricing", []),
            "changelog": record.get("changelog", []),
        },
        indent=2,
    )


RESEARCH_TOOLS = [search_sources, fetch_page, get_pricing, get_reviews, our_positioning]
