import * as THREE from "three";
import type { AssetKey } from "../art/AssetRegistry";
import { assetRegistry } from "../art/AssetRegistry";
import { LANE_WIDTH, TILE_SIZE } from "./TileDimensions";
import type { GeneratedLevel } from "./LevelTypes";
import type { UndermapIslandSlot } from "./undermapIslands";

/** Optional decor — copy these GLBs into `public/assets/models/` */
export const ISLAND_DECOR_ASSET_KEYS = [
  "decor_fan_cluster",
  "decor_fantasy_crystal_rock",
  "decor_fantasy_pine_tree",
  "decor_small_mushroom",
] as const satisfies readonly AssetKey[];

export type DecorKey = (typeof ISLAND_DECOR_ASSET_KEYS)[number];

const SCRATCH_BOX = new THREE.Box3();
const SCRATCH_SIZE = new THREE.Vector3();

/** Clearance from tile centers — props must stay visibly outside the playable route. */
const DECK_EXCLUDE_R =
  Math.hypot(TILE_SIZE / 2, LANE_WIDTH / 2) + 1.8;

/** Nudge island-top samples down so mesh bases meet the support surface. */
const ISLAND_SURFACE_BIAS_Y = -0.12;

/**
 * Push all décor slightly into the ground after bbox snap (fixes GLB pivots that hover).
 */
const DECOR_GROUND_PENETRATION_Y = 0.38;

/** Minimum gap between inscribed decor footprint disks (world units). */
const DECOR_DISK_CLEARANCE = 1.26;

/** Extra fudge on bbox half-extent after scale (XZ). */
const FOOTPRINT_RADIAL_FUDGE = 0.42;

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

