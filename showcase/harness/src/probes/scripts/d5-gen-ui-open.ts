/**
 * D5 — gen-ui-open script.
 *
 * Covers `/demos/open-gen-ui` (and `/demos/open-gen-ui-advanced` via
 * `preNavigateRoute`). The agent generates a self-contained HTML
 * artifact that the frontend renders inside a sandboxed iframe
 * (`<iframe srcdoc="...">`).
 *
 * Genuine assertion: send the suggestion-pill prompt; after settle,
 * assert at least one `iframe[srcdoc]` mounts AND the srcdoc payload
 * is non-trivial (≥ 100 chars). The DOM-introspection budget for
 * cross-frame content is intentionally limited — `srcdoc` is opaque
 * from the parent frame for security reasons. Asserting the iframe
 * exists with a non-empty srcdoc is the strongest signal we can get
 * without dropping into a same-origin sandbox (which is tracked as a
 * follow-up in the spec).
 */

import {
  registerD5Script,
  type D5BuildContext,
  type D5FeatureType,
  type D5RouteContext,
} from "../helpers/d5-registry.js";
import type { ConversationTurn, Page } from "../helpers/conversation-runner.js";
import { FIRST_SIGNAL_TIMEOUT_MS } from "./_genuine-shared.js";

/** Pill prompt MUST mirror the first suggestion in
 *  `open-gen-ui/suggestions.ts`. The first suggestion is sufficient
 *  for the iframe-mount assertion; per-pill differentiation is
 *  unnecessary because the assertion is "iframe rendered" not
 *  "specific content rendered". */
export const OPEN_GEN_UI_PILL_PROMPT_PREFIX = "Visualize pitch, yaw, and roll";

/** Read the count of mounted `iframe[srcdoc]` elements + the longest
 *  srcdoc payload length seen. Both axes prove the agent emitted a
 *  non-trivial sandbox payload. */
async function readIframeState(page: Page): Promise<{
  iframeCount: number;
  longestSrcdoc: number;
}> {
  return (await page.evaluate(() => {
    const win = globalThis as unknown as {
      document: {
        querySelectorAll(
          sel: string,
        ): ArrayLike<{ getAttribute(name: string): string | null }>;
      };
    };
    const iframes = win.document.querySelectorAll("iframe[srcdoc]");
    let longest = 0;
    for (let i = 0; i < iframes.length; i++) {
      const srcdoc = iframes[i]!.getAttribute("srcdoc") ?? "";
      if (srcdoc.length > longest) longest = srcdoc.length;
    }
    return { iframeCount: iframes.length, longestSrcdoc: longest };
  })) as { iframeCount: number; longestSrcdoc: number };
}

/** Minimum non-trivial srcdoc payload length. Calibrated to the
 *  fixture below (~120 chars). Real LLM output spans thousands of
 *  chars so the threshold is forgiving. */
export const OPEN_GEN_UI_MIN_SRCDOC_LENGTH = 100;

export function buildOpenGenUiAssertion(opts?: {
  timeoutMs?: number;
}): (page: Page) => Promise<void> {
  const timeout = opts?.timeoutMs ?? FIRST_SIGNAL_TIMEOUT_MS;
  return async (page: Page): Promise<void> => {
    const deadline = Date.now() + timeout;
    let last = { iframeCount: 0, longestSrcdoc: 0 };
    while (Date.now() < deadline) {
      last = await readIframeState(page);
      if (
        last.iframeCount > 0 &&
        last.longestSrcdoc >= OPEN_GEN_UI_MIN_SRCDOC_LENGTH
      ) {
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(
      `gen-ui-open: expected ≥ 1 iframe[srcdoc] with srcdoc length ≥ ${OPEN_GEN_UI_MIN_SRCDOC_LENGTH}; saw ${last.iframeCount} iframe(s), longest srcdoc=${last.longestSrcdoc}`,
    );
  };
}

export function buildTurns(_ctx: D5BuildContext): ConversationTurn[] {
  return [
    {
      input: OPEN_GEN_UI_PILL_PROMPT_PREFIX,
      assertions: buildOpenGenUiAssertion(),
      responseTimeoutMs: 90_000,
    },
  ];
}

/** Default to /demos/open-gen-ui-advanced when both demos are declared
 *  (the advanced route covers the basic flow as turn 1). Fallback to
 *  /demos/open-gen-ui when the advanced demo isn't declared. */
export function preNavigateRoute(
  _ft: D5FeatureType,
  ctx?: D5RouteContext,
): string {
  if (ctx?.demos && ctx.demos.includes("open-gen-ui-advanced")) {
    return "/demos/open-gen-ui-advanced";
  }
  return "/demos/open-gen-ui";
}

registerD5Script({
  featureTypes: ["gen-ui-open"],
  fixtureFile: "gen-ui-open.json",
  buildTurns,
  preNavigateRoute,
});
