#!/usr/bin/env python
"""Record the demo running, as clean 1080p product footage.

Drives the real app in a real browser and captures it to video. No burned-in
captions or titles: this is raw footage meant to be narrated or titled in post.

It prints a chapter list with timestamps relative to the start of the recording,
so the dead air while the crew works is easy to find and trim.

    python scripts/record_demo.py                    # needs web :3002 + agent :8008
    python scripts/record_demo.py --url http://localhost:3000  # override if your port differs
"""

from __future__ import annotations

import argparse
import pathlib
import shutil
import subprocess
import time

from playwright.sync_api import sync_playwright

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO_ROOT / "docs" / "video"

PROMPT = "Brief me on Pulsegrid's pricing vs ours."


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:3002")
    parser.add_argument("--prompt", default=PROMPT)
    # Record a laptop-sized viewport, deliver 1080p. Filming a 1920-wide viewport
    # is what made the first cut look small: the app is measured for reading, so a
    # centred column on a 1920 canvas leaves half the frame empty. A 1440 viewport
    # at 2x, scaled up to 1080p on the way out, fills the frame and stays crisp.
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=810)
    parser.add_argument("--out-width", type=int, default=1920)
    parser.add_argument("--out-height", type=int, default=1080)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_dir = OUT_DIR / "raw"
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
    raw_dir.mkdir(parents=True)

    viewport = {"width": args.width, "height": args.height}
    chapters: list[tuple[float, str]] = []
    start = time.monotonic()

    def beat(label: str) -> None:
        elapsed = time.monotonic() - start
        chapters.append((elapsed, label))
        print(f"  {int(elapsed) // 60:02d}:{int(elapsed) % 60:02d}  {label}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=viewport,
            record_video_dir=str(raw_dir),
            record_video_size=viewport,
            device_scale_factor=2,
        )
        page = context.new_page()

        page.goto(args.url)
        page.wait_for_load_state("networkidle")
        start = time.monotonic()  # clock starts once there is something to see
        beat("Empty state — what the demo does")
        page.wait_for_timeout(3500)

        box = page.locator("textarea").first
        box.wait_for(state="visible", timeout=30000)
        box.click()
        # Typed rather than filled, so the video shows it being written.
        box.type(args.prompt, delay=45)
        page.wait_for_timeout(700)
        beat("Prompt submitted")
        box.press("Enter")

        # Reasoning shows up first, before any tool runs.
        try:
            page.locator("text=/Thought for/").first.wait_for(state="visible", timeout=90000)
            beat("Reasoning stream")
        except Exception:
            print("  (no reasoning bubble seen — continuing)", flush=True)

        try:
            page.locator("text=/Tasking /").first.wait_for(state="visible", timeout=120000)
            beat("Tasking the Researcher — live tool calls in chat")
            page.wait_for_timeout(4000)
        except Exception:
            print("  (no task card seen — continuing)", flush=True)

        try:
            page.locator("text=/tool calls/").first.wait_for(state="visible", timeout=180000)
            beat("Analyst scoring — MCP tool calls attributed on the crew panel")
        except Exception:
            print("  (crew tally not seen — continuing)", flush=True)

        page.locator("text=Approval required").first.wait_for(state="visible", timeout=420000)
        beat("Run paused — approval required")
        # Hold long enough to read the outline and the scorecard.
        page.wait_for_timeout(7000)

        page.locator("button", has_text="Approve").first.click()
        beat("Approved — run resumes")

        page.wait_for_function(
            "() => document.body.innerText.includes('Complete')", timeout=600000
        )
        beat("Brief written — 5/5 sections")
        page.wait_for_timeout(2000)

        # Slow scroll through the finished brief so the writing is readable.
        canvas = page.locator("div").filter(has_text="Brief").first
        beat("Scrolling the finished brief")
        for _ in range(22):
            page.mouse.wheel(0, 260)
            page.wait_for_timeout(320)
        page.wait_for_timeout(2500)
        beat("End")

        page.close()
        context.close()
        browser.close()

    videos = sorted(raw_dir.glob("*.webm"))
    if not videos:
        print("\nNo video produced.")
        return 1
    webm = videos[0]

    final_webm = OUT_DIR / "cadence-demo.webm"
    shutil.move(str(webm), final_webm)
    shutil.rmtree(raw_dir, ignore_errors=True)

    outputs = [final_webm]
    if shutil.which("ffmpeg"):
        mp4 = OUT_DIR / "cadence-demo.mp4"
        # H.264 + faststart so it plays inline on X, LinkedIn and Slack.
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(final_webm),
                # Playwright pads rather than upscales when record_video_size is
                # larger than the viewport, so the scale to delivery size happens
                # here. lanczos because this is text, not photography.
                "-vf", f"scale={args.out_width}:{args.out_height}:flags=lanczos",
                "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-an", str(mp4),
            ],
            check=True,
            capture_output=True,
        )
        outputs.append(mp4)

    print("\nChapters:")
    for elapsed, label in chapters:
        print(f"  {int(elapsed) // 60:02d}:{int(elapsed) % 60:02d}  {label}")

    print("\nOutputs:")
    for path in outputs:
        size_mb = path.stat().st_size / 1_048_576
        print(f"  {path}  ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
