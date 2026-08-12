"""Parsers must degrade, never raise — a format drift mid-demo should cost a
finding, not the run."""

from cadence.parsing import (
    match_section,
    parse_findings,
    parse_outline,
    parse_scorecard,
    split_sections,
)


class TestParseFindings:
    def test_reads_well_formed_lines(self):
        raw = (
            "1. SOURCE: Beacon /pricing | CLAIM: Growth is $899/mo with annual prepay\n"
            "2. SOURCE: G2 review | CLAIM: Renewal jumped 3x crossing a tier\n"
        )
        findings = parse_findings(raw, "Beacon Analytics")
        assert len(findings) == 2
        assert findings[0].source == "Beacon /pricing"
        assert "$899" in findings[0].claim
        assert findings[0].competitor == "Beacon Analytics"

    def test_tolerates_markdown_emphasis_and_case(self):
        raw = "- **source:** Beacon /docs/limits | **claim:** 1,000 events/sec cap"
        findings = parse_findings(raw, "Beacon")
        assert len(findings) == 1
        assert findings[0].source == "Beacon /docs/limits"
        assert findings[0].claim == "1,000 events/sec cap"

    def test_ignores_prose_without_raising(self):
        assert parse_findings("I looked at their pricing page and it seemed fine.", "X") == []

    def test_handles_empty_input(self):
        assert parse_findings("", "X") == []


class TestParseScorecard:
    def test_reads_scores_and_verdict(self):
        raw = (
            "SCORES: pricing_pressure=4 governance=2 time_to_value=5\n"
            "VERDICT: Cheap and fast, weak on governance.\n"
        )
        card = parse_scorecard(raw, "Pulsegrid")
        assert (card.pricing_pressure, card.governance, card.time_to_value) == (4, 2, 5)
        assert card.verdict == "Cheap and fast, weak on governance."
        assert card.competitor == "Pulsegrid"

    def test_accepts_colon_form_and_scattered_layout(self):
        card = parse_scorecard("pricing_pressure: 3\ngovernance: 5\ntime_to_value: 1", "X")
        assert (card.pricing_pressure, card.governance, card.time_to_value) == (3, 5, 1)

    def test_missing_scores_default_to_zero(self):
        card = parse_scorecard("no scores here", "X")
        assert (card.pricing_pressure, card.governance, card.time_to_value) == (0, 0, 0)
        assert card.verdict == ""

    def test_rejects_out_of_range_scores(self):
        # 9 is outside 1-5 and must not be accepted as a score.
        assert parse_scorecard("pricing_pressure=9", "X").pricing_pressure == 0


class TestParseOutline:
    def test_reads_bullets_after_marker(self):
        raw = (
            "SCORES: pricing_pressure=4 governance=2 time_to_value=5\n"
            "VERDICT: something\n"
            "OUTLINE:\n- Where they beat us\n- Where they are exposed\n- What we do\n"
        )
        assert parse_outline(raw) == [
            "Where they beat us",
            "Where they are exposed",
            "What we do",
        ]

    def test_strips_trailing_rationale(self):
        raw = "OUTLINE:\n- Pricing pressure (because they undercut us)"
        assert parse_outline(raw) == ["Pricing pressure"]

    def test_handles_numbered_lists(self):
        assert parse_outline("OUTLINE:\n1. First\n2) Second") == ["First", "Second"]

    def test_falls_back_to_any_bullets_without_marker(self):
        assert parse_outline("- Alpha\n- Beta") == ["Alpha", "Beta"]

    def test_deduplicates_case_insensitively(self):
        assert parse_outline("OUTLINE:\n- Pricing\n- pricing") == ["Pricing"]

    def test_caps_at_six(self):
        raw = "OUTLINE:\n" + "\n".join(f"- Section {i}" for i in range(12))
        assert len(parse_outline(raw)) == 6

    def test_empty_input_returns_empty(self):
        assert parse_outline("") == []


class TestSplitSections:
    def test_splits_on_headings(self):
        md = "## One\nbody one\n\n## Two\nbody two\n"
        assert split_sections(md) == {"One": "body one", "Two": "body two"}

    def test_ignores_preamble_before_first_heading(self):
        assert split_sections("intro prose\n## One\nbody") == {"One": "body"}

    def test_no_headings_returns_empty(self):
        assert split_sections("just prose") == {}


class TestMatchSection:
    def test_exact_match(self):
        assert match_section("Pricing", {"Pricing": "body"}) == "body"

    def test_tolerates_reworded_heading(self):
        assert match_section("Where they beat us", {"Where They Beat Us!": "body"}) == "body"

    def test_returns_empty_when_absent(self):
        assert match_section("Pricing", {"Governance": "body"}) == ""
