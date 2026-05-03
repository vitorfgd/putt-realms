import { hazardWeight, type HazardKind } from "../hazards/HazardTypes";
import type { HazardSpawnSpec, PlacedTile } from "./LevelTypes";

const ALL_KINDS: HazardKind[] = [
  "windmill",
  "sandpit",
  "fan",
  "bridge",
  "axe",
  "boost",
];

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickKind(rng: () => number): HazardKind {
  return ALL_KINDS[Math.floor(rng() * ALL_KINDS.length)];
}

/**
 * Hazard meshes assume a single straight lane along tile-local +Z.
 * Corner/curve tiles are an L — the same layout blocks the wrong leg or the bend.
 */
function eligibleStraightTileIndices(tiles: readonly PlacedTile[]): number[] {
  const out: number[] = [];
  for (let i = 2; i <= tiles.length - 2; i++) {
    if (tiles[i].type === "straight") {
      out.push(i);
    }
  }
  return out;
}

/**
 * @see user rules: no trap on first tile after start, not on hole; count caps by level
 */
export function generateHazardSpecs(
  levelIndex: number,
  tiles: readonly PlacedTile[],
  rng: () => number,
): HazardSpawnSpec[] {
  if (levelIndex === 1) return [];

  const eligible = eligibleStraightTileIndices(tiles);
  if (eligible.length === 0) return [];

  let count = 0;
  if (levelIndex >= 2 && levelIndex <= 4) {
    count = rng() < 0.58 ? 1 : 0;
  } else {
    let maxH = 2;
    if (levelIndex >= 10) maxH = 3;
    if (levelIndex >= 16) maxH = 4;
    maxH = Math.min(maxH, eligible.length);
    const roll = Math.ceil(rng() * maxH);
    count = Math.max(1, roll);
  }

  count = Math.min(count, eligible.length);
  if (count === 0) return [];

  shuffleInPlace(eligible, rng);
  const chosen = eligible.slice(0, count);

  return chosen.map((tileIndex, i) => {
    const kind = pickKind(rng);
    return {
      id: `hz-${levelIndex}-${tileIndex}-${i}`,
      kind,
      tileIndex,
      weight: hazardWeight(kind),
      fanSign: (rng() > 0.5 ? 1 : -1) as 1 | -1,
    };
  });
}
