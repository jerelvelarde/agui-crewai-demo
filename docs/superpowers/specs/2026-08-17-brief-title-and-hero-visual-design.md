# Brief title block and an Illustrator-chosen hero visual

Status: implemented 2026-08-17
Date: 2026-08-17

## Goal

The finished brief opens with a small `BRIEF` eyebrow and a verdict blockquote.
It reads as a fragment rather than a document, and it carries no visual: every
number in it has to be extracted from prose by the reader.

Two changes:

1. A real title block at the top of the brief.
2. One hero visual under the title, chosen and framed by a new fourth crew
   agent, with every figure derived from the corpus rather than authored.

Sections stay unillustrated. That was chosen deliberately over per-section
charts: only two or three sections have a numeric angle, and the rest would get
invented shapes.

## Decisions

**The agent frames the chart; it never supplies a figure.** The Illustrator
chooses `kind`, writes `title` and `takeaway`, and stops there. Every plotted
value is built server-side from `corpus/*.json`. This is what keeps the
"offline by design, runs are byte-identical" property in the README true: the
prose varies per run, the chart does not.

**Two chart kinds, so the choice is real.** One kind would make the Illustrator
decorative.

**Deviation from the approved design — `positioning-map` replaced by
`gate-ladder`.** The approved second chart was a 2x2 of price against
governance readiness. It does not survive contact with the data:

- The `Scorecard` holds threat scores for the target only. There is no
  Northstar coordinate to plot, and inventing one is the thing this design
  exists to prevent.
- Deriving the Y axis from the SSO gate price fails on Beacon, whose SSO sits
  on an Enterprise tier with `monthly_usd: null`. Beacon is one of the three
  idle suggestions, so this would break in the demo's own happy path.

`gate-ladder` answers the same question — how governance-ready is each product,
and what does it cost to get there — and resolves for every competitor in the
corpus.

## Data model

New in `cadence/state.py`:

```python
VisualKind = Literal["tier-ladder", "gate-ladder"]

class VisualPoint(BaseModel):
    label: str                     # "Pulsegrid Scale"
    value: Optional[int] = None    # monthly_usd; None = not a number
    display: str                   # "$499", "Custom", "Not offered"
    note: str = ""                 # the tier's own notes text
    ours: bool = False             # drives the one accent that means "us"

class BriefVisual(BaseModel):
    kind: VisualKind
    title: str                     # Illustrator
    takeaway: str                  # Illustrator, one line
    caption: str                   # builder: what the axis means
    points: list[VisualPoint]      # builder, from corpus
```

`BriefState` gains `visual: Optional[BriefVisual] = None`.

`value` is `Optional` on purpose. A contact-us tier has no monthly price, and
`display` carries the honest string while `value` stays `None` so the bar
renderer can show it as off-scale rather than as zero.

## The builder: `cadence/visuals.py`

A new module, pure functions, no LLM and no I/O beyond reading the corpus that
`tools.py` already reads.

```python
def build_tier_ladder(target_slug: str) -> tuple[list[VisualPoint], str]
def build_gate_ladder(target_slug: str) -> tuple[list[VisualPoint], str]
def build_points(kind: VisualKind, target_slug: str) -> tuple[list[VisualPoint], str]
```

**tier-ladder** — every pricing tier for the target and for Northstar, sorted by
`monthly_usd` with `None` last. `ours=True` on the Northstar rows. Caption
states that the bars are monthly list price.

**gate-ladder** — compares the same two products as `tier-ladder`, the target
and Northstar, across a fixed capability list (`SSO`, `audit logs`). One point
per capability per product, so four points, labelled
`"<Product> · <capability>"` (`"Pulsegrid · SSO"`) and grouped by capability so
the two products sit adjacent. Each point takes the cheapest tier for that
product whose `notes` mention the capability, resolving to one of three states:

| state | when | `value` | `display` |
|---|---|---|---|
| priced | tier found, `monthly_usd` set | the price | `"$499"` |
| custom | tier found, `monthly_usd is None` | `None` | `"Custom"` |
| absent | no tier mentions it | `None` | `"Not offered"` |

Capability detection is case-insensitive substring matching over `notes`, with
a small synonym set per capability (`SSO` also matches `SAML`; `audit logs`
also matches `audit`). This is a documented heuristic over semi-structured
text, which is why it is isolated in one pure function with tests pinned to the
committed corpus. If a capability's synonyms change, exactly one test fails.

## The Illustrator

