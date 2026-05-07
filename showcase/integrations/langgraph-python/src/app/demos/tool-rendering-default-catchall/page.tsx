"use client";

// Tool Rendering — DEFAULT CATCH-ALL variant (simplest).
//
// This cell is the simplest point in the three-way progression. The
// backend exposes a handful of mock tools (get_weather, search_flights,
// get_stock_price, roll_d20) and the frontend opts into ZERO custom
// renderers — the runtime's built-in `DefaultToolCallRenderer` paints
// every tool call with a stable `[data-testid="copilot-tool-render"]`
// wrapper plus a `data-tool-name="<name>"` attribute.

import React from "react";
import { CopilotKit, CopilotChat } from "@copilotkit/react-core/v2";
import { useSuggestions } from "./suggestions";

export default function ToolRenderingDefaultCatchallDemo() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="tool-rendering-default-catchall"
    >
      <div className="flex justify-center items-center h-screen w-full">
        <div className="h-full w-full max-w-4xl">
          <Chat />
        </div>
      </div>
    </CopilotKit>
  );
}

function Chat() {
  // @region[default-catchall-zero-config]
  // The whole point of this cell: ZERO custom render hooks. The
  // built-in default tool-call renderer paints every tool call.
  useSuggestions();
  // @endregion[default-catchall-zero-config]

  return (
    <CopilotChat
      agentId="tool-rendering-default-catchall"
      className="h-full rounded-2xl"
    />
  );
}
