import { describe, it, expect } from "vitest";
import { getD5Script, type D5BuildContext } from "../helpers/d5-registry.js";
import type { Page } from "../helpers/conversation-runner.js";
import {
  buildTurns,
  buildDeclarativeAssertion,
  preNavigateRoute,
  GEN_UI_DECLARATIVE_PILLS,
} from "./d5-gen-ui-declarative.js";

function makePage(state: {
  card?: boolean;
  metric?: boolean;
  statusBadge?: boolean;
  pieChart?: boolean;
  barChart?: boolean;
}): Page {
  const filled = {
    card: false,
    metric: false,
    statusBadge: false,
    pieChart: false,
    barChart: false,
    ...state,
  };
  return {
    async waitForSelector() {},
    async fill() {},
    async press() {},
    async evaluate<R>() {
      return filled as unknown as R;
    },
  };
}

describe("d5-gen-ui-declarative script", () => {
  it("registers under featureType 'gen-ui-declarative'", () => {
    const script = getD5Script("gen-ui-declarative");
    expect(script).toBeDefined();
    expect(script?.fixtureFile).toBe("gen-ui-declarative.json");
  });

  it("preNavigateRoute resolves /demos/declarative-gen-ui", () => {
    expect(preNavigateRoute("gen-ui-declarative")).toBe(
      "/demos/declarative-gen-ui",
    );
  });

  it("buildTurns produces four per-pill turns mirroring suggestions.ts", () => {
    const ctx: D5BuildContext = {
      integrationSlug: "x",
      featureType: "gen-ui-declarative",
      baseUrl: "https://x.test",
    };
    const turns = buildTurns(ctx);
    expect(turns).toHaveLength(4);
    expect(turns[0]!.input).toContain("KPI dashboard");
    expect(turns[1]!.input).toContain("pie chart");
    expect(turns[2]!.input).toContain("bar chart");
    expect(turns[3]!.input).toContain("status report");
  });

  it("GEN_UI_DECLARATIVE_PILLS covers all four catalog families", () => {
    const tags = GEN_UI_DECLARATIVE_PILLS.map((p) => p.tag);
    expect(tags).toEqual([
      "kpi-dashboard",
      "pie-chart",
      "bar-chart",
      "status-report",
    ]);
  });

  it("kpi-dashboard assertion succeeds when card is present", async () => {
    const assertion = buildDeclarativeAssertion("kpi-dashboard", [
      "declarative-card",
      "declarative-metric",
    ]);
    const page = makePage({ card: true });
    await expect(assertion(page)).resolves.toBeUndefined();
  });

  it("pie-chart assertion succeeds when pie-chart testid is present", async () => {
    const assertion = buildDeclarativeAssertion("pie-chart", [
      "declarative-pie-chart",
    ]);
    const page = makePage({ pieChart: true });
    await expect(assertion(page)).resolves.toBeUndefined();
  });

  it("assertion fails when evaluate keeps reporting all-false past deadline", async () => {
    const assertion = buildDeclarativeAssertion("kpi-dashboard", [
      "declarative-card",
      "declarative-metric",
    ]);
    let calls = 0;
    const fastPage: Page = {
      async waitForSelector() {},
      async fill() {},
      async press() {},
      async evaluate<R>() {
        calls += 1;
        if (calls > 3) throw new Error("simulated probe abort");
        return {
          card: false,
          metric: false,
          statusBadge: false,
          pieChart: false,
          barChart: false,
        } as unknown as R;
      },
    };
    await expect(assertion(fastPage)).rejects.toThrow();
  });

  it("buildDeclarativeAssertion throws on unknown expected testid", () => {
    expect(() =>
      buildDeclarativeAssertion("bad-pill", [
        "declarative-card",
        "definitely-unknown",
      ]),
    ).toThrow(/unknown expected testid/);
  });
});
