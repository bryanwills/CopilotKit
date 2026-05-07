import { describe, it, expect } from "vitest";
import { getD5Script, type D5BuildContext } from "../helpers/d5-registry.js";
import type { Page } from "../helpers/conversation-runner.js";
import {
  buildTurns,
  buildStreamingAssertion,
  SHARED_STATE_STREAMING_PILLS,
  STREAMING_MIN_FINAL_CHARS,
} from "./d5-shared-state-streaming.js";

function makePage(state: { charCount: number; liveBadgePresent: boolean }): Page {
  return {
    async waitForSelector() {},
    async fill() {},
    async press() {},
    async evaluate<R>() {
      return state as unknown as R;
    },
  };
}

describe("d5-shared-state-streaming script", () => {
  it("registers under featureType 'shared-state-streaming'", () => {
    const script = getD5Script("shared-state-streaming");
    expect(script).toBeDefined();
    expect(script?.fixtureFile).toBe("shared-state-streaming.json");
  });

  it("buildTurns produces three per-pill turns mirroring suggestions.ts", () => {
    const ctx: D5BuildContext = {
      integrationSlug: "x",
      featureType: "shared-state-streaming",
      baseUrl: "https://x.test",
    };
    const turns = buildTurns(ctx);
    expect(turns).toHaveLength(3);
    expect(turns[0]!.input).toContain("poem about autumn leaves");
    expect(turns[1]!.input).toContain("declining a meeting");
    expect(turns[2]!.input).toContain("quantum computing");
  });

  it("SHARED_STATE_STREAMING_PILLS lists three tags", () => {
    expect(SHARED_STATE_STREAMING_PILLS.map((p) => p.tag)).toEqual([
      "autumn-poem",
      "decline-email",
      "quantum-explainer",
    ]);
  });

  it("assertion succeeds when document content meets the threshold", async () => {
    const assertion = buildStreamingAssertion("autumn-poem");
    const page = makePage({
      charCount: STREAMING_MIN_FINAL_CHARS + 20,
      liveBadgePresent: false,
    });
    await expect(assertion(page)).resolves.toBeUndefined();
  });

  it("assertion fails when document content stays too short", async () => {
    const assertion = buildStreamingAssertion("autumn-poem");
    let calls = 0;
    const page: Page = {
      async waitForSelector() {},
      async fill() {},
      async press() {},
      async evaluate<R>() {
        calls += 1;
        if (calls > 3) throw new Error("simulated abort");
        return { charCount: 10, liveBadgePresent: false } as unknown as R;
      },
    };
    await expect(assertion(page)).rejects.toThrow();
  });
});
