import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultHudState } from "./UiState";

describe("UiState", () => {
  it("creates serializable HUD defaults for DOM and MHS adapters", () => {
    const state = defaultHudState();

    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state.level).toBe(1);
    expect(state.skip.visible).toBe(false);
    expect(state.power01).toBeNull();
  });

  it("keeps the UI state contract independent from DOM adapters", () => {
    const source = readFileSync("src/ui/UiState.ts", "utf8");

    expect(source).not.toContain("./Hud");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
  });
});
