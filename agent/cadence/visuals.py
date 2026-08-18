"""Builders for the brief's hero visual.

Pure functions over the committed corpus. The Illustrator picks which chart to
draw and writes the framing; everything numeric on screen comes from here, so a
run's prose can vary while its chart cannot.

Nothing in this module calls a model or touches the network.
"""

from __future__ import annotations

from typing import Any, Optional

from . import corpus
from .state import BriefVisual, VisualKind, VisualPoint

VISUAL_KINDS: tuple[VisualKind, ...] = ("tier-ladder", "gate-ladder")
DEFAULT_KIND: VisualKind = "tier-ladder"

# What each kind is for, injected into the Illustrator's prompt so its choice is
# informed by the same descriptions we implement.
KIND_BRIEFS: dict[VisualKind, str] = {
    "tier-ladder": (
        "Every priced tier for both products, cheapest first. Use when the "
        "argument is about price, packaging or where the paid ramp begins."
    ),
    "gate-ladder": (
        "What it costs to reach SSO and audit logs on each product, including "
        "tiers that are sales-only or absent entirely. Use when the argument is "
        "about governance, security review or enterprise readiness."
    ),
}

# Capabilities are described in free-text tier notes rather than as structured
# flags, so detection is substring matching with a small synonym set. It lives
# in one place and is pinned by tests against the committed corpus: if the
# wording drifts, exactly one test fails instead of the chart quietly lying.
CAPABILITIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("SSO", ("sso", "saml")),
    ("Audit logs", ("audit",)),
)


def _price_key(tier: dict[str, Any]) -> tuple[int, int]:
    """Sort by monthly price, with contact-us tiers last rather than as zero."""
    usd = tier.get("monthly_usd")
    return (1, 0) if usd is None else (0, int(usd))


def _display(usd: Optional[int]) -> str:
    return "Custom" if usd is None else f"${usd:,}"


def build_tier_ladder(target_slug: str) -> tuple[list[VisualPoint], str]:
    """Every tier of ours and theirs, cheapest first."""
    target = corpus.get(target_slug)
    ours = corpus.us()
    if target is None:
        return [], ""

    points: list[VisualPoint] = []
    for record in (target, ours):
        is_us = bool(record.get("is_us"))
        for tier in sorted(record.get("pricing", []), key=_price_key):
            usd = tier.get("monthly_usd")
            points.append(
                VisualPoint(
                    label=f"{record['name']} {tier.get('tier', '')}".strip(),
                    value=None if usd is None else int(usd),
                    display=_display(usd),
                    note=str(tier.get("notes", "")),
                    ours=is_us,
                )
            )

    points.sort(key=lambda p: (p.value is None, p.value or 0))
    return points, "Monthly list price. Sales-only tiers have no public number."


def _gate_for(record: dict[str, Any], needles: tuple[str, ...]) -> VisualPoint:
    """The cheapest tier whose notes mention the capability, or its absence.

    Three real states, none of them invented: a price, a sales-only tier with no
    public price, or not offered on any plan.
    """
    matches = [
        tier
        for tier in record.get("pricing", [])
        if any(n in str(tier.get("notes", "")).lower() for n in needles)
    ]
    name = record["name"]
    is_us = bool(record.get("is_us"))

    if not matches:
        return VisualPoint(
            label=name, value=None, display="Not offered", note="No plan lists it", ours=is_us
        )

    tier = sorted(matches, key=_price_key)[0]
    usd = tier.get("monthly_usd")
    return VisualPoint(
        label=name,
        value=None if usd is None else int(usd),
        display=_display(usd),
        note=f"{tier.get('tier', '')} — {tier.get('notes', '')}".strip(" —"),
        ours=is_us,
    )


def build_gate_ladder(target_slug: str) -> tuple[list[VisualPoint], str]:
    """What each product charges to reach each governance capability."""
    target = corpus.get(target_slug)
    ours = corpus.us()
    if target is None:
        return [], ""

    points: list[VisualPoint] = []
    for capability, needles in CAPABILITIES:
        for record in (target, ours):
            point = _gate_for(record, needles)
            # Grouped by capability, so the two products sit adjacent.
            points.append(point.model_copy(update={"label": f"{point.label} · {capability}"}))

    return points, "Cheapest plan that includes the capability. Lower is more reachable."


def build_points(kind: VisualKind, target_slug: str) -> tuple[list[VisualPoint], str]:
    if kind == "gate-ladder":
        return build_gate_ladder(target_slug)
    return build_tier_ladder(target_slug)


def coerce_kind(raw: Any) -> VisualKind:
    """Anything the model returns that is not a known kind falls back."""
    if isinstance(raw, str) and raw.strip() in VISUAL_KINDS:
        return raw.strip()  # type: ignore[return-value]
    return DEFAULT_KIND


def clamp_takeaway(raw: Any, limit: int = 160) -> str:
    text = " ".join(str(raw or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",;:—-") + "…"


def build_visual(kind: Any, title: Any, takeaway: Any, target_slug: str) -> Optional[BriefVisual]:
    """Assemble the visual, or None if there is not enough to plot.

    A thin chart is worse than no chart, so fewer than two points drops it and
    the brief renders exactly as it does today.
    """
    resolved = coerce_kind(kind)
    points, caption = build_points(resolved, target_slug)
    if len(points) < 2:
        return None

    target = corpus.get(target_slug)
    fallback = f"{target['name']} vs {corpus.us()['name']}" if target else "Comparison"
    return BriefVisual(
        kind=resolved,
        title=" ".join(str(title or "").split()) or fallback,
        takeaway=clamp_takeaway(takeaway),
        caption=caption,
        points=points,
    )
