"""Flow state for Cadence.

Everything the canvas renders lives here. The bridge emits this as an AG-UI
``STATE_SNAPSHOT`` on every method finish, and progressively via
``copilotkit_emit_state`` while the Writer works — snapshots, not deltas,
because ``get_capabilities()`` reports ``state.deltas: false``.
"""

from typing import Any, Literal, Optional

from ag_ui_crewai import CopilotKitState
from pydantic import BaseModel, ConfigDict, Field

Stage = Literal["idle", "intake", "research", "awaiting_approval", "writing", "done"]


class Finding(BaseModel):
    """One sourced claim the Researcher pulled out of the corpus."""

    source: str
    claim: str
    competitor: str


class Section(BaseModel):
    """A section of the brief. ``body`` fills in while the Writer streams."""

    key: str
    title: str
    status: Literal["pending", "writing", "done"] = "pending"
    body: str = ""


class AgentActivity(BaseModel):
    """Per-agent progress, so the UI can attribute work to a crew member."""

    agent: str
    role: str
    status: Literal["idle", "working", "done"] = "idle"
    detail: str = ""


class Scorecard(BaseModel):
    """Analyst output: how the target compares to us on each axis."""

    competitor: str
    pricing_pressure: int = 0
    governance: int = 0
    time_to_value: int = 0
    verdict: str = ""


class BriefState(CopilotKitState):
    """The brief under construction.

    ``ag_ui`` and ``context`` are adapter-owned keys the endpoint spreads into
    flow state. ``FlowState`` is a plain pydantic model, so undeclared keys are
    dropped — declaring them is what keeps the A2UI component catalog and the
    ``injectA2UITool`` flag reachable from a *typed* state. A2UI silently
    disables itself without this.
    """

    model_config = ConfigDict(populate_by_name=True)

    ag_ui: dict[str, Any] = Field(default_factory=dict, alias="ag-ui")
    context: list[Any] = Field(default_factory=list)

    target: Optional[str] = None
    axis: str = "pricing"
    stage: Stage = "idle"

    crew: list[AgentActivity] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    outline: list[str] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    scorecard: Optional[Scorecard] = None

    # Set when the outline pause is answered, so the UI can show what happened.
    outline_decision: Optional[str] = None
