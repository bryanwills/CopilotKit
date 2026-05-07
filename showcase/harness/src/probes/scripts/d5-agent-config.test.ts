import { describe, it, expect } from "vitest";
import { getD5Script, type D5BuildContext } from "../helpers/d5-registry.js";
import type { Page } from "../helpers/conversation-runner.js";
import {
  buildTurns,
  buildKnobDiffAssertion,
  AGENT_CONFIG_PROBES,
  RESPONSE_LENGTH_DELTA_MIN,
} from "./d5-agent-config.js";

function makePage(transcript: string): Page {
  return {
    async waitForSelector() {},
    async fill() {},
    async press() {},
    async evaluate<R>() {
      return transcript as unknown as R;
    },
  };
}

describe("d5-agent-config script", () => {
  it("registers under featureType 'agent-config'", () => {
    const script = getD5Script("agent-config");
    expect(script).toBeDefined();
    expect(script?.featureTypes).toEqual(["agent-config"]);
    expect(script?.fixtureFile).toBe("agent-config.json");
  });

  it("buildTurns produces 6 turns covering 3 knob pairs", () => {
    const ctx: D5BuildContext = {
      integrationSlug: "langgraph-python",
      featureType: "agent-config",
      baseUrl: "https://x.test",
    };
    const turns = buildTurns(ctx);
    expect(turns).toHaveLength(6);
    const inputs = turns.map((t) => t.input);
    expect(inputs[0]).toContain("tone:professional");
    expect(inputs[1]).toContain("tone:casual");
    expect(inputs[2]).toContain("expertise:beginner");
    expect(inputs[3]).toContain("expertise:expert");
    expect(inputs[4]).toContain("responseLength:concise");
    expect(inputs[5]).toContain("responseLength:detailed");
  });

  it("AGENT_CONFIG_PROBES covers tone / expertise / responseLength", () => {
    const knobs = AGENT_CONFIG_PROBES.map((p) => p.knob);
    expect(knobs).toEqual(["tone", "expertise", "responseLength"]);
  });

  it("text-diff assertion succeeds when A and B responses differ", async () => {
    const snapshotA = { text: "Greetings. Professional tone." };
    const assertion = buildKnobDiffAssertion("tone", "text", snapshotA);
    // Simulate concatenated transcript A + B.
    const page = makePage(
      "Greetings. Professional tone. Hey! Casual mode here.",
    );
    await expect(assertion(page)).resolves.toBeUndefined();
  });

  it("text-diff assertion fails when value-A transcript was empty", async () => {
    const snapshotA = { text: "" };
    const assertion = buildKnobDiffAssertion("tone", "text", snapshotA);
    const page = makePage("anything");
    await expect(assertion(page)).rejects.toThrow(/value-A.*empty/);
  });

  it("text-diff assertion fails when B contains no new content", async () => {
    const snapshotA = { text: "same response" };
    const assertion = buildKnobDiffAssertion("tone", "text", snapshotA);
    const page = makePage("same response");
    await expect(assertion(page)).rejects.toThrow(/no new transcript/);
  });

  it("length-diff assertion succeeds when B exceeds A by threshold", async () => {
    const aText = "short concise reply.";
    const snapshotA = { text: aText };
    const assertion = buildKnobDiffAssertion(
      "responseLength",
      "length",
      snapshotA,
    );
    const longB = "x".repeat(aText.length + RESPONSE_LENGTH_DELTA_MIN + 10);
    const page = makePage(`${aText} ${longB}`);
    await expect(assertion(page)).resolves.toBeUndefined();
  });

  it("length-diff assertion fails when B is barely longer than A", async () => {
    const aText = "short concise reply.";
    const snapshotA = { text: aText };
    const assertion = buildKnobDiffAssertion(
      "responseLength",
      "length",
      snapshotA,
    );
    const shortB = "x".repeat(aText.length + 10); // delta well below threshold
    const page = makePage(`${aText} ${shortB}`);
    await expect(assertion(page)).rejects.toThrow(/chars longer/);
  });
});
