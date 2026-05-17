import { describe, expect, it } from "vitest";
import { generateHazardSpecs } from "./generateHazardSpecs";
import { hazardWeight } from "../hazards/HazardTypes";
import type { PlacedTile } from "./LevelTypes";

function rngFixed(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rngSequence(values: number[], fallback: number): () => number {
  let i = 0;
  return () => values[i++] ?? fallback;
}

/** Minimal straight-line course for hazard eligibility */
function straightTiles(n: number): PlacedTile[] {
  const tiles: PlacedTile[] = [];
  for (let i = 0; i < n; i++) {
    tiles.push({
      type: "straight",
      gridX: i,
      gridZ: 0,
      worldX: i * 4,
      worldZ: 0,
      rotationY: 0,
      stationIndex: i,
      hazardSafe: true,
      isRamp: false,
    });
  }
  return tiles;
}

const KNOWN: Set<string> = new Set([
  "windmill",
  "sandpit",
  "fan",
  "bridge",
  "boost",
  "bumper_mushroom",
  "portal_gate",
]);

describe("generateHazardSpecs", () => {
  it("returns empty for hole 1", () => {
    expect(generateHazardSpecs(1, straightTiles(12), Math.random)).toEqual([]);
  });

  it("returns non-empty specs for mid levels with eligible straights", () => {
    const tiles = straightTiles(14);
    const specs = generateHazardSpecs(5, tiles, rngFixed(7));
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(KNOWN.has(s.kind)).toBe(true);
      expect(s.weight).toBe(hazardWeight(s.kind));
    }
  });

  it("eventually places a windmill across RNG seeds", () => {
    const tiles = straightTiles(16);
    let sawWindmill = false;
    for (let seed = 0; seed < 80; seed++) {
      const specs = generateHazardSpecs(6, tiles, rngFixed(seed));
      if (specs.some((s) => s.kind === "windmill")) {
        sawWindmill = true;
        break;
      }
    }
    expect(sawWindmill).toBe(true);
  });

  it("eventually places a sandpit across RNG seeds", () => {
    const tiles = straightTiles(18);
    let sawSandpit = false;
    for (let seed = 0; seed < 100; seed++) {
      const specs = generateHazardSpecs(12, tiles, rngFixed(seed));
      if (specs.some((s) => s.kind === "sandpit")) {
        sawSandpit = true;
        break;
      }
    }
    expect(sawSandpit).toBe(true);
  });

  it("allows a larger hazard budget on late levels", () => {
    const tiles = straightTiles(26);
    const specs = generateHazardSpecs(20, tiles, rngSequence([0.99, 0.99], 0.99));
    expect(specs).toHaveLength(5);
  });
});
