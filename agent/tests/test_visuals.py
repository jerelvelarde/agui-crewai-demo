"""The hero visual's figures come from the corpus, so these pin them to it.

If a tier's price or wording changes, these fail loudly rather than letting the
chart drift away from the prose beside it.
"""

from cadence import corpus, visuals


def _by_label(points):
    return {p.label: p for p in points}


class TestTierLadder:
    def test_covers_both_products_cheapest_first(self):
        points, caption = visuals.build_tier_ladder("pulsegrid")

        assert len(points) == 6  # 3 Pulsegrid tiers + 3 Northstar
        priced = [p.value for p in points if p.value is not None]
        assert priced == sorted(priced), "priced tiers should ascend"
        assert all(p.value is None for p in points[len(priced) :]), "contact-us tiers last"
        assert caption

    def test_flags_our_own_rows(self):
        points, _ = visuals.build_tier_ladder("pulsegrid")

        assert {p.ours for p in points} == {True, False}
        assert all(p.label.startswith("Northstar") for p in points if p.ours)

    def test_contact_us_tier_has_no_invented_price(self):
        points, _ = visuals.build_tier_ladder("pulsegrid")
        enterprise = _by_label(points)["Northstar Enterprise"]

        assert enterprise.value is None, "must not be plotted as zero"
        assert enterprise.display == "Custom"


class TestGateLadder:
    def test_one_point_per_capability_per_product(self):
        points, caption = visuals.build_gate_ladder("pulsegrid")

        assert len(points) == 4
        assert caption

    def test_resolves_a_priced_gate(self):
        points = _by_label(visuals.build_gate_ladder("pulsegrid")[0])

        assert points["Pulsegrid · SSO"].value == 499
        assert points["Northstar · SSO"].value == 199

    def test_absent_capability_is_not_offered(self):
        """Pulsegrid ships audit logging on no plan at all — a real finding."""
        points = _by_label(visuals.build_gate_ladder("pulsegrid")[0])

        assert points["Pulsegrid · Audit logs"].display == "Not offered"
        assert points["Pulsegrid · Audit logs"].value is None

    def test_sales_only_gate_is_custom(self):
        """Beacon gates SSO behind a null-priced Enterprise tier.

        This is the case that ruled out a price-based positioning map.
        """
        points = _by_label(visuals.build_gate_ladder("beacon")[0])

        assert points["Beacon Analytics · SSO"].display == "Custom"
        assert points["Beacon Analytics · SSO"].value is None

    def test_saml_counts_as_sso(self):
        """Pulsegrid's notes say SAML, never the letters SSO on that tier."""
        assert "saml" in visuals.CAPABILITIES[0][1]
        points = _by_label(visuals.build_gate_ladder("pulsegrid")[0])

        assert points["Pulsegrid · SSO"].display == "$499"


class TestEveryCompetitorIsPlottable:
    def test_all_slugs_yield_a_usable_chart(self):
        """The regression guard for the Beacon class of bug."""
        for slug in corpus.all_slugs():
            for kind in visuals.VISUAL_KINDS:
                points, _ = visuals.build_points(kind, slug)
                assert len(points) >= 2, f"{slug}/{kind} produced {len(points)} points"


class TestModelInputIsDistrusted:
    def test_unknown_kind_falls_back(self):
        assert visuals.coerce_kind("pie-chart") == visuals.DEFAULT_KIND
        assert visuals.coerce_kind(None) == visuals.DEFAULT_KIND
        assert visuals.coerce_kind({"kind": "tier-ladder"}) == visuals.DEFAULT_KIND

    def test_known_kind_survives(self):
        assert visuals.coerce_kind(" gate-ladder ") == "gate-ladder"

    def test_takeaway_is_clamped_on_a_word_boundary(self):
        clamped = visuals.clamp_takeaway("word " * 100)

        assert len(clamped) <= 161
        assert clamped.endswith("…")
        assert "  " not in clamped

    def test_short_takeaway_is_untouched(self):
        assert visuals.clamp_takeaway("  SSO costs them   10x more. ") == "SSO costs them 10x more."

    def test_unknown_target_yields_no_visual(self):
        assert visuals.build_visual("tier-ladder", "t", "x", "nobody") is None

    def test_missing_title_falls_back_to_the_matchup(self):
        visual = visuals.build_visual("gate-ladder", "", "", "pulsegrid")

        assert visual is not None
        assert visual.title == "Pulsegrid vs Northstar"
