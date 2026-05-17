import { describe, expect, it } from "vitest";
import { procgenGameplayConfig } from "./PlayableLevelService";

describe("procgenGameplayConfig", () => {
  it("keeps generated difficulty inside the authored 20-step range", () => {
    expect(procgenGameplayConfig(16).progressionLevel).toBe(20);
    expect(procgenGameplayConfig(17).progressionLevel).toBe(18);
    expect(procgenGameplayConfig(18).progressionLevel).toBe(19);
    expect(procgenGameplayConfig(19).progressionLevel).toBe(20);
    expect(procgenGameplayConfig(20).progressionLevel).toBe(18);
    expect(procgenGameplayConfig(21).progressionLevel).toBe(19);
  });

  it("uses the cycled difficulty for generated course size", () => {
    expect(procgenGameplayConfig(21).maxTiles).toBe(16 + 19 * 5);
    expect(procgenGameplayConfig(21).displayTargetDifficulty).toBe(19);
  });
});
