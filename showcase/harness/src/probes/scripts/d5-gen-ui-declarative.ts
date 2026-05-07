/**
 * D5 — gen-ui-declarative script.
 *
 * Drives `/demos/declarative-gen-ui`, where the agent emits A2UI
 * `render_a2ui` payloads and the declarative renderer catalog
 * (Card / StatusBadge / Metric / PieChart / BarChart) materializes
 * them as React components. Each renderer carries a stable testid so
 * the probe can assert which catalog component was actually painted
 * for a given pill.
 *
 * Genuine assertion: send each suggestion-pill prompt; after settle,
 * assert at least one of the catalog testids is present in the DOM.
 * Different pills exercise different subsets of the catalog (KPI
 * dashboard hits Metric + Card; pie-chart pill hits PieChart;
 * bar-chart pill hits BarChart; status-report hits StatusBadge), so
 * a regression that returns the same canned UI for every pill turns
 * the probe red on the second pill.
 *
 * Pill prompts are read from `declarative-gen-ui/suggestions.ts` so
 * the prompts in this probe stay in sync with the demo's pill set.
 */

import {
  registerD5Script,
  type D5BuildContext,
  type D5FeatureType,
} from "../helpers/d5-registry.js";
import type { ConversationTurn, Page } from "../helpers/conversation-runner.js";
import { FIRST_SIGNAL_TIMEOUT_MS } from "./_genuine-shared.js";

/** Default `/demos/<featureType>` would be `/demos/gen-ui-declarative`,
 *  which does not exist — the actual route uses the registry-id
 *  `declarative-gen-ui`. */
export function preNavigateRoute(_ft: D5FeatureType): string {
  return "/demos/declarative-gen-ui";
}

/** Pill prompts MUST mirror `declarative-gen-ui/suggestions.ts`.
 *  Each pill names one or more catalog component testids that
 *  SHOULD render — at least one must be visible after settle. */
export const GEN_UI_DECLARATIVE_PILLS = [
  {
    tag: "kpi-dashboard",
    prompt:
      "Show me a quick KPI dashboard with 3-4 metrics (revenue, signups, churn).",
    expectedTestIds: ["declarative-card", "declarative-metric"] as const,
  },
  {
    tag: "pie-chart",
    prompt: "Show a pie chart of sales by region.",
    expectedTestIds: ["declarative-pie-chart"] as const,
  },
  {
    tag: "bar-chart",
    prompt: "Render a bar chart of quarterly revenue.",
    expectedTestIds: ["declarative-bar-chart"] as const,
  },
  {
    tag: "status-report",
    prompt:
      "Give me a status report on system health — API, database, and background workers.",
    expectedTestIds: ["declarative-status-badge", "declarative-card"] as const,
  },
] as const;

/** Read whether ANY of a known set of declarative testids is present.
 *  All five testids are inlined as literal selectors so the closure
 *  doesn't need to capture arguments — `_beautiful-chat-shared.ts`
 *  uses the same pattern. */
async function readDeclarativeTestIds(page: Page): Promise<{
  card: boolean;
  metric: boolean;
  statusBadge: boolean;
  pieChart: boolean;
  barChart: boolean;
}> {
  return (await page.evaluate(() => {
    const win = globalThis as unknown as {
      document: { querySelector(sel: string): unknown };
    };
    return {
      card: !!win.document.querySelector(
        '[data-testid="declarative-card"]',
      ),
      metric: !!win.document.querySelector(
        '[data-testid="declarative-metric"]',
      ),
      statusBadge: !!win.document.querySelector(
        '[data-testid="declarative-status-badge"]',
      ),
      pieChart: !!win.document.querySelector(
        '[data-testid="declarative-pie-chart"]',
      ),
      barChart: !!win.document.querySelector(
        '[data-testid="declarative-bar-chart"]',
      ),
    };
  })) as {
    card: boolean;
    metric: boolean;
    statusBadge: boolean;
    pieChart: boolean;
    barChart: boolean;
  };
}

const TESTID_TO_KEY: Record<
  string,
  keyof Awaited<ReturnType<typeof readDeclarativeTestIds>>
> = {
  "declarative-card": "card",
  "declarative-metric": "metric",
  "declarative-status-badge": "statusBadge",
  "declarative-pie-chart": "pieChart",
  "declarative-bar-chart": "barChart",
};

/** Build a per-pill assertion. */
export function buildDeclarativeAssertion(
  pillTag: string,
  expectedTestIds: readonly string[],
): (page: Page) => Promise<void> {
  const expectedKeys = expectedTestIds.map((id) => {
    const key = TESTID_TO_KEY[id];
    if (!key) {
      throw new Error(
        `gen-ui-declarative-${pillTag}: unknown expected testid "${id}"`,
      );
    }
    return key;
  });
  return async (page: Page): Promise<void> => {
    const deadline = Date.now() + FIRST_SIGNAL_TIMEOUT_MS;
    let last: Awaited<ReturnType<typeof readDeclarativeTestIds>> = {
      card: false,
      metric: false,
      statusBadge: false,
      pieChart: false,
      barChart: false,
    };
    while (Date.now() < deadline) {
      last = await readDeclarativeTestIds(page);
      if (expectedKeys.some((k) => last[k])) return;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(
      `gen-ui-declarative-${pillTag}: none of [${expectedTestIds.join(", ")}] mounted within ${FIRST_SIGNAL_TIMEOUT_MS}ms`,
    );
  };
}

export function buildTurns(_ctx: D5BuildContext): ConversationTurn[] {
  return GEN_UI_DECLARATIVE_PILLS.map(({ tag, prompt, expectedTestIds }) => ({
    input: prompt,
    assertions: buildDeclarativeAssertion(tag, expectedTestIds),
    responseTimeoutMs: 60_000,
  }));
}

registerD5Script({
  featureTypes: ["gen-ui-declarative"],
  fixtureFile: "gen-ui-declarative.json",
  buildTurns,
  preNavigateRoute,
});