function minDistSqToTiles(x: number, z: number, level: GeneratedLevel): number {
  let best = Infinity;
  for (const t of level.tiles) {
    const dx = x - t.worldX;
    const dz = z - t.worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

function isOutsidePlayableRoute(
  x: number,
  z: number,
  level: GeneratedLevel,
): boolean {
  return (
    minDistSqToTiles(x, z, level) >= DECK_EXCLUDE_R * DECK_EXCLUDE_R
  );
}

function isFarEnoughFromAllTileDecks(
  x: number,
  z: number,
  level: GeneratedLevel,
  minDist: number,
): boolean {
  return minDistSqToTiles(x, z, level) >= minDist * minDist;
}

/** Pine trunks/canopies need extra horizontal clearance vs deck projection. */
function islandsOnlyMinDistFromDecks(
  key: DecorKey,
  propRadiusXZ: number,
): number {
  const canopy = propRadiusXZ * (key === "decor_fantasy_pine_tree" ? 1.12 : 1.02);
  const pad = key === "decor_fantasy_pine_tree" ? 0.68 : 0.2;
  return DECK_EXCLUDE_R + canopy + pad;
}

/**
 * Small procgen quad pads sit directly under deck tiles — requiring full pine/fan exclusion radius on the
 * island disk leaves **no** valid XZ samples (and post-scale checks would reject anyway). Cap clearance so an
 * annulus on the mesh can still satisfy décor placement.
 */
function maxDeckClearanceFeasibleOnSlot(slot: UndermapIslandSlot): number {
  return slot.halfWidthWorld * 0.82 + TILE_SIZE * 0.25;
}

function effectiveIslandsOnlyDeckClearance(
  key: DecorKey,
  propRadiusXZ: number,
  slot: UndermapIslandSlot,
): number {
  return Math.min(
    islandsOnlyMinDistFromDecks(key, propRadiusXZ),
    maxDeckClearanceFeasibleOnSlot(slot),
  );
}

function nearestSlotToXZ(
  slots: readonly UndermapIslandSlot[],
  x: number,
  z: number,
): UndermapIslandSlot | undefined {
  if (slots.length === 0) return undefined;
  let best = slots[0]!;
  let bestD = Infinity;
  for (const s of slots) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function applyShadowMode(
  root: THREE.Object3D,
  mode: "full" | "receiveOnly" | "none",
): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (mode === "none") {
      m.castShadow = false;
      m.receiveShadow = false;
    } else if (mode === "receiveOnly") {
      m.castShadow = false;
      m.receiveShadow = true;
    } else {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

function disposeDecorClone(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) {
      for (const x of mat) x.dispose();
    } else {
      mat.dispose();
    }
  });
}

function scaleAndSnapToGround(
  node: THREE.Object3D,
  x: number,
  z: number,
  groundY: number,
  targetHeight: number,
  rotY: number,
): void {
  node.position.set(0, 0, 0);
  node.rotation.set(0, rotY, 0);
  node.scale.set(1, 1, 1);
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  SCRATCH_BOX.getSize(SCRATCH_SIZE);
  const h = Math.max(SCRATCH_SIZE.y, 0.02);
  const s = targetHeight / h;
  node.scale.setScalar(s);
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  node.position.set(x, groundY - SCRATCH_BOX.min.y, z);
}

function isLargeIslandCanopyDecor(key: DecorKey): boolean {
  return (
    key === "decor_fantasy_pine_tree" || key === "decor_fan_cluster"
  );
}

/**
 * Axis-aligned square in world XZ around the slot center. Half-edge length is derived only from
 * {@link UndermapIslandSlot.halfWidthWorld} (same signal as slot layout) — no mesh sampling.
 */
const ISLAND_DECOR_SQUARE_HALF_MUL = 0.6;

function islandDecorSquareHalfExtent(slot: UndermapIslandSlot): number {
  return slot.halfWidthWorld * ISLAND_DECOR_SQUARE_HALF_MUL;
}

/**
 * Undermap pads sit under tiles — the full fairway exclusion radius is often larger than any point on
 * the pad can achieve vs tile centers, so rim sampling would never succeed. Cap clearance so props can
 * still spawn on the slab while staying modestly away from deck projection.
 */
function clampDeckClearanceForIslandDecor(
  requestedMinDist: number,
  slot: UndermapIslandSlot,
): number {
  const h = islandDecorSquareHalfExtent(slot);
  /** Slightly higher floor/ceiling so props sit a tad further from tile projection when the pad allows. */
  const cap = Math.max(TILE_SIZE * 0.56 + 0.48, h * 0.6 + 0.58);
  return Math.min(requestedMinDist, cap);
}

function xzInsideIslandAxisSquare(slot: UndermapIslandSlot, x: number, z: number): boolean {
  const h = islandDecorSquareHalfExtent(slot);
  return Math.abs(x - slot.x) <= h && Math.abs(z - slot.z) <= h;
}

function trySampleNearIsland(
  slot: UndermapIslandSlot,
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
): { x: number; z: number } | null {
  const h = islandDecorSquareHalfExtent(slot);
  for (let a = 0; a < maxAttempts; a++) {
    const x = slot.x + (rng() * 2 - 1) * h;
    const z = slot.z + (rng() * 2 - 1) * h;
    if (isOutsidePlayableRoute(x, z, level)) {
      return { x, z };
    }
  }
  return null;
}

/**
 * Organic placement: polar-ish samples with per-axis stretch and jitter so trunks do not sit on a
 * perfect ring. Biased **well out from the slot center** with **strong distance variance** (wide annulus,
 * not a tight band).
 */
function trySampleIslandRimClearOfDecks(
  slot: UndermapIslandSlot,
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
  minDistFromDeckCenter: number,
  _decorKey: DecorKey,
): { x: number; z: number } | null {
  void _decorKey;
  const h = islandDecorSquareHalfExtent(slot);
  const capDist = clampDeckClearanceForIslandDecor(minDistFromDeckCenter, slot);
  for (let a = 0; a < maxAttempts; a++) {
    /** Wider per-attempt deck clearance band so distance-from-deck and distance-from-center both vary. */
    const needDist = capDist * (0.88 + rng() * 0.12);
    const needSq = needDist * needDist;
    const u = rng() * Math.PI * 2;
    /**
     * Normalized radius along ellipse axes before jitter — floor pushed outward vs older 0.5…0.94 band.
     * `pow(rng(), e)` with e < 1 spreads samples across shallow/mid/deep annulus instead of clumping mid.
     */
    const radialCore = 0.7 + Math.pow(rng(), 0.48) * 0.26;
    const radialWobble = (rng() - 0.5) * 0.14;
    const radialT = THREE.MathUtils.clamp(radialCore + radialWobble, 0.62, 0.99);
    const ax = 0.74 + rng() * 0.36;
    const az = 0.74 + rng() * 0.36;
    let x = slot.x + Math.cos(u) * h * radialT * ax;
    let z = slot.z + Math.sin(u) * h * radialT * az;
    x += (rng() - 0.5) * h * 0.18;
    z += (rng() - 0.5) * h * 0.18;
    if (!xzInsideIslandAxisSquare(slot, x, z)) continue;
    if (minDistSqToTiles(x, z, level) >= needSq) {
      return { x, z };
    }
  }
  return null;
}

/** Ground Y when no undermap slot is near — well below the course void shelf. */
function voidShelfGroundY(rng: () => number): number {
  return -2.38 - rng() * 1.05;
}

/**
 * Island top Y when (x,z) lies in the axis-aligned placement square of a slot (see
 * {@link islandDecorSquareHalfExtent}).
 */
function resolveDecorGroundY(
  x: number,
  z: number,
  slots: readonly UndermapIslandSlot[],
  shelfFallback: number,
): number {
  let bestY = shelfFallback;
  let bestD = Infinity;
  for (const s of slots) {
    if (!xzInsideIslandAxisSquare(s, x, z)) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bestD) {
      bestD = d;
      bestY = s.topY + ISLAND_SURFACE_BIAS_Y;
    }
  }
  return bestY;
}

