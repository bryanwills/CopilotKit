import { describe, it, expect } from "vitest";
import { getD5Script, type D5BuildContext } from "../helpers/d5-registry.js";
import {
  buildTurns,
  preNavigateRoute,
  REASONING_KEYWORDS,
} from "./d5-reasoning-display.js";

describe("d5-reasoning-display script", () => {
  it("registers under featureType 'reasoning-display'", () => {
    const script = getD5Script("reasoning-display");
    expect(script).toBeDefined();
    expect(script?.featureTypes).toEqual(["reasoning-display"]);
    expect(script?.fixtureFile).toBe("reasoning-display.json");
  });

  it("buildTurns input matches fixture", () => {
    const ctx: D5BuildContext = {
      integrationSlug: "x",
      featureType: "reasoning-display",
      baseUrl: "https://x.test",
    };
    expect(buildTurns(ctx)[0]!.input).toBe("show your reasoning step by step");
  });

  it("preNavigateRoute defaults to /demos/reasoning-custom", () => {
    expect(preNavigateRoute("reasoning-display")).toBe(
      "/demos/reasoning-custom",
    );
  });

  it("preNavigateRoute prefers reasoning-default when only that demo is declared", () => {
    expect(
      preNavigateRoute("reasoning-display", {
        demos: ["reasoning-default"],
      }),
    ).toBe("/demos/reasoning-default");
  });

  it("REASONING_KEYWORDS includes 'reasoning'", () => {
    expect(REASONING_KEYWORDS).toContain("reasoning");
  });
});