`cadence/crew.py` gains `_illustrator()` and `build_visual_crew()`, following
the shape of the existing three agents.

Its task prompt receives the section titles, the scorecard, and the *names* of
the available kinds with one line each on what they show. It returns strict
JSON: `{"kind": ..., "title": ..., "takeaway": ...}`. It is told explicitly
that it must not state figures, because the takeaway renders next to real
numbers and a contradiction there is worse than no takeaway.

## Flow integration

`cadence/flow.py`:

- Seed a fourth `AgentActivity(agent="Illustrator", role="Draws the comparison")`
  alongside the existing three.
- In `_write_sections`, before the section loop: mark the Illustrator working,
  run the visual crew, validate, build points, set `state.visual`, emit state,
  mark done. Then the existing loop runs unchanged.

Running it first means the title block and chart appear the moment the run
resumes, and the prose fills in beneath — a better beat than a chart arriving
last.

**No new `Stage`.** The Illustrator works inside the existing `writing` stage,
so `Stage`, `STAGE_LABEL` and `BriefPipelineCard` are untouched. The pipeline
stays five steps.

## Validation and failure modes

The visual is an enhancement, never a reason to lose a brief.

| failure | handling |
|---|---|
| unknown or missing `kind` | fall back to `tier-ladder` |
| unparseable JSON | fall back to `tier-ladder`, empty `takeaway` |
| `takeaway` longer than ~160 chars | truncate on a word boundary |
| builder yields fewer than 2 points | drop the visual, `state.visual = None` |
| crew raises | log, `state.visual = None`, continue to the sections |

The frontend renders nothing when `visual` is `None`, exactly as it does today.

## Frontend

`web/app/components/panels.tsx`:

- `BriefDoc` grows a title block: eyebrow `COMPETITIVE BRIEF`, the target as an
  h1, then a subtitle line carrying axis, section count and Copy markdown. The
  existing verdict blockquote follows, then the hero visual, then the sections.
- A new `HeroVisual` renders inline SVG from `BriefVisual`. Horizontal bars,
  scaled to the largest numeric `value`; non-numeric points render as a
  dashed-outline slot with their `display` string, so "Not offered" is visibly
  different from a bar of length zero.
- Colour comes from tokens only, so both themes work with no extra code.
  `ours` rows take `--agent`; everything else uses the neutral bar treatment.
  Threat colours are **not** reused here — those mean threat level on the
  scorecard, and this chart is not a threat readout.
- Long tier labels (`"Platform + Analytics"`) truncate with ellipsis.

`crew · 3 agents` in the brand bar becomes `crew · 4 agents`.

## Testing

`agent/tests/test_visuals.py`, in the style of the existing `test_parsing.py`:

- `build_tier_ladder("pulsegrid")` returns the six known tiers with Northstar
  rows flagged `ours`, sorted, `None` last.
- `build_gate_ladder` returns four points and covers all three states against
  the committed corpus: priced (Pulsegrid SSO `$499`, Northstar SSO `$199`),
  custom (Beacon SSO `Custom`, Northstar audit logs `Custom` — both sit on
  `monthly_usd: null` Enterprise tiers), absent (Pulsegrid audit logs
  `Not offered`).
- Kind validation: unknown kind falls back to `tier-ladder`.
- Every competitor slug yields at least 2 points for both kinds — the
  regression test for the Beacon class of bug.

Frontend is verified by running the app in both themes, as with previous changes.

## Blast radius

| file | change |
|---|---|
| `agent/cadence/state.py` | `VisualPoint`, `BriefVisual`, `BriefState.visual` |
| `agent/cadence/visuals.py` | new, pure builders |
| `agent/cadence/crew.py` | `_illustrator`, `build_visual_crew` |
| `agent/cadence/flow.py` | seed 4th agent, run + validate before sections |
| `agent/tests/test_visuals.py` | new |
| `web/app/lib/types.ts` | mirror the new types |
| `web/app/components/panels.tsx` | title block, `HeroVisual`, pill 3 -> 4 |
| `README.md` | capability table row, layout tree, crew description |

Nothing asserts crew size today: `verify_stream.py` does not check it and
`test_parsing.py` covers parsing only. The count appears in exactly one UI
string.

## Out of scope

- Per-section visuals.
- A capability matrix. Those facts live in prose `pages`, not structured
  fields, so the values would have to come from the model.
- Re-recording the demo videos. Separate step once this is reviewed on screen.
