import {
  LevelBuilder,
  adaptProcgenMapToGeneratedLevel,
} from "../level/LevelBuilder";
import type {
  CollectibleSpec,
  GeneratedLevel,
  PlacedTile,
  ProgressionSummary,
} from "../level/LevelTypes";
import { LevelGenerator } from "../level/LevelGenerator";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";
import {
  readProcgenLayoutUrlOverride,
  readProcgenSeedUrlOverride,
  USE_PROCGEN_ENDPOINT,
} from "./Constants";

const LAYOUT_SALT_GLOBAL = "__puttLayoutSalt_v1";

type GlobalWithSalt = typeof globalThis & {
  [LAYOUT_SALT_GLOBAL]?: string;
};

/**
 * Stable for one page load → same level index replays restart/skip reliably;
 * refresh (or ?procgenSeed=) yields a new layout when no override is used.
 */
function getOrCreateLayoutSalt(): string {
  const g = globalThis as GlobalWithSalt;
  const existing = g[LAYOUT_SALT_GLOBAL];
  if (existing) return existing;
  const salt =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `s${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  g[LAYOUT_SALT_GLOBAL] = salt;
  return salt;
}

const PROCGEN_RETRY_COUNT = 4;
const MAX_PROGRESSION_LEVEL = 20;

export interface ProcgenGameplayConfig {
  progressionLevel: number;
  displayTargetDifficulty: number;
  maxTiles: number;
  allowCurves: boolean;
  allowRamps: boolean;
}

export interface GeneratedPlayableLevel {
  level: GeneratedLevel;
  turnCount: number;
  rampCount: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function procgenGameplayConfig(levelIndex: number): ProcgenGameplayConfig {
  const progressionLevel = clamp(Math.round(levelIndex), 1, MAX_PROGRESSION_LEVEL);
  return {
    progressionLevel,
    displayTargetDifficulty: Math.round(
      ((progressionLevel - 1) / (MAX_PROGRESSION_LEVEL - 1)) * 10,
    ),
    maxTiles: 16 + progressionLevel * 5,
    allowCurves: progressionLevel >= 2,
    allowRamps: progressionLevel >= 3,
  };
}

function realmForProgression(level: number): ProgressionSummary {
  if (level >= 16) {
    return {
      level,
      realmId: "starlit_peaks",
      realmName: "Starlit Peaks",
      maxLevel: MAX_PROGRESSION_LEVEL,
      milestoneLevels: [5, 10, 15, 20],
    };
  }
  if (level >= 11) {
    return {
      level,
      realmId: "crystal_courtyard",
      realmName: "Crystal Courtyard",
      maxLevel: MAX_PROGRESSION_LEVEL,
      milestoneLevels: [5, 10, 15, 20],
    };
  }
  if (level >= 6) {
    return {
      level,
      realmId: "mushroom_garden",
      realmName: "Mushroom Garden",
      maxLevel: MAX_PROGRESSION_LEVEL,
      milestoneLevels: [5, 10, 15, 20],
    };
  }
  return {
    level,
    realmId: "sky_meadow",
    realmName: "Sky Meadow",
    maxLevel: MAX_PROGRESSION_LEVEL,
    milestoneLevels: [5, 10, 15, 20],
  };
}

function localToWorld(
  tile: PlacedTile,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const th = tile.rotationY;
  const fx = Math.sin(th);
  const fz = Math.cos(th);
  const rx = Math.cos(th);
  const rz = -Math.sin(th);
  return {
    x: tile.worldX + lx * rx + lz * fx,
    z: tile.worldZ + lx * rz + lz * fz,
  };
}

function countTurns(level: GeneratedLevel): number {
  const spine = level.procgenDebugInfo?.["spinePath"];
  if (Array.isArray(spine)) {
    let turns = 0;
    for (let i = 1; i < spine.length - 1; i++) {
      const a = spine[i - 1] as { x?: unknown; z?: unknown };
      const b = spine[i] as { x?: unknown; z?: unknown };
      const c = spine[i + 1] as { x?: unknown; z?: unknown };
      if (
        typeof a.x === "number" &&
        typeof a.z === "number" &&
        typeof b.x === "number" &&
        typeof b.z === "number" &&
        typeof c.x === "number" &&
        typeof c.z === "number"
      ) {
        const dx1 = b.x - a.x;
        const dz1 = b.z - a.z;
        const dx2 = c.x - b.x;
        const dz2 = c.z - b.z;
        if (dx1 !== dx2 || dz1 !== dz2) turns++;
      }
    }
    return turns;
  }
  return level.tiles.filter((tile) => tile.type === "corner" || tile.type === "curve").length;
}

function parForLevel(level: GeneratedLevel, turns: number, rampCount: number): number {
  const spanScore = Math.ceil(level.tiles.length / 13);
  return clamp(2 + spanScore + Math.ceil(turns / 3) + Math.ceil(rampCount / 4), 2, 9);
}

function challengeId(prefix: "daily" | "weekly", now = new Date()): string {
  if (prefix === "daily") {
    return `${prefix}-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  }
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = Math.floor((now.getTime() - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${prefix}-${now.getUTCFullYear()}-${week}`;
}

function generateCollectibles(
  level: GeneratedLevel,
  rng: () => number,
): CollectibleSpec[] {
  const hazardTiles = new Set(level.hazardSpecs.map((h) => h.tileIndex));
  const stations = level.tiles
    .map((tile) => tile.stationIndex)
    .filter((station): station is number => typeof station === "number");
  const minStation = stations.length > 0 ? Math.min(...stations) : 0;
  const maxStation = stations.length > 0 ? Math.max(...stations) : level.tiles.length - 1;
  const eligible = level.tiles
    .map((tile, tileIndex) => ({ tile, tileIndex }))
    .filter(({ tile, tileIndex }) => {
      const station = tile.stationIndex;
      return (
        tile.type === "straight" &&
        tile.hazardSafe !== false &&
        !tile.isRamp &&
        !hazardTiles.has(tileIndex) &&
        (station === undefined ||
          (station > minStation + 1 && station < maxStation - 1))
      );
    });
  const levelFactor = clamp(level.progressionLevel ?? level.levelIndex, 1, 20);
  const target = Math.min(eligible.length, 1 + Math.floor(levelFactor / 4));
  const out: CollectibleSpec[] = [];
  const usedTiles = new Set<number>();
  for (let i = 0; i < target && usedTiles.size < eligible.length; i++) {
    let pick = eligible[Math.floor(rng() * eligible.length)]!;
    for (let guard = 0; guard < 16 && usedTiles.has(pick.tileIndex); guard++) {
      pick = eligible[Math.floor(rng() * eligible.length)]!;
    }
    if (usedTiles.has(pick.tileIndex)) continue;
    usedTiles.add(pick.tileIndex);
    const lx = (rng() - 0.5) * 2.2;
    const lz = (rng() - 0.5) * 2.4;
    const p = localToWorld(pick.tile, lx, lz);
    out.push({
      id: `coin-${level.id}-${pick.tileIndex}`,
      tileIndex: pick.tileIndex,
      stationIndex: pick.tile.stationIndex,
      x: p.x,
      y: (pick.tile.worldY ?? 0) + 0.32,
      z: p.z,
      value: rng() > 0.86 ? 3 : 1,
    });
  }
  return out;
}

export class PlayableLevelService {
  private levelGenerator: LevelGenerator | null = null;

  private getLegacyGenerator(): LevelGenerator {
    if (!this.levelGenerator) {
      this.levelGenerator = new LevelGenerator();
    }
    return this.levelGenerator;
  }

  generate(levelIndex: number, previousDifficultyScore?: number): GeneratedPlayableLevel {
    const level = USE_PROCGEN_ENDPOINT
      ? this.generateProcgen(levelIndex, previousDifficultyScore)
      : this.getLegacyGenerator().generate(levelIndex, { previousDifficultyScore });
    return this.finalizeLevel(level);
  }

  private generateProcgen(
    levelIndex: number,
    previousDifficultyScore?: number,
  ): GeneratedLevel {
    const config = procgenGameplayConfig(levelIndex);
    const urlSeed = readProcgenSeedUrlOverride();
    const layoutOverride = readProcgenLayoutUrlOverride();
    const seedPrefix = urlSeed
      ? urlSeed.trim()
      : `putt-${levelIndex}-v2-${getOrCreateLayoutSalt()}`;

    for (let attempt = 0; attempt < PROCGEN_RETRY_COUNT; attempt++) {
      const seed =
        attempt === 0 ? seedPrefix : `${seedPrefix}-retry-${attempt}`;
      try {
        const procMap = mapGenerationEndpoint.generateMap({
          seed,
          levelIndex,
          targetDifficulty: config.progressionLevel,
          maxTiles: config.maxTiles,
          allowRamps: config.allowRamps,
          allowCurves: config.allowCurves,
          ...(layoutOverride ? { layout: layoutOverride } : {}),
        });
        return adaptProcgenMapToGeneratedLevel(procMap, {
          levelIndex,
          targetDifficultyRounded: config.displayTargetDifficulty,
          rng: mulberry32(hashSeed(`${seed}|hazards`)),
        });
      } catch (err) {
        console.warn("Procgen gameplay map rejected, retrying", {
          levelIndex,
          seed,
          err,
        });
      }
    }

    const fallback = this.getLegacyGenerator().generate(levelIndex, {
      previousDifficultyScore,
    });
    fallback.imperfectDifficulty = true;
    fallback.procgenDebugInfo = {
      procgenFallback: true,
      attemptedSeed: seedPrefix,
      retryCount: PROCGEN_RETRY_COUNT,
      progressionConfig: config,
    };
    return fallback;
  }

  private finalizeLevel(level: GeneratedLevel): GeneratedPlayableLevel {
    const progressionLevel = level.progressionLevel ?? clamp(level.levelIndex, 1, 20);
    const realm = realmForProgression(progressionLevel);
    const turnCount = countTurns(level);
    const rampCount = level.tiles.filter((tile) => tile.isRamp).length;
    level.progressionLevel = progressionLevel;
    level.realmId = realm.realmId;
    level.progressionSummary = realm;
    level.par = parForLevel(level, turnCount, rampCount);
    level.dailyChallengeId = challengeId("daily");
    level.weeklyChallengeId = challengeId("weekly");
    level.collectibles = generateCollectibles(
      level,
      mulberry32(hashSeed(`${level.procgenSeed ?? level.id}|collectibles`)),
    );
    return { level, turnCount, rampCount };
  }
}

export { LevelBuilder };
