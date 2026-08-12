"""Corpus access.

The demo runs offline against committed JSON so every take is byte-identical.
This module is the only thing that touches disk; tools wrap it.
"""

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

CORPUS_DIR = Path(__file__).resolve().parent.parent / "corpus"


@lru_cache(maxsize=1)
def _load() -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for path in sorted(CORPUS_DIR.glob("*.json")):
        record = json.loads(path.read_text())
        records[record["slug"]] = record
    if not records:
        raise RuntimeError(f"corpus is empty — expected *.json under {CORPUS_DIR}")
    return records


def all_slugs() -> list[str]:
    return sorted(_load().keys())


def competitors() -> list[dict[str, Any]]:
    """Everyone except us."""
    return [r for r in _load().values() if not r.get("is_us")]


def us() -> dict[str, Any]:
    for record in _load().values():
        if record.get("is_us"):
            return record
    raise RuntimeError("corpus has no record flagged is_us — nothing to compare against")


def get(slug: str) -> dict[str, Any] | None:
    return _load().get(slug.strip().lower())


def resolve(name: str) -> dict[str, Any] | None:
    """Resolve a slug or a loosely-typed display name to a record."""
    needle = name.strip().lower()
    if not needle:
        return None
    records = _load()
    if needle in records:
        return records[needle]
    for record in records.values():
        if record["name"].lower() == needle:
            return record
    for record in records.values():
        if needle in record["name"].lower() or needle in record["slug"]:
            return record
    return None
