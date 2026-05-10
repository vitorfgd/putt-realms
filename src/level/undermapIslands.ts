import * as THREE from "three";
import { assetRegistry } from "../art/AssetRegistry";
import type { GeneratedLevel, PlacedTile } from "./LevelTypes";
import { TILE_SIZE } from "./TileDimensions";

/** Decorative GLB — flat-topped mass read as terrain supporting the course from below. */
const ASSET_KEY = "undermap_island" as const;

export interface UndermapIslandSlot {
  /** Island root XZ (world) — under the fairway centerline */
  readonly x: number;
  readonly z: number;
  /** World Y of the island’s upper surface (below the deck at this station) */
  readonly topY: number;
  readonly scale: number;
  readonly rotationY: number;
  /** ~Horizontal half-extent in world units — scatter decor within this disk */
  readonly halfWidthWorld: number;
  /**
   * Local-space X/Z scale multipliers applied with {@link scale} (Three.js: scale, then Y rotation).
   * Procgen-debug uses this to pinch footprint beside ramp neighbors without world-axis shear.
   */
  readonly scaleAxisMul?: Readonly<{ x: number; z: number }>;
}

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

function applyIslandShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

const scratchBox = new THREE.Box3();
const scratchSize = new THREE.Vector3();

interface PathPoint {
  readonly x: number;
  readonly z: number;
  readonly deckY: number;
}

function pathFromTiles(tiles: readonly PlacedTile[]): PathPoint[] {
  return tiles.map((t) => ({
    x: t.worldX,
    z: t.worldZ,
    deckY: t.worldY ?? 0,
  }));
}

function pathLength(pts: readonly PathPoint[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    const dz = pts[i + 1]!.z - pts[i]!.z;
    L += Math.hypot(dx, dz);
  }
  return L;
}

/**
 * Position, deck height, and path heading (radians, Y) at distance `dist` along the polyline.
 */
function sampleAlongPath(
  pts: readonly PathPoint[],
  pathLen: number,
  dist: number,
): { x: number; z: number; deckY: number; heading: number } {
  if (pts.length === 0) return { x: 0, z: 0, deckY: 0, heading: 0 };
  if (pts.length === 1) {
    const p = pts[0]!;
    return { x: p.x, z: p.z, deckY: p.deckY, heading: 0 };
  }

  const d = Math.max(0, Math.min(dist, pathLen));
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const seg = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    if (d <= acc + seg + 1e-5) {
      const u = seg < 1e-7 ? 0 : (d - acc) / seg;
      return {
        x: a.x + dx * u,
        z: a.z + dz * u,
        deckY: a.deckY + (b.deckY - a.deckY) * u,
        heading,
      };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  return {
    x: last.x,
    z: last.z,
    deckY: last.deckY,
    heading: Math.atan2(last.x - prev.x, last.z - prev.z),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Support pads laid **along the hole path** (tile order: tee → cup), so the void reads like
 * one continuous foundation instead of random puddles around the bounds center.
 */
export function computeUndermapIslandSlots(level: GeneratedLevel): UndermapIslandSlot[] {
  if (!assetRegistry.isReady(ASSET_KEY)) return [];

  const probe = assetRegistry.getModelClone(ASSET_KEY);
  if (!probe) return [];

  probe.position.set(0, 0, 0);
  probe.rotation.set(0, 0, 0);
  probe.scale.set(1, 1, 1);
  probe.updateMatrixWorld(true);
  scratchBox.setFromObject(probe);
  scratchBox.getSize(scratchSize);
  const foot = Math.max(scratchSize.x, scratchSize.z, 0.001);

  const pts = pathFromTiles(level.tiles);
  if (pts.length === 0) return [];

  const seedStr = `${level.procgenSeed ?? level.id}|${level.levelIndex}|undermapPath`;
  const rng = mulberry32(hashString(seedStr));

  const L = pathLength(pts);
  if (L < 1e-4) {
    const p = pts[0]!;
    const underGap = 0.04 + rng() * 0.04;
    const targetFoot = TILE_SIZE * (5.15 + rng() * 1.05);
    return [
      {
        x: p.x,
        z: p.z,
        topY: p.deckY - underGap,
        scale: targetFoot / foot,
        rotationY: rng() * Math.PI * 2,
        halfWidthWorld: targetFoot * 0.58,
      },
    ];
  }

  /** Larger overlapping pads create a continuous foundation from tee to cup. */
  const spacing = clamp(TILE_SIZE * 1.9, 10.8, 16.5);
  const k = Math.max(2, Math.min(24, Math.ceil(L / spacing) + 1));

  const slots: UndermapIslandSlot[] = [];

  for (let i = 0; i < k; i++) {
    const t = k <= 1 ? 0 : i / (k - 1);
    const distAlong = t * L;
    const { x: cx, z: cz, deckY, heading } = sampleAlongPath(pts, L, distAlong);

    /** Slight lateral jitter — perpendicular to tangent (heading = atan2(dx,dz) → tan ∥ (sin, cos)) */
    const seg = Math.max(L / Math.max(pts.length - 1, 1), 1e-3);
    const tx = Math.sin(heading);
    const tz = Math.cos(heading);
    const perpX = -tz;
    const perpZ = tx;
    const lateral = (rng() - 0.5) * clamp(1.1 + seg * 0.04, 0.6, 2.0);
    const x = cx + perpX * lateral;
    const z = cz + perpZ * lateral;

    /** Tiny gap below the deck: close enough to read as a base without poking through. */
    const underGap = 0.04 + rng() * 0.04;
    const topY = deckY - underGap;

    /** Bigger than one tile so adjacent pads overlap into a foundation. */
    const targetFoot = TILE_SIZE * (5.15 + rng() * 1.05);
    const s = targetFoot / foot;
    const rotationY = heading + (rng() - 0.5) * 0.18;

    slots.push({
      x,
      z,
      topY,
      scale: s,
      rotationY,
      halfWidthWorld: targetFoot * 0.58,
    });
  }

  return slots;
}

/**
 * Builds island meshes from slots (one clone per slot).
 */
export function buildUndermapIslandGroup(slots: readonly UndermapIslandSlot[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "UndermapIslandSupports";

  if (!assetRegistry.isReady(ASSET_KEY)) return group;

  for (const slot of slots) {
    const node = assetRegistry.getModelClone(ASSET_KEY);
    if (!node) break;

    const ax = slot.scaleAxisMul?.x ?? 1;
    const az = slot.scaleAxisMul?.z ?? 1;

    node.position.set(0, 0, 0);
    node.rotation.set(0, slot.rotationY, 0);
    node.scale.set(slot.scale * ax, slot.scale, slot.scale * az);
    node.updateMatrixWorld(true);
    scratchBox.setFromObject(node);
    node.position.set(slot.x, slot.topY - scratchBox.max.y, slot.z);

    applyIslandShadows(node);
    group.add(node);
  }

  return group;
}

/** Convenience when no decor pass is needed */
export function createUndermapIslandSupports(level: GeneratedLevel): THREE.Group {
  return buildUndermapIslandGroup(computeUndermapIslandSlots(level));
}
