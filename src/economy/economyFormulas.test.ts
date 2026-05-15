import { describe, expect, it } from "vitest";
import { parStreakBonusCoins } from "./economyFormulas";

describe("parStreakBonusCoins", () => {
  it("returns 0 for non-positive streak length", () => {
    expect(parStreakBonusCoins(0)).toBe(0);
    expect(parStreakBonusCoins(-1)).toBe(0);
  });

  it("grants 3, 4, 5 coins for streak lengths 1, 2, 3", () => {
    expect(parStreakBonusCoins(1)).toBe(3);
    expect(parStreakBonusCoins(2)).toBe(4);
    expect(parStreakBonusCoins(3)).toBe(5);
  });
});
