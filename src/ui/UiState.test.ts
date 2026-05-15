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
});