function trySampleOffDeck(
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
  decorKey: DecorKey,
): { x: number; z: number } | null {
  const b = level.bounds;
  const spanX = b.maxX - b.minX;
  const spanZ = b.maxZ - b.minZ;
  const padMul = isLargeIslandCanopyDecor(decorKey) ? 0.48 : 0.52;
  const pad = Math.max(18, spanX, spanZ) * padMul;
  for (let a = 0; a < maxAttempts; a++) {
    const x = b.minX - pad + rng() * (spanX + pad * 2);
    const z = b.minZ - pad + rng() * (spanZ + pad * 2);
    if (isOutsidePlayableRoute(x, z, level)) return { x, z };
  }
  return null;
}

function approximateClearanceRadius(key: DecorKey, targetHeight: number): number {
  switch (key) {
    case "decor_fan_cluster":
      return 3.05 + targetHeight * 0.065;
    case "decor_fantasy_pine_tree":
      return 1.42 + targetHeight * 0.11;
    case "decor_fantasy_crystal_rock":
      return 0.95 + targetHeight * 0.19;
    case "decor_small_mushroom":
      return 0.58 + targetHeight * 0.14;
    default:
      return 1.1;
  }
}

function spacedFromExisting(
  x: number,
  z: number,
  rSelf: number,
  placed: readonly { x: number; z: number; r: number }[],
): boolean {
  const needSq = DECOR_DISK_CLEARANCE;
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.z;
    const sep = rSelf + p.r + needSq;
    if (dx * dx + dz * dz < sep * sep) return false;
  }
  return true;
}

function measureFootprintRadiusAfterScale(node: THREE.Object3D): number {
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  SCRATCH_BOX.getSize(SCRATCH_SIZE);
  return Math.max(SCRATCH_SIZE.x, SCRATCH_SIZE.z) * 0.5 + FOOTPRINT_RADIAL_FUDGE;
}

