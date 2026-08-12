"""FastAPI app exposing the Cadence flows over AG-UI."""

import logging
import os

from ag_ui_crewai import add_crewai_flow_fastapi_endpoint, get_capabilities
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

logging.basicConfig(level=os.getenv("CADENCE_LOG_LEVEL", "INFO"))

app = FastAPI(title="Cadence — CopilotKit × CrewAI demo")


def _register() -> None:
    from .conversational import ConciergeFlow
    from .flow import BriefFlow

    # The main demo. emit_interrupt_outcome surfaces the outcome on
    # RUN_FINISHED, which the verification script asserts on.
    add_crewai_flow_fastapi_endpoint(
        app=app,
        flow=BriefFlow(),
        path="/brief",
        emit_interrupt_outcome=True,
    )

    # Conversational Flows, demoed where it is actually the subject: CrewAI's
    # own conversational graph routes each turn. It cannot host the bespoke
    # intake→research→approve→write pipeline above, because opting in installs
    # that graph in place of a hand-authored one.
    add_crewai_flow_fastapi_endpoint(
        app=app,
        flow=ConciergeFlow(),
        path="/concierge",
        conversational=True,
    )


_register()


@app.get("/healthz")
def healthz() -> dict:
    """Liveness plus the runtime capability declaration.

    Handy for the demo: it shows exactly what this install supports, and it is
    where the hardcoded ``humanInTheLoop.interrupts: false`` is visible.
    """
    return {"ok": True, "capabilities": get_capabilities()}


def main() -> None:
    import uvicorn

    uvicorn.run(
        "cadence.server:app",
        host=os.getenv("CADENCE_HOST", "0.0.0.0"),
        port=int(os.getenv("CADENCE_PORT", "8008")),
        reload=bool(os.getenv("CADENCE_RELOAD")),
    )


if __name__ == "__main__":
    main()
