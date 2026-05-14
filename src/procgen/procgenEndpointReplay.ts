import type { GeneratedLevel } from "../level/LevelTypes";
import type {
  ProcgenEndpointReplayPayload,
  ProcgenLayoutMode,
} from "./MapGenerationTypes";

function isLayoutMode(x: unknown): x is ProcgenLayoutMode {
  return x === "single_path" || x === "double_row_straight";
}

/** Reads {@link GeneratedLevel.procgenDebugInfo} `endpointReplay` when present (procgen levels only). */
export function readProcgenEndpointReplay(
  level: GeneratedLevel,
): ProcgenEndpointReplayPayload | null {
  const raw = level.procgenDebugInfo?.["endpointReplay"];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const seed = o.seed;
  const levelIndex = o.levelIndex;
  const targetDifficulty = o.targetDifficulty;
  const maxTiles = o.maxTiles;
  const allowRamps = o.allowRamps;
  const allowCurves = o.allowCurves;
  const layout = o.layout;
  if (typeof seed !== "string" || seed.length === 0) return null;
  if (typeof levelIndex !== "number" || !Number.isFinite(levelIndex)) return null;
  if (typeof targetDifficulty !== "number" || !Number.isFinite(targetDifficulty)) {
    return null;
  }
  if (typeof maxTiles !== "number" || !Number.isFinite(maxTiles)) return null;
  if (typeof allowRamps !== "boolean") return null;
  if (typeof allowCurves !== "boolean") return null;
  const out: ProcgenEndpointReplayPayload = {
    seed,
    levelIndex,
    targetDifficulty,
    maxTiles,
    allowRamps,
    allowCurves,
  };
  if (layout !== undefined) {
    if (!isLayoutMode(layout)) return null;
    out.layout = layout;
  }
  return out;
}
