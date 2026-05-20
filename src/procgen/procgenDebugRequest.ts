import type { GenerateMapRequest } from "./MapGenerationTypes";

export const PROCGEN_DEBUG_MIN_DIFFICULTY = 1;
export const PROCGEN_DEBUG_MAX_DIFFICULTY = 20;
export const PROCGEN_DEBUG_DEFAULT_DIFFICULTY = 6;

export function normalizeProcgenDebugDifficulty(
  value: number | undefined,
  fallback = PROCGEN_DEBUG_DEFAULT_DIFFICULTY,
): number {
  const candidate = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.max(
    PROCGEN_DEBUG_MIN_DIFFICULTY,
    Math.min(PROCGEN_DEBUG_MAX_DIFFICULTY, Math.round(candidate)),
  );
}

export function procgenDebugMaxTilesForDifficulty(targetDifficulty: number): number {
  const difficulty = normalizeProcgenDebugDifficulty(targetDifficulty);
  return 16 + difficulty * 5;
}

export function createProcgenDebugRequest(
  seed: string,
  targetDifficulty: number,
): GenerateMapRequest {
  const difficulty = normalizeProcgenDebugDifficulty(targetDifficulty);
  return {
    seed,
    levelIndex: difficulty,
    targetDifficulty: difficulty,
    maxTiles: procgenDebugMaxTilesForDifficulty(difficulty),
    allowRamps: difficulty >= 3,
    allowCurves: difficulty >= 2,
  };
}
