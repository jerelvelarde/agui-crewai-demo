"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-core/v2/styles.css";
import { Workspace } from "./components/workspace";

export default function Page() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="brief"
      // The AG-UI inspector is on by default. It renders a floating button plus
      // CopilotKit product-announcement toasts (in a cpk-web-inspector shadow
      // root, so CSS cannot reach them) which land over the app in screenshots.
      // Flip to true when you want to inspect the event stream live.
      enableInspector={false}
    >
      <Workspace />
    </CopilotKit>
  );
}
