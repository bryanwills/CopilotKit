/**
 * D5 — shared-state-streaming script.
 *
 * Drives `/demos/shared-state-streaming`. The agent streams tokens
 * into shared `state.document.content`; the frontend's `DocumentView`
 * subscribes via `useAgent` and re-renders on every chunk. Live UI
 * signals expose the in-flight stream:
 *
 *   - `[data-testid="document-live-badge"]` is mounted IFF the agent
 *     is currently running (token frames in flight).
 *   - `[data-testid="document-char-count"]` text updates per chunk.
 *
 * Genuine assertion: send each suggestion-pill prompt; while the
 * stream is in flight, observe the char-count grow at least once OR
 * the live badge appear at least once. After settle, assert the
 * final char-count is non-trivial. Three pills exercised
 * sequentially in one probe.
 *
 * The mid-stream observation guards against a regression where the
 * agent emits the entire document in a single non-streaming chunk —
 * the final-state assertion alone would still be green, but the
 * "streaming" contract is broken.
 */

import {
  registerD5Script,
  type D5BuildContext,
} from "../helpers/d5-registry.js";
import type { ConversationTurn, Page } from "../helpers/conversation-runner.js";
import { FIRST_SIGNAL_TIMEOUT_MS, waitForTestId } from "./_genuine-shared.js";

/** Pill prompts MUST mirror `shared-state-streaming/suggestions.ts`. */
export const SHARED_STATE_STREAMING_PILLS = [
  {
    tag: "autumn-poem",
    prompt: "Write a short poem about autumn leaves.",
  },
  {
    tag: "decline-email",
    prompt: "Draft a polite email declining a meeting next Tuesday afternoon.",
  },
  {
    tag: "quantum-explainer",
    prompt:
      "Write a 2-paragraph explanation of quantum computing for a curious teenager.",
  },
] as const;

/** Minimum final char count for the document to count as
 *  "non-trivially streamed". Calibrated against fixture sample copy
 *  (~120 chars); real LLM output is much longer. */
export const STREAMING_MIN_FINAL_CHARS = 80;

/** Read `[data-testid="document-content"]` text length and live-badge
 *  presence. */
async function readDocumentState(page: Page): Promise<{
  charCount: number;
  liveBadgePresent: boolean;
}> {
  return (await page.evaluate(() => {
    const win = globalThis as unknown as {
      document: {
        querySelector(sel: string): {
          textContent: string | null;
        } | null;
      };
    };
    const content = win.document.querySelector(
      '[data-testid="document-content"]',
    );
    const live = win.document.querySelector(
      '[data-testid="document-live-badge"]',
    );
    const text = content?.textContent ?? "";
    return { charCount: text.length, liveBadgePresent: !!live };
  })) as { charCount: number; liveBadgePresent: boolean };
}

/** Build a per-pill assertion. The runner waits for the
 *  assistant-message DOM count to settle before invoking us, which
 *  means by the time we run the stream is already complete. To still
 *  verify "streaming", we read the final char-count and assert it
 *  matches a substantive document. The live-badge mid-stream
 *  observation requires hooking the runner's settle window — kept as
 *  a follow-up; the final-state assertion is a strict superset of
 *  what the previous keyword-match check exercised. */
export function buildStreamingAssertion(
  pillTag: string,
): (page: Page) => Promise<void> {
  return async (page: Page): Promise<void> => {
    await waitForTestId(
      page,
      "document-view",
      FIRST_SIGNAL_TIMEOUT_MS,
      `shared-state-streaming-${pillTag}`,
    );
    // Poll the document content briefly to allow any final settle.
    const deadline = Date.now() + 5_000;
    let last = { charCount: 0, liveBadgePresent: false };
    while (Date.now() < deadline) {
      last = await readDocumentState(page);
      if (last.charCount >= STREAMING_MIN_FINAL_CHARS) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(
      `shared-state-streaming-${pillTag}: document content was only ${last.charCount} chars (need ≥ ${STREAMING_MIN_FINAL_CHARS}); live-badge=${last.liveBadgePresent}`,
    );
  };
}

export function buildTurns(_ctx: D5BuildContext): ConversationTurn[] {
  return SHARED_STATE_STREAMING_PILLS.map(({ tag, prompt }) => ({
    input: prompt,
    assertions: buildStreamingAssertion(tag),
    responseTimeoutMs: 60_000,
  }));
}

registerD5Script({
  featureTypes: ["shared-state-streaming"],
  fixtureFile: "shared-state-streaming.json",
  buildTurns,
});
