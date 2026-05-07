import * as THREE from "three";
import type { AssetKey } from "../art/AssetRegistry";
import { assetRegistry } from "../art/AssetRegistry";
import type { GeneratedLevel, PlacedTile } from "./LevelTypes";
import { TILE_SIZE } from "./TileDimensions";

export const BACKGROUND_FLOATING_ISLAND_KEYS = [
  "bg_floating_island_small",
  "bg_floating_island",
] as const satisfies readonly AssetKey[];

type BgIslandKey = (typeof BACKGROUND_FLOATING_ISLAND_KEYS)[number];

const SCRATCH_BOX = new THREE.Box3();
const SCRATCH_SIZE = new THREE.Vector3();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ramp tiles sit in a long, thin footprint; background islands are huge, so we reject
 * placements whose XZ disks come near the oriented ramp deck (avoids islands visually
 * eating the slope from common camera angles).
 */
function islandCenterClearOfRampFootprints(
  x: number,
  z: number,
  islandXZRadius: number,
  rampTiles: readonly PlacedTile[],
): boolean {
  const pad = islandXZRadius + 3.8;
  /** Local +Z is “along” the ramp run (match tile forward / track). */
  const halfAlong = TILE_SIZE * 1.14;
  /** Local ±X covers lane + rails with margin. */
  const halfAcross = TILE_SIZE * 0.74;

  for (const t of rampTiles) {
    const dx = x - t.worldX;
    const dz = z - t.worldZ;
    const c = Math.cos(-t.rotationY);
    const s = Math.sin(-t.rotationY);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (
      Math.abs(lx) < halfAcross + pad &&
      Math.abs(lz) < halfAlong + pad
    ) {
      return false;
    }
  }
  return true;
}

function configureDistantVisual(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = false;
  });
}

function placeOneIsland(
  key: BgIslandKey,
  x: number,
  z: number,
  targetFootprint: number,
  elevationY: number,
  rotY: number,
  tilt: number,
): THREE.Object3D | null {
  if (!assetRegistry.isReady(key)) return null;
  const node = assetRegistry.getModelClone(key);
  if (!node) return null;

  node.position.set(0, 0, 0);
  node.rotation.set(tilt * 0.35, rotY, tilt * 0.22);
  node.scale.set(1, 1, 1);
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  SCRATCH_BOX.getSize(SCRATCH_SIZE);
  const foot = Math.max(SCRATCH_SIZE.x, SCRATCH_SIZE.z, 0.001);
  const s = targetFootprint / foot;
  node.scale.setScalar(s);
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  const midY = (SCRATCH_BOX.min.y + SCRATCH_BOX.max.y) / 2;
  node.position.set(x, elevationY - midY, z);
  configureDistantVisual(node);
  return node;
}

/**
 * Background floating islands around the course (visual only, restrained but visible).
 */
export function createBackgroundFloatingIslands(level: GeneratedLevel): THREE.Group {
  const group = new THREE.Group();
  group.name = "BackgroundFloatingIslands";

  const any = BACKGROUND_FLOATING_ISLAND_KEYS.some((k) => assetRegistry.isReady(k));
  if (!any) return group;

  const rng = mulberry32(
    hashString(`${level.procgenSeed ?? level.id}|${level.levelIndex}|bgFloatIslands`),
  );

  const rampTiles = level.tiles.filter((t) => t.isRamp);
  const avoidRampSilhouette = rampTiles.length > 0;

  const b = level.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(28, b.maxX - b.minX, b.maxZ - b.minZ);

  /** Keep them outside play, visible but not crowding the course. */
  const rampRingPad = avoidRampSilhouette ? 16 : 0;
  const rInner = span * 0.68 + 38 + rampRingPad;
  const rOuter = span * 1.12 + 108;

  const usedAngles: number[] = [];
  const minAngleSep = avoidRampSilhouette ? 0.58 : 0.52;

  function angularDist(a: number, b: number): number {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  }

  /** A moderate backdrop count, between sparse and crowded. */
  const nSmall = assetRegistry.isReady("bg_floating_island_small")
    ? 3 + Math.floor(rng() * 2)
    : 0;
  const nLarge = assetRegistry.isReady("bg_floating_island")
    ? 1 + Math.floor(rng() * 2)
    : 0;

  const specs: { key: BgIslandKey; foot: number; y: number }[] = [];
  for (let i = 0; i < nSmall; i++) {
    specs.push({
      key: "bg_floating_island_small",
      foot: 28 + rng() * 34,
      y: -18 - rng() * 24,
    });
  }
  for (let i = 0; i < nLarge; i++) {
    specs.push({
      key: "bg_floating_island",
      foot: 76 + rng() * 52,
      y: -24 - rng() * 28,
    });
  }

  for (const spec of specs) {
    const islandApproxR = spec.foot * 0.48;
    let placed: THREE.Object3D | null = null;

    for (let attempt = 0; attempt < 64 && !placed; attempt++) {
      let ang = rng() * Math.PI * 2;
      if (
        !usedAngles.every((u) => angularDist(ang, u) >= minAngleSep)
      ) {
        continue;
      }

      const ringBias = attempt * (avoidRampSilhouette ? 1.85 : 0.95);
      const t =
        rInner +
        rng() * (rOuter - rInner) +
        ringBias;
      const x = cx + Math.cos(ang) * t + (rng() - 0.5) * 22;
      const z = cz + Math.sin(ang) * t + (rng() - 0.5) * 22;

      if (
        avoidRampSilhouette &&
        !islandCenterClearOfRampFootprints(x, z, islandApproxR, rampTiles)
      ) {
        continue;
      }

      const rotY = rng() * Math.PI * 2;
      const tilt = (rng() - 0.5) * 0.14;
      placed = placeOneIsland(spec.key, x, z, spec.foot, spec.y, rotY, tilt);
      if (placed) {
        usedAngles.push(ang);
      }
    }

    if (placed) {
      placed.userData.decorOccludesCamera = true;
      group.add(placed);
    }
  }

  return group;
}