function tryPlaceDecor(
  key: DecorKey,
  level: GeneratedLevel,
  slots: readonly UndermapIslandSlot[],
  rng: () => number,
  targetHeight: number,
  shadow: "full" | "receiveOnly" | "none",
  preferIsland: boolean,
  /** Visual shelf height outside the playable route */
  shelfGroundY: number,
  extraSinkY: number,
  placed: { x: number; z: number; r: number }[],
  maxAttempts: number,
  /** Props only on slot meshes — no void-ring fallback; rim-sampled with deck clearance. */
  islandsOnly: boolean,
): THREE.Object3D | null {
  if (!assetRegistry.isReady(key)) return null;

  const rPre = approximateClearanceRadius(key, targetHeight);
  const hasSlots = slots.length > 0;
  const singleSampleIsland = (): { x: number; z: number; groundY: number } | null => {
    if (hasSlots && preferIsland) {
      const slot = slots[Math.floor(rng() * slots.length)]!;
      const xz = islandsOnly
        ? trySampleIslandRimClearOfDecks(
            slot,
            level,
            rng,
            isLargeIslandCanopyDecor(key) ? 1100 : 720,
            effectiveIslandsOnlyDeckClearance(key, rPre, slot),
            key,
          )
        : trySampleNearIsland(slot, level, rng, 170);
      if (xz) {
        const gy = islandsOnly
          ? resolveDecorGroundY(
              xz.x,
              xz.z,
              slots,
              slot.topY + ISLAND_SURFACE_BIAS_Y,
            )
          : resolveDecorGroundY(xz.x, xz.z, slots, slot.topY + ISLAND_SURFACE_BIAS_Y);
        return { ...xz, groundY: gy };
      }
    }
    if (!islandsOnly) {
      const xzOff = trySampleOffDeck(level, rng, 160, key);
      if (xzOff) {
        const gy = resolveDecorGroundY(xzOff.x, xzOff.z, slots, shelfGroundY);
        return { ...xzOff, groundY: gy };
      }
    }
    return null;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sample = singleSampleIsland();
    if (!sample) continue;
    if (!spacedFromExisting(sample.x, sample.z, rPre, placed)) continue;

    const node = assetRegistry.getModelClone(key);
    if (!node) return null;

    const rotY = rng() * Math.PI * 2;
    scaleAndSnapToGround(
      node,
      sample.x,
      sample.z,
      sample.groundY,
      targetHeight,
      rotY,
    );
    node.position.y -= DECOR_GROUND_PENETRATION_Y;
    if (extraSinkY !== 0) node.position.y -= extraSinkY;

    if (
      key === "decor_fantasy_pine_tree" ||
      key === "decor_fan_cluster" ||
      key === "decor_fantasy_crystal_rock"
    ) {
      node.userData.decorOccludesCamera = true;
    }

    const rPost = Math.max(rPre, measureFootprintRadiusAfterScale(node));
    if (!spacedFromExisting(sample.x, sample.z, rPost, placed)) {
      disposeDecorClone(node);
      continue;
    }

    if (islandsOnly) {
      const anchor = nearestSlotToXZ(slots, sample.x, sample.z);
      const rawNeed = anchor
        ? effectiveIslandsOnlyDeckClearance(key, rPost, anchor)
        : islandsOnlyMinDistFromDecks(key, rPost);
      /** Match sampler: allow the lower end of the per-attempt clearance band so accepted trees are not rejected here. */
      const needDist = anchor
        ? clampDeckClearanceForIslandDecor(rawNeed, anchor) * 0.93
        : rawNeed;
      if (!isFarEnoughFromAllTileDecks(sample.x, sample.z, level, needDist)) {
        disposeDecorClone(node);
        continue;
      }
    }

    placed.push({ x: sample.x, z: sample.z, r: rPost });
    applyShadowMode(node, shadow);
    return node;
  }

  return null;
}

export interface IslandDecorScatterOptions {
  /**
   * Only place props on the given undermap slot tops — no “outside fairway” sampling and no void-ring
   * fallback (procgen-debug islands sit under tiles, so route clearance would reject every sample).
   */
  islandsOnly?: boolean;
}

const PINE_DECOR_KEY = "decor_fantasy_pine_tree" as const;
const CRYSTAL_DECOR_KEY = "decor_fantasy_crystal_rock" as const;
const MUSHROOM_DECOR_KEY = "decor_small_mushroom" as const;

