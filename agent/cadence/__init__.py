"""Cadence — a competitive-intel brief crew served over AG-UI."""

__all__ = ["BriefFlow"]


def __getattr__(name: str):  # pragma: no cover - thin lazy re-export
    if name == "BriefFlow":
        from .flow import BriefFlow

        return BriefFlow
    raise AttributeError(name)
