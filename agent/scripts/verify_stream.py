#!/usr/bin/env python
"""Drive one full brief and assert the AG-UI stream really carries each capability.

This is the demo's evidence. It does not check that the code *has* a feature; it
checks that the wire carries the events the feature is supposed to produce, then
prints a checklist. Anything it cannot prove is reported as MISSING rather than
quietly passing.

    uv run python scripts/verify_stream.py            # against localhost:8008
    uv run python scripts/verify_stream.py --url ...  # against something else

Writes the raw event stream to docs/evidence/ for screenshots and debugging.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import uuid
from collections import Counter

import httpx

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
EVIDENCE_DIR = REPO_ROOT / "docs" / "evidence"

PROMPT = "Brief me on Pulsegrid's pricing vs ours."


def _input_payload(thread_id: str, *, messages: list[dict], resume: list[dict] | None = None) -> dict:
    payload = {
        "threadId": thread_id,
        "runId": str(uuid.uuid4()),
        "state": {},
        "messages": messages,
        "tools": [],
        "context": [],
        # injectA2UITool is what makes the flow's plan_a2ui_injection offer the
        # generate_a2ui tool; without it A2UI correctly stays off.
        "forwardedProps": {"injectA2UITool": True},
    }
    if resume:
        payload["resume"] = resume
    return payload


def stream_run(client: httpx.Client, url: str, payload: dict, sink) -> list[dict]:
    """POST one run and collect its SSE events."""
    events: list[dict] = []
    with client.stream("POST", url, json=payload, timeout=httpx.Timeout(600.0)) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            raw = line[len("data:") :].strip()
            if not raw:
                continue
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue
            events.append(event)
            sink.write(json.dumps(event) + "\n")
            kind = event.get("type", "?")
            if kind in {"RUN_STARTED", "RUN_FINISHED", "RUN_ERROR", "STATE_SNAPSHOT"}:
                print(f"    ← {kind}")
    return events


def find_interrupt(events: list[dict]) -> dict | None:
    """Pull the interrupt off RUN_FINISHED.outcome, if the run paused."""
    for event in reversed(events):
        if event.get("type") != "RUN_FINISHED":
            continue
        outcome = event.get("outcome") or {}
        if outcome.get("type") == "interrupt":
            interrupts = outcome.get("interrupts") or []
            if interrupts:
                return interrupts[0]
            if outcome.get("interrupt"):
                return outcome["interrupt"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8008/brief")
    parser.add_argument("--prompt", default=PROMPT)
    args = parser.parse_args()

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    evidence_path = EVIDENCE_DIR / f"stream-{stamp}.jsonl"

    thread_id = str(uuid.uuid4())
    messages = [{"id": str(uuid.uuid4()), "role": "user", "content": args.prompt}]

    with httpx.Client() as client, evidence_path.open("w") as sink:
        print(f"→ run 1: {args.prompt}")
        first = stream_run(client, args.url, _input_payload(thread_id, messages=messages), sink)

        interrupt = find_interrupt(first)
        second: list[dict] = []
        if interrupt is not None:
            print(f"\n→ run 2: resuming interrupt {interrupt.get('id')} with 'approved'")
            second = stream_run(
                client,
                args.url,
                _input_payload(
                    thread_id,
                    messages=messages,
                    resume=[
                        {
                            "interruptId": interrupt.get("id"),
                            "status": "resolved",
                            "payload": "approved",
                        }
                    ],
                ),
                sink,
            )
        else:
            print("\n! run 1 did not pause — no interrupt to resume")

    events = first + second
    counts = Counter(event.get("type", "?") for event in events)
    return report(events, counts, interrupt, evidence_path)


def report(
    events: list[dict], counts: Counter, interrupt: dict | None, evidence_path: pathlib.Path
) -> int:
    def seen(*types: str) -> bool:
        return any(counts.get(t) for t in types)

    def custom_named(*names: str) -> bool:
        wanted = set(names)
        return any(
            event.get("type") == "CUSTOM" and event.get("name") in wanted for event in events
        )

    snapshots = counts.get("STATE_SNAPSHOT", 0)
    tool_results = counts.get("TOOL_CALL_RESULT", 0)

    checks = [
        ("Streaming transport (SSE, run lifecycle)", seen("RUN_STARTED") and seen("RUN_FINISHED")),
        ("Text message streaming", seen("TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CHUNK")),
        (
            "Reasoning / thinking stream",
            seen(
                "REASONING_START",
                "REASONING_CONTENT",
                "REASONING_END",
                "THINKING_START",
                "THINKING_TEXT_MESSAGE_CONTENT",
            ),
        ),
        ("Tool calls on the wire", seen("TOOL_CALL_START", "TOOL_CALL_CHUNK")),
        (f"Backend tool results ({tool_results} seen)", tool_results > 0),
        (f"Shared-state snapshots ({snapshots} seen)", snapshots > 1),
        ("Real interrupt on RUN_FINISHED.outcome", interrupt is not None),
        ("Interrupt is resumable (stable id)", bool(interrupt and interrupt.get("id"))),
        (
            "Interrupt advertises its outcomes",
            bool(interrupt and (interrupt.get("responseSchema") or interrupt.get("response_schema"))),
        ),
        ("Run resumed and completed after approval", counts.get("RUN_FINISHED", 0) >= 2),
        ("MCP tool lifecycle (CUSTOM)", custom_named(
            "mcp_server_connect_started",
            "mcp_server_connect_completed",
            "mcp_tool_execution_started",
            "mcp_tool_execution_failed",
        )),
        ("A2UI generative UI surface", any(
            "a2ui" in json.dumps(event).lower() for event in events
        )),
    ]

    width = max(len(label) for label, _ in checks)
    print("\n" + "=" * (width + 12))
    print("AG-UI capability evidence".center(width + 12))
    print("=" * (width + 12))
    for label, ok in checks:
        print(f"  {'PASS' if ok else 'MISS'}  {label}")
    print("=" * (width + 12))

    print("\nEvent counts:")
    for kind, count in sorted(counts.items(), key=lambda item: -item[1]):
        print(f"  {count:5d}  {kind}")

    print(f"\nRaw stream: {evidence_path}")

    # Core capabilities the demo narrative depends on. MCP and A2UI are reported
    # but not required, because they depend on the client forwarding the flag and
    # on an MCP server being wired up.
    required = [label for label, ok in checks[:10] if not ok]
    if required:
        print("\nFAILED — core capabilities missing:")
        for label in required:
            print(f"  - {label}")
        return 1
    print("\nOK — every core capability is present on the wire.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
