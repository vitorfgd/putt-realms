import type { GeneratedMap } from "../procgen/MapGenerationTypes";
import { computeProcgenUndermapQuadSlots } from "../procgen/procgenUndermapQuads";
import type { GeneratedLevel } from "./LevelTypes";
import type { UndermapIslandSlot } from "./undermapIslands";
import { computeUndermapIslandSlots } from "./undermapIslands";

export interface ProcgenUndermapPlacement {
  /** Meshes under the deck — matches {@link ProcgenDebugViewer} map mode. */
  undermapSlots: UndermapIslandSlot[];
  /** Same slots as {@link undermapSlots} — décor must only target pads that have a built island mesh. */
  decorScatterSlots: UndermapIslandSlot[];
  /** True when {@link computeProcgenUndermapQuadSlots} produced at least one pad. */
  usedQuadUndermap: boolean;
}

/**
 * Single source of truth for procgen undermap + décor slot layout (see procgen debug `?procgenDebug`).
 */
export function resolveProcgenUndermapPlacement(
  map: GeneratedMap,
  adapted: GeneratedLevel | null,
): ProcgenUndermapPlacement {
  const quadSlots = computeProcgenUndermapQuadSlots(map);
  const pathSlots = adapted ? computeUndermapIslandSlots(adapted) : [];
  const undermapSlots = quadSlots.length > 0 ? quadSlots : pathSlots;
  /** Path-only slots are not built when quads win — do not scatter décor on “virtual” path pads. */
  const decorScatterSlots = undermapSlots;
  return {
    undermapSlots,
    decorScatterSlots,
    usedQuadUndermap: quadSlots.length > 0,
  };
}
