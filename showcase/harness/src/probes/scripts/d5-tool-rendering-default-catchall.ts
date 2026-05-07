/**
 * D5 — `tool-rendering-default-catchall` script.
 *
 * Phase-2A split (see `.claude/specs/lgp-test-genuine-pass.md`): the old
 * mapping pointed `tool-rendering-default-catchall` at the
 * `d5-tool-rendering.ts` probe, which asserts a per-tool `WeatherCard`
 * — the WRONG signal for the default catchall. The default catchall is
 * CopilotKit's BUILT-IN renderer that fires for ANY tool the user
 * doesn't explicitly handle. The probe must therefore assert the
 * built-in renderer's testid contract, NOT the per-tool card.
 *
 * Built-in default-catchall testid contract (Phase-1E production code):
 *   - container: `[data-testid="copilot-tool-render"]`
 *   - per-call:  `[data-tool-name="<tool_name>"]` attribute
 *   - status:    a status pill child element with one of the
 *                lifecycle states (`pending` | `executing` | `complete`).
 *
 * The probe drives `/demos/tool-rendering-default-catchall` with a
 * weather prompt (the default-catchall demo uses `get_weather` as its
 * canonical tool — same fixture as `tool-rendering`), then asserts
 * the built-in renderer rendered the tool call with the expected
 * `data-tool-name` and a status pill.
 *
 * Side effect: importing this module triggers `registerD5Script`. The
 * default loader in `e2e-deep.ts` discovers it via the `d5-*` filename
 * convention.
 */

import {
  registerD5Script,
  type D5BuildContext,
} from "../helpers/d5-registry.js";
import type { ConversationTurn, Page } from "../helpers/conversation-runner.js";

/**
 * Tool name the demo's built-in catchall fires for. Aligns with
 * `tool-rendering.json` fixture (`get_weather`).
 */
export const EXPECTED_TOOL_NAME = "get_weather";

/**
 * Container selector for the built-in catchall renderer. Phase-1E
 * production code wires this testid on the wrapper element.
 */
export const CATCHALL_CONTAINER_TESTID = "copilot-tool-render";

/**
 * Status-pill testid prefix exposed by the built-in renderer. The pill
 * carries one of: pending / executing / complete. We assert ANY of
 * these is present — a "no pill at all" outcome means the renderer
 * regressed.
 */
export const STATUS_PILL_TESTIDS = [
  "tool-status-pending",
  "tool-status-executing",
  "tool-status-complete",
] as const;

/** Total time we'll poll for the renderer to settle, in ms. */
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

/** Snapshot read in a single page.evaluate round-trip. */
export interface DefaultCatchallProbe {
  /** True when at least one container with the matching tool name is present. */
  containerWithToolName: boolean;
  /** True when at least one status-pill testid (any state) is present. */
  statusPillPresent: boolean;
  /** Diagnostic: the data-tool-name values found on rendered containers. */
  observedToolNames: string[];
}

export async function probeDefaultCatchall(
  page: Page,
): Promise<DefaultCatchallProbe> {
  return await page.evaluate(() => {
    const win = globalThis as unknown as {
      document: {
        querySelectorAll(sel: string): ArrayLike<{
          getAttribute(name: string): string | null;
          querySelector(sel: string): unknown;
        }>;
        querySelector(sel: string): unknown;
      };
    };
    const containers = win.document.querySelectorAll(
      '[data-testid="copilot-tool-render"]',
    );
    const observedToolNames: string[] = [];
    let containerWithToolName = false;
    for (let i = 0; i < containers.length; i++) {
      const c = containers[i]!;
      const name = c.getAttribute("data-tool-name");
      if (name) observedToolNames.push(name);
      if (name === "get_weather") containerWithToolName = true;
    }
    // Status pill: check any of the lifecycle testids anywhere in the doc.
    const statusPillPresent =
      !!win.document.querySelector('[data-testid="tool-status-pending"]') ||
      !!win.document.querySelector('[data-testid="tool-status-executing"]') ||
      !!win.document.querySelector('[data-testid="tool-status-complete"]');
    return { containerWithToolName, statusPillPresent, observedToolNames };
  });
}

/** Validate a snapshot against the built-in catchall contract. */
export function validateDefaultCatchall(
  snap: DefaultCatchallProbe,
): string | null {
  if (!snap.containerWithToolName) {
    return (
      `tool-rendering-default-catchall: expected [data-testid="${CATCHALL_CONTAINER_TESTID}"] ` +
      `with [data-tool-name="${EXPECTED_TOOL_NAME}"]; observed tool names: ` +
      (snap.observedToolNames.length === 0
        ? "(none)"
        : snap.observedToolNames.join(", "))
    );
  }
  if (!snap.statusPillPresent) {
    return (
      "tool-rendering-default-catchall: container present but no status pill " +
      `(any of ${STATUS_PILL_TESTIDS.join(", ")}) — built-in renderer regressed`
    );
  }
  return null;
}

export async function assertDefaultCatchall(
  page: Page,
  timeoutMs: number = POLL_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;
  let pollCount = 0;
  while (Date.now() < deadline) {
    const snap = await probeDefaultCatchall(page);
    pollCount++;
    lastError = validateDefaultCatchall(snap);
    if (lastError === null) {
      console.debug(
        "[d5-tool-rendering-default-catchall] all checks passed",
        { pollCount, snap },
      );
      return;
    }
    if (pollCount === 1 || pollCount % 10 === 0) {
      console.debug(
        "[d5-tool-rendering-default-catchall] not ready yet",
        { pollCount, lastError, snap },
      );
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    lastError ?? "tool-rendering-default-catchall: poll deadline exceeded",
  );
}

export function buildTurns(_ctx: D5BuildContext): ConversationTurn[] {
  return [
    {
      input: "weather in Tokyo",
      assertions: assertDefaultCatchall,
    },
  ];
}

/**
 * Override the default `/demos/<featureType>` route. The hyphenated
 * featureType resolves verbatim to `/demos/tool-rendering-default-catchall`,
 * which IS the canonical demo route — but the override is registered
 * for symmetry with the rest of the family and to make the route
 * explicit when scanning the registry.
 */
export function preNavigateRoute(): string {
  return "/demos/tool-rendering-default-catchall";
}

registerD5Script({
  featureTypes: ["tool-rendering-default-catchall"],
  fixtureFile: "tool-rendering.json",
  buildTurns,
  preNavigateRoute,
});
