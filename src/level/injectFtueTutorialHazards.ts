import { hazardWeight } from "../hazards/HazardTypes";
import type { HazardSpawnSpec, PlacedTile } from "./LevelTypes";

function reservedTileIndices(specs: readonly HazardSpawnSpec[]): Set<number> {
  const s = new Set<number>();
  for (const h of specs) {
    s.add(h.tileIndex);
  }
  return s;
}

/**
 * Curated first-hole teaching: guarantee one bumper mushroom on an early straight tile
 * when procgen built the tutorial map. Skips tiles already used by portals.
 */
export function injectFtueTutorialMushroom(
  tiles: readonly PlacedTile[],
  hazardSpecs: HazardSpawnSpec[],
): HazardSpawnSpec[] {
  const reserved = reservedTileIndices(hazardSpecs);
  for (let i = 1; i < tiles.length - 1; i++) {
    if (reserved.has(i)) continue;
    const t = tiles[i]!;
    if (t.type !== "straight" || t.hazardSafe === false || t.isRamp) continue;
    const spec: HazardSpawnSpec = {
      id: `ftue-mushroom-${i}`,
      kind: "bumper_mushroom",
      tileIndex: i,
      weight: hazardWeight("bumper_mushroom"),
      mushroomVisualScale: 1.15,
    };
    return [...hazardSpecs, spec];
  }
  return hazardSpecs;
}
