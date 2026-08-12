"""Parse crew text output into typed state.

Kept separate from the flow so it can be tested without an LLM in the loop —
these parsers are where a demo actually breaks, and they are pure functions.

Every parser is lenient: a model that drifts from the requested format should
degrade to fewer findings, never to an exception mid-run.
"""

import re

from .state import Finding, Scorecard

# Emphasis is allowed around the labels and around the colon, so all of
# ``SOURCE: x | CLAIM: y``, ``**SOURCE**: x | **CLAIM**: y`` and
# ``**source:** x | **claim:** y`` parse. Emphasis is not stripped from the
# captured text itself, which would mangle identifiers like ``time_to_value``.
_EMPH = r"[*_`]*"
_FINDING = re.compile(
    rf"{_EMPH}SOURCE{_EMPH}\s*:\s*{_EMPH}\s*(?P<source>.+?)\s*\|\s*"
    rf"{_EMPH}CLAIM{_EMPH}\s*:\s*(?P<claim>.+)",
    re.I,
)
_SCORE = re.compile(r"(?P<key>pricing_pressure|governance|time_to_value)\s*[=:]\s*(?P<value>[1-5])", re.I)
_VERDICT = re.compile(r"VERDICT:\s*(?P<verdict>.+)", re.I)
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(?P<text>.+)$")


def parse_findings(raw: str, competitor: str) -> list[Finding]:
    """Pull ``SOURCE: … | CLAIM: …`` lines out of the Researcher's output."""
    findings: list[Finding] = []
    for line in (raw or "").splitlines():
        match = _FINDING.search(line)
        if not match:
            continue
        source = match.group("source").strip(" *_`")
        claim = match.group("claim").strip(" *_`")
        if source and claim:
            findings.append(Finding(source=source, claim=claim, competitor=competitor))
    return findings


def parse_scorecard(raw: str, competitor: str) -> Scorecard:
    """Pull the Analyst's 1-5 scores and one-line verdict."""
    scores = {m.group("key").lower(): int(m.group("value")) for m in _SCORE.finditer(raw or "")}
    verdict_match = _VERDICT.search(raw or "")
    return Scorecard(
        competitor=competitor,
        pricing_pressure=scores.get("pricing_pressure", 0),
        governance=scores.get("governance", 0),
        time_to_value=scores.get("time_to_value", 0),
        verdict=verdict_match.group("verdict").strip(" *_`") if verdict_match else "",
    )


def parse_outline(raw: str) -> list[str]:
    """Pull section titles from the Analyst's OUTLINE block.

    Reads bullets after an ``OUTLINE:`` marker; falls back to every bullet in
    the text when the marker is missing.
    """
    text = raw or ""
    marker = re.search(r"OUTLINE:\s*", text, re.I)
    region = text[marker.end() :] if marker else text

    titles: list[str] = []
    for line in region.splitlines():
        if re.match(r"^\s*(SCORES|VERDICT)\s*:", line, re.I):
            break
        bullet = _BULLET.match(line)
        if not bullet:
            continue
        title = bullet.group("text").strip(" *_`#")
        # Drop a trailing parenthetical rationale — section titles stay short.
        title = re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()
        if title and title.lower() not in {t.lower() for t in titles}:
            titles.append(title)

    return titles[:6]


def split_sections(markdown: str) -> dict[str, str]:
    """Split written markdown into ``{heading: body}`` by ``##`` headings."""
    sections: dict[str, str] = {}
    current: str | None = None
    buffer: list[str] = []
    for line in (markdown or "").splitlines():
        heading = re.match(r"^\s*#{2,3}\s+(?P<title>.+?)\s*$", line)
        if heading:
            if current is not None:
                sections[current] = "\n".join(buffer).strip()
            current = heading.group("title").strip(" *_`")
            buffer = []
        elif current is not None:
            buffer.append(line)
    if current is not None:
        sections[current] = "\n".join(buffer).strip()
    return sections


def match_section(title: str, written: dict[str, str]) -> str:
    """Find the body a writer produced for ``title``, tolerating minor rewording."""
    if title in written:
        return written[title]
    needle = re.sub(r"[^a-z0-9]+", "", title.lower())
    for heading, body in written.items():
        candidate = re.sub(r"[^a-z0-9]+", "", heading.lower())
        if candidate and (candidate == needle or candidate in needle or needle in candidate):
            return body
    return ""
