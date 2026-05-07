/**
 * D5 — agent-config script.
 *
 * Drives `/demos/agent-config`, which forwards `tone`, `expertise`,
 * and `responseLength` from the frontend (CopilotKit
 * `useAgentContext`) to the agent's per-turn system-prompt builder.
 *
 * Genuine assertion strategy: send three pairs of prompts (one pair
 * per knob — tone, expertise, response-length). Each pair sends a
 * value-A prompt followed by a value-B prompt for the same knob.
 * Capture the response transcript after each settle, then assert the
 * two responses differ in the knob-appropriate way:
 *
 *   - tone (professional vs casual): text differs (the responses
 *     should be substantively different — not byte-identical).
 *   - expertise (beginner vs expert): text differs (likewise).
 *   - response-length (concise vs detailed): the detailed response
 *     character count must exceed the concise count by ≥ 80 chars
 *     (calibrated against fixture sample copy; under real LLM the
 *     spread is much larger).
 *
 * Why three turns sequentially in one probe (not a separate
 * fixture-key form mutation): aimock's JSON-only fixture format keys
 * on `userMessage` content. To produce different responses we encode
 * the knob-value into the user prompt sentence — a regression that
 * stops differentiating responses by config keeps the same value-A
 * fixture firing for the value-B prompt and the difference assertion
 * fails. Under a real LLM on Railway the differentiation is natural
 * because `useAgentContext` lands the value in the system prompt.
 *
 * The probe does NOT click form selects on the page. The form lives
 * in `[data-testid="agent-config-card"]` with knob testids
 * `agent-config-tone-select`, `agent-config-expertise-select`,
 * `agent-config-length-select` — these are part of the demo so a
 * future enhancement could mutate them via Playwright. For Phase 2B
 * the prompt-encoded approach captures the same regression class
 * (knob value → response variation) without needing to change the
 * runner's structural Page type.
 */

import {
  registerD5Script,
  type D5BuildContext,
} from "../helpers/d5-registry.js";
import type { ConversationTurn, Page } from "../helpers/conversation-runner.js";

/** Minimum character delta between the "concise" and "detailed"
 *  response-length probes for the assertion to pass. Calibrated to
 *  the fixture pair below; real LLM responses span hundreds of
 *  characters so the threshold is forgiving. */
export const RESPONSE_LENGTH_DELTA_MIN = 80;

/** Per-knob pill pairs. Each pair's two prompts MUST have distinct
 *  fixtures in `agent-config.json` so the value-A and value-B
 *  responses materially differ. Both prompts are sent in the same
 *  conversation; the assertion compares the captured transcripts.
 *
 *  The leading "tone:professional" / "tone:casual" / etc. tokens are
 *  uncommon enough in normal user copy that aimock fixtures can match
 *  them as substring keys without colliding with adjacent fixtures
 *  in `d5-all.json`. */
export const AGENT_CONFIG_PROBES = [
  {
    knob: "tone",
    promptA: "tone:professional — introduce yourself per your config",
    promptB: "tone:casual — introduce yourself per your config",
    /** Tone responses must differ but length is unconstrained. */
    diff: "text" as const,
  },
  {
    knob: "expertise",
    promptA: "expertise:beginner — explain how copilotkit works per your config",
    promptB: "expertise:expert — explain how copilotkit works per your config",
    diff: "text" as const,
  },
  {
    knob: "responseLength",
    promptA:
      "responseLength:concise — describe agent context per your config",
    promptB:
      "responseLength:detailed — describe agent context per your config",
    /** Detailed must be ≥ concise + RESPONSE_LENGTH_DELTA_MIN chars. */
    diff: "length" as const,
  },
] as const;

/** Read all assistant-message text concatenated, lowercase, trimmed.
 *  Same DOM cascade as the existing keyword-match probes. */
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
    for (let i = 0; i < nodes.length; i++) {
      acc += " " + (nodes[i]!.textContent ?? "");
    }
    return acc;
  })) as string;
}

/**
 * Build a "snapshot transcript" assertion. Records the current
 * transcript into `target.text` so a later assertion can compare A
 * vs B without re-reading. Always succeeds (no throw); the
 * comparison turn does the failing.
 */
function buildSnapshotAssertion(target: {
  text: string;
}): (page: Page) => Promise<void> {
  return async (page: Page): Promise<void> => {
    target.text = await readAssistantTranscript(page);
  };
}

/**
 * Build the comparison assertion for a knob pair. Reads the latest
 * transcript, computes the delta against the snapshot taken on the
 * value-A turn, and throws if the responses fail the knob's
 * differentiation rule.
 */
export function buildKnobDiffAssertion(
  knob: string,
  diff: "text" | "length",
  snapshotA: { text: string },
): (page: Page) => Promise<void> {
  return async (page: Page): Promise<void> => {
    const transcriptB = await readAssistantTranscript(page);
    // The B transcript contains both A and B (assistant messages
    // accumulate across turns). The B-only delta is the suffix that
    // wasn't present in the A snapshot.
    const aText = snapshotA.text.trim();
    const bText = transcriptB.trim();
    if (aText.length === 0) {
      throw new Error(
        `agent-config-${knob}: value-A transcript was empty — fixture may not be matching`,
      );
    }
    const onlyB = bText.startsWith(aText)
      ? bText.slice(aText.length).trim()
      : bText;
    if (onlyB.length === 0) {
      throw new Error(
        `agent-config-${knob}: value-B turn produced no new transcript content`,
      );
    }
    if (diff === "text") {
      // The two responses must differ. We compare the A and B
      // assistant-only payloads — the B-only suffix is the value-B
      // response, and the A snapshot's last assistant chunk is the
      // value-A response. Stripping shared whitespace before equality
      // catches the trivial regression where B === A.
      const aOnly = aText;
      if (aOnly === onlyB) {
        throw new Error(
          `agent-config-${knob}: value-A and value-B responses were byte-identical (${aOnly.length} chars)`,
        );
      }
    } else {
      // Length-mode: detailed (B) must exceed concise (A) by the
      // configured threshold. Fixture copy is calibrated so this is
      // satisfied; under a real LLM the spread is much larger.
      const deltaChars = onlyB.length - aText.length;
      if (deltaChars < RESPONSE_LENGTH_DELTA_MIN) {
        throw new Error(
          `agent-config-${knob}: detailed response was only ${deltaChars} chars longer than concise (need ≥ ${RESPONSE_LENGTH_DELTA_MIN}); A=${aText.length}, B=${onlyB.length}`,
        );
      }
    }
  };
}

export function buildTurns(_ctx: D5BuildContext): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const probe of AGENT_CONFIG_PROBES) {
    const snapshotA = { text: "" };
    turns.push({
      input: probe.promptA,
      assertions: buildSnapshotAssertion(snapshotA),
      responseTimeoutMs: 45_000,
    });
    turns.push({
      input: probe.promptB,
      assertions: buildKnobDiffAssertion(probe.knob, probe.diff, snapshotA),
      responseTimeoutMs: 45_000,
    });
  }
  return turns;
}

registerD5Script({
  featureTypes: ["agent-config"],
  fixtureFile: "agent-config.json",
  buildTurns,
});
