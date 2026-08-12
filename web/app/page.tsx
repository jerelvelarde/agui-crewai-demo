"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-core/v2/styles.css";
import { Workspace } from "./components/workspace";

export default function Page() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="brief" showDevConsole={false}>
      <Workspace />
    </CopilotKit>
  );
}
