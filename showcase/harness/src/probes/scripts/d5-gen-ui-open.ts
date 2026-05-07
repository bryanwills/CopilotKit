/**
 * D5 — gen-ui-open script.
 *
 * Covers `/demos/open-gen-ui` ONLY. Phase-2A split moved
 * `open-gen-ui-advanced` onto its own probe (`d5-gen-ui-open-advanced.ts`)
 * because the advanced demo's distinguishing signal is iframe presence,
 * which the basic open-shape assertion does not exercise. The two
 * routes are now decoupled and each owns a focused signal.
 */

import {
  registerD5Script,
  type D5BuildContext,
  type D5FeatureType,
  type D5RouteContext,
} from "../helpers/d5-registry.js";
import type { ConversationTurn, Page } from "../helpers/conversation-runner.js";

const TRANSCRIPT_TIMEOUT_MS = 5_000;

async function readAssistantTranscript(page: Page): Promise<string> {
  return (await page.evaluate(() => {
    const win = globalThis as unknown as {
      document: {
        querySelectorAll(
          sel: string,
        ): ArrayLike<{ textContent: string | null }>;
      };
    };
    const sels = [
      '[data-testid="copilot-assistant-message"]',
      '[role="article"]:not([data-message-role="user"])',
      '[data-message-role="assistant"]',
    ];
    let nodes: ArrayLike<{ textContent: string | null }> = { length: 0 };
    for (const s of sels) {
      const f = win.document.querySelectorAll(s);
      if (f.length > 0) {
        nodes = f;
        break;
      }
    }
    let acc = "";
    for (let i = 0; i < nodes.length; i++)
      acc += " " + (nodes[i]!.textContent ?? "");
    return acc.toLowerCase();
  })) as string;
}

function buildKeywordAssertion(
  label: string,
  keywords: readonly string[],
  timeoutMs = TRANSCRIPT_TIMEOUT_MS,
) {
  return async (page: Page): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    let last = "";
    while (Date.now() < deadline) {
      last = await readAssistantTranscript(page);
      if (keywords.some((kw) => last.includes(kw))) return;
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    throw new Error(
      `${label}: transcript missing keyword (any of ${keywords.join(", ")}) — got "${last.slice(0, 200)}"`,
    );
  };
}

export const OPEN_KEYWORDS = ["open gen-ui", "open"] as const;
export const ADVANCED_KEYWORDS = ["advanced"] as const;

export function buildTurns(_ctx: D5BuildContext): ConversationTurn[] {
  return [
    {
      input: "render an open gen-ui element",
      assertions: buildKeywordAssertion("gen-ui-open turn 1", OPEN_KEYWORDS),
    },
    {
      input: "continue the advanced gen-ui flow",
      assertions: buildKeywordAssertion(
        "gen-ui-open turn 2",
        ADVANCED_KEYWORDS,
      ),
    },
  ];
}

/** Always route to /demos/open-gen-ui. The advanced variant moved to
 *  `d5-gen-ui-open-advanced.ts` in Phase-2A; this probe is now scoped
 *  to the basic route only. */
export function preNavigateRoute(
  _ft: D5FeatureType,
  _ctx?: D5RouteContext,
): string {
  return "/demos/open-gen-ui";
}

registerD5Script({
  featureTypes: ["gen-ui-open"],
  fixtureFile: "gen-ui-open.json",
  buildTurns,
  preNavigateRoute,
});