/**
 * Scatter fantasy props around under-island masses and in a wide ring off the tile deck.
 * Never parents into the course group — visual-only, no gameplay coupling.
 *
 * Places pine silhouettes, crystal clusters, and small fantasy mushrooms; use
 * {@link IslandDecorScatterOptions.islandsOnly} so props stay on slot meshes (no void ring) when the game
 * has undermap slots.
 */
export function createIslandSurroundDecor(
  level: GeneratedLevel,
  slots: readonly UndermapIslandSlot[],
  options?: IslandDecorScatterOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "IslandSurroundDecor";

  if (slots.length === 0) return group;
  if (
    !assetRegistry.isReady(PINE_DECOR_KEY) &&
    !assetRegistry.isReady(CRYSTAL_DECOR_KEY) &&
    !assetRegistry.isReady(MUSHROOM_DECOR_KEY)
  ) {
    return group;
  }

  const rngPine = mulberry32(
    hashString(`${level.id}|${level.levelIndex}|islandDecorPine`),
  );
  const rngCrystal = mulberry32(
    hashString(`${level.id}|${level.levelIndex}|islandDecorCrystal`),
  );
  const rngMushroom = mulberry32(
    hashString(`${level.id}|${level.levelIndex}|islandDecorMushroom`),
  );
  const islandsOnly = options?.islandsOnly ?? false;
  const placed: { x: number; z: number; r: number }[] = [];
  const shelfGroundY = voidShelfGroundY(rngPine);
  /** World height after uniform scale — large silhouettes on undermap slabs. */
  const pineTargetHeight = 6.75;
  const maxAttemptsPerPlace = 34;
  const maxTrees = Math.min(32, Math.max(5, Math.ceil(slots.length * 2.35)));
  const tryBudget = Math.min(120, Math.max(22, slots.length * 28));

  if (assetRegistry.isReady(PINE_DECOR_KEY)) {
    for (
      let placedCount = 0, tries = 0;
      placedCount < maxTrees && tries < tryBudget;
      tries++
    ) {
      const node = tryPlaceDecor(
        PINE_DECOR_KEY,
        level,
        slots,
        rngPine,
        pineTargetHeight,
        "full",
        true,
        shelfGroundY,
        0,
        placed,
        maxAttemptsPerPlace,
        islandsOnly,
      );
      if (node) {
        group.add(node);
        placedCount++;
      }
    }
  }

  if (assetRegistry.isReady(CRYSTAL_DECOR_KEY)) {
    const maxCrystals = Math.min(16, Math.max(3, Math.ceil(slots.length * 0.92)));
    const crystalTryBudget = Math.min(72, Math.max(14, slots.length * 16));
    for (
      let placedCount = 0, tries = 0;
      placedCount < maxCrystals && tries < crystalTryBudget;
      tries++
    ) {
      const crystalHeight = 1.45 + rngCrystal() * 0.85;
      const node = tryPlaceDecor(
        CRYSTAL_DECOR_KEY,
        level,
        slots,
        rngCrystal,
        crystalHeight,
        "full",
        true,
        shelfGroundY,
        0,
        placed,
        maxAttemptsPerPlace,
        islandsOnly,
      );
      if (node) {
        group.add(node);
        placedCount++;
      }
    }
  }

  if (assetRegistry.isReady(MUSHROOM_DECOR_KEY)) {
    const maxMushrooms = Math.min(26, Math.max(5, Math.ceil(slots.length * 1.2)));
    const mushroomTryBudget = Math.min(96, Math.max(18, slots.length * 22));
    for (
      let placedCount = 0, tries = 0;
      placedCount < maxMushrooms && tries < mushroomTryBudget;
      tries++
    ) {
      const h = 0.42 + rngMushroom() * 0.58;
      const node = tryPlaceDecor(
        MUSHROOM_DECOR_KEY,
        level,
        slots,
        rngMushroom,
        h,
        "full",
        true,
        shelfGroundY,
        0,
        placed,
        maxAttemptsPerPlace,
        islandsOnly,
      );
      if (node) {
        group.add(node);
        placedCount++;
      }
    }
  }

  return group;
}
