#!/usr/bin/env python
"""Record the demo running, as clean 1080p product footage.

Drives the real app in a real browser and captures it to video. No burned-in
captions or titles: this is raw footage meant to be narrated or titled in post.

It prints a chapter list with timestamps relative to the start of the recording,
so the dead air while the crew works is easy to find and trim.

    python scripts/record_demo.py                    # needs web :3000 + agent :8008
    python scripts/record_demo.py --theme light      # the light cut, as agui-crewai-demo-light
    python scripts/record_demo.py --url http://localhost:3100  # override if your port differs
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
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--prompt", default=PROMPT)
    # Record a laptop-sized viewport, deliver 1080p. Filming a 1920-wide viewport
    # is what made the first cut look small: the app is measured for reading, so a
    # centred column on a 1920 canvas leaves half the frame empty. A 1440 viewport
    # at 2x, scaled up to 1080p on the way out, fills the frame and stays crisp.
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=810)
    parser.add_argument("--out-width", type=int, default=1920)
    parser.add_argument("--out-height", type=int, default=1080)
    parser.add_argument(
        "--theme",
        choices=("dark", "light"),
        default="dark",
        help="Which theme to film. Dark is the app's default.",
    )
    # Video capture starts when the browser context is created, which is before
    # the page has navigated, so every take opens on the browser's own blank
    # frame. Measured at ~0.2s here; 0.3 clears it with margin and costs only a
    # slice of the idle screen, which is static anyway.
    parser.add_argument(
        "--lead-in",
        type=float,
        default=0.3,
        help="Seconds of blank pre-paint frame to drop from the head. 0 keeps it.",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Output basename. Defaults to agui-crewai-demo, or "
        "agui-crewai-demo-light "
        "for --theme light, so the two cuts never overwrite each other.",
    )
    args = parser.parse_args()

    name = args.name or (
        "agui-crewai-demo" if args.theme == "dark" else "agui-crewai-demo-light"
    )

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
        # The app reads its theme from localStorage before first paint, so this
        # has to be in place before any page script runs. Setting it afterwards
        # would film a dark first frame and then a flip.
        if args.theme == "light":
            context.add_init_script(
                "try{localStorage.setItem('cadence-theme','light')}catch(e){}"
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

        # First gate: the research plan, before the crew spends anything. This
        # blocks the run, so the recorder has to clear it or nothing else
        # happens — waiting on the outline card alone would hang here forever.
        try:
            page.locator("text=Research plan").first.wait_for(state="visible", timeout=120000)
            beat("Run pauses — research plan, before any work")
            page.wait_for_timeout(5000)
            page.locator("button", has_text="Approve").first.click()
            beat("Plan approved — crew starts")
        except Exception:
            print("  (no plan gate seen — continuing)", flush=True)

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
        beat("Run pauses again — outline approval")
        # Hold long enough to read the outline and the scorecard.
        page.wait_for_timeout(7000)

        page.locator("button", has_text="Approve").first.click()
        beat("Approved — run resumes")

        page.wait_for_function(
            "() => document.body.innerText.includes('Complete')", timeout=600000
        )
        # The Analyst proposes the outline, so the section count varies per run.
        written = page.locator("text=/\\d+\\/\\d+ sections/").first.inner_text()
        beat(f"Brief written — {written}")
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

    final_webm = OUT_DIR / f"{name}.webm"
    # Both deliverables are encoded from the raw capture, each one generation
    # deep. Deriving the mp4 from the re-encoded webm instead would put two
    # lossy passes over text, which is the one thing this footage is made of.
    seek = ["-ss", str(args.lead_in)] if args.lead_in > 0 else []

    if seek and shutil.which("ffmpeg"):
        # A stream copy will not do it: seeking snaps back to the keyframe at 0
        # and the blank frame survives. Re-encoding drops it for real, and VP9
        # happens to halve the file on the way.
        subprocess.run(
            ["ffmpeg", "-y", *seek, "-i", str(webm),
             "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0",
             "-row-mt", "1", "-cpu-used", "5", "-an", str(final_webm)],
            check=True,
            capture_output=True,
        )
    else:
        shutil.copy2(str(webm), final_webm)

    outputs = [final_webm]
    if shutil.which("ffmpeg"):
        mp4 = OUT_DIR / f"{name}.mp4"
        # H.264 + faststart so it plays inline on X, LinkedIn and Slack.
        subprocess.run(
            [
                "ffmpeg", "-y", *seek, "-i", str(webm),
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

    shutil.rmtree(raw_dir, ignore_errors=True)

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
