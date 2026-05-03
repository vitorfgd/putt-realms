/** Integer difficulty score 0–10 from level generator */
export function holeInOneBaseCoins(difficulty: number): number {
  return 10 + difficulty * 2;
}

/**
 * Streak = consecutive levels finished with a hole-in-one (including this hole).
 * First HIO in a chain uses multiplier 1.0; second consecutive uses 1.25, etc.
 */
export function streakMultiplier(streakAfterThisHole: number): number {
  if (streakAfterThisHole >= 5) return 2.0;
  if (streakAfterThisHole === 4) return 1.75;
  if (streakAfterThisHole === 3) return 1.5;
  if (streakAfterThisHole === 2) return 1.25;
  return 1.0;
}

export function computeHoleInOnePayout(
  difficulty: number,
  streakAfterThisHole: number,
): number {
  const base = holeInOneBaseCoins(difficulty);
  const mult = streakMultiplier(streakAfterThisHole);
  return Math.max(1, Math.floor(base * mult));
}

/** Paid skip — waived when level has imperfect difficulty match or stuck-state free skip */
export function skipCostCoins(difficulty: number): number {
  return 5 + difficulty * 5;
}
