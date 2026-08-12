import {
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotEndpointSingleRoute,
} from "@copilotkit/runtime/v2";
import { CrewAIAgent } from "@ag-ui/crewai";
import { handle } from "hono/vercel";
import type { AbstractAgent } from "@ag-ui/client";

const AGENT_URL = process.env.CADENCE_AGENT_URL ?? "http://localhost:8000";

const runtime = new CopilotRuntime({
  agents: {
    // The main demo: the brief pipeline, with a real interrupt at the outline.
    brief: new CrewAIAgent({ url: `${AGENT_URL}/brief` }),
    // CrewAI Conversational Flows, routed per turn by CrewAI's own graph.
    concierge: new CrewAIAgent({ url: `${AGENT_URL}/concierge` }),
  } as Record<string, AbstractAgent>,
  runner: new InMemoryAgentRunner(),
  // Enabling A2UI is what makes the runtime forward `injectA2UITool`, which is
  // the signal the Python side checks before offering the generate_a2ui tool.
  // Without this, the flow's plan_a2ui_injection() correctly declines to inject.
  a2ui: { agents: ["brief"] },
});

const app = createCopilotEndpointSingleRoute({
  runtime,
  basePath: "/api/copilotkit",
});

const handler = handle(app);

export const POST = handler;
export const GET = handler;
