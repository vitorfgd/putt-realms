import * as THREE from "three";
import {
  assetRegistry,
  type AssetKey,
} from "../../art/AssetRegistry";
import {
  holeCupPortalSurfaceMaterial,
  holeFlagRed,
  boostPadArrowBlue,
  warmCreamStone,
  woodBrown,
} from "../../art/Materials";
import { createLowPolyCylinder, snapVertexJitter } from "../../art/PsxStyle";
import {
  scaleProcgenModelToWorldUnits,
  snapRampExitFloorToHeight,
  centerModelOnDeckOrigin,
  procgenModelExtentForAssetKey,
} from "../../procgen/procgenModelScale";
import { RAMP_HEIGHT } from "../../procgen/TileCatalog";
import type { PlacedTile } from "../LevelTypes";
import {
  TILE_SIZE,
  LANE_WIDTH,
  RAIL_HEIGHT,
  RAIL_THICKNESS,
  holeCupRadius,
} from "../TileDimensions";

/** Half-width of procedural grass deck (must match deckGrass BoxGeometry) */
const DECK_HALF_W = (LANE_WIDTH * 0.97) * 0.5;

/** Cup exit marker — tall pole + billboard so the finish reads from distance */
const HOLE_FLAG_POLE_H = 0.92;
const HOLE_FLAG_PLANE_W = 0.84;
const HOLE_FLAG_PLANE_H = 0.56;
const HOLE_FLAG_POLE_R = 0.048;

/**
 * Lateral offset from course center to rail mesh centers so outer rail faces
 * stay inside the grass quad (older LANE_HALF_WIDTH+rail put rails past the deck).
 */
function railSideOffset(): number {
  return DECK_HALF_W - RAIL_THICKNESS * 0.5;
}
import { addSparseDecor } from "./tileDecor";
import {
  creamRailMaterial,
  cupDarkMaterial,
  grassMaterial,
} from "./tileMaterials";

function tileTypeToAssetKeys(type: PlacedTile["type"]): AssetKey[] {
  switch (type) {
    case "start":
      return ["tile_start"];
    case "straight":
      return ["tile_straight", "tile_square"];
    case "floor":
      return [];
    case "corner":
      return ["tile_corner"];
    case "curve":
      return ["tile_curve"];
    case "hole":
      return ["tile_hole"];
  }
}

function makeModelDoubleSided(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

/**
 * Full tile mesh from registry — skips procedural deck/rails/island for this tile.
 */
function tryAttachTileModel(parent: THREE.Object3D, tile: PlacedTile): boolean {
  if (tile.assetKeyOverride) {
    const node = assetRegistry.getModelClone(tile.assetKeyOverride);
    if (node) {
      // Scale to the full tile footprint (TILE_LENGTH = 6 world units), ignoring
      // wall height so tall walls never shrink the ground footprint below 4×6.
      scaleProcgenModelToWorldUnits(
        node,
        procgenModelExtentForAssetKey(tile.assetKeyOverride),
        true,
      );
      // Centre XZ on deck origin + snap bottom to y=0.
      centerModelOnDeckOrigin(node, 0);
      // For ramp assets: translate in Y so the exit-floor (measured via vertex sampling
      // at the high-Z end) is exactly RAMP_HEIGHT — closes the vertical seam between the
      // ramp exit and the next flat/elevated tile without deforming the geometry.
      const key = tile.assetKeyOverride;
      if (key === "tile_ramp_rw" || key === "tile_ramp_lw") {
        snapRampExitFloorToHeight(node, RAMP_HEIGHT);
      }
      if (key === "tile_floor_plain") {
        makeModelDoubleSided(node);
      }
      parent.add(node);
      return true;
    }
  }
  for (const key of tileTypeToAssetKeys(tile.type)) {
    const node = assetRegistry.getModelClone(key);
    if (node) {
      parent.add(node);
      return true;
    }
  }
  return false;
}

function tileRng(tile: PlacedTile, salt: number): () => number {
  let s =
    tile.gridX * 1103515245 +
    tile.gridZ * 999983 +
    salt +
    (tile.type.charCodeAt(0) ?? 0);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0xfffffff;
  };
}

/**
 * Modular tile visuals — swap bodies here later while keeping placement contracts.
 */
export function buildTileGroup(tile: PlacedTile): THREE.Group {
  const root = new THREE.Group();
  root.name = `tile_${tile.type}_${tile.gridX}_${tile.gridZ}`;

  const usedModel = tryAttachTileModel(root, tile);
  if (!usedModel) {
    switch (tile.type) {
      case "start":
        buildStartLocal(root, tile);
        break;
      case "straight":
        buildStraightLocal(root, tile);
        break;
      case "floor":
        buildFloorLocal(root, tile);
        break;
      case "corner":
        buildCornerLocal(root, tile);
        break;
      case "curve":
        buildCurveLocal(root, tile);
        break;
      case "hole":
        buildHoleLocal(root, tile);
        break;
    }
  }

  if (tile.isRamp) {
    addRampReadabilityOverlay(root);
  }
  addSparseDecor(root, tile);
  return root;
}

function addRampReadabilityOverlay(parent: THREE.Object3D): void {
  const arrowMat = boostPadArrowBlue().clone();
  arrowMat.color.setHex(0xfff2a8);
  arrowMat.transparent = true;
  arrowMat.opacity = 0.9;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.74);
  shape.lineTo(0.72, -0.16);
  shape.lineTo(0.28, -0.16);
  shape.lineTo(0.28, -0.74);
  shape.lineTo(-0.28, -0.74);
  shape.lineTo(-0.28, -0.16);
  shape.lineTo(-0.72, -0.16);
  shape.lineTo(0, 0.74);
  const arrowGeo = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 2; i++) {
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.04 + i * 0.004, -0.78 + i * 1.35);
    arrow.scale.setScalar(0.88);
    arrow.renderOrder = 4;
    parent.add(arrow);
  }

  const trimMat = new THREE.MeshBasicMaterial({
    color: 0xfff0a8,
    transparent: true,
    opacity: 0.88,
    toneMapped: false,
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x173e24,
    transparent: true,
    opacity: 0.2,
    toneMapped: false,
  });
  const trimGeo = new THREE.BoxGeometry(0.07, 0.035, TILE_SIZE * 0.92);
  const left = new THREE.Mesh(trimGeo, trimMat);
  left.position.set(-LANE_WIDTH * 0.32, 0.058, 0);
  const right = left.clone();
  right.position.x *= -1;
  const slopeShade = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_WIDTH * 0.58, TILE_SIZE * 0.86),
    shadowMat,
  );
  slopeShade.rotation.x = -Math.PI / 2;
  slopeShade.position.set(0, 0.03, -0.18);
  slopeShade.renderOrder = 2;
  parent.add(slopeShade, left, right);
}

function islandUnderside(parent: THREE.Object3D, tile: PlacedTile): void {
  const rng = tileRng(tile, 7);
  const cylGeo = new THREE.CylinderGeometry(
    TILE_SIZE * 0.41,
    TILE_SIZE * 0.47,
    0.66,
    8,
    1,
    false,
  );
  snapVertexJitter(cylGeo, 0.022, rng);
  const base = new THREE.Mesh(cylGeo, woodBrown());
  base.position.y = -0.46;
  parent.add(base);

  if (rng() < 0.52) {
    const rockGeo = new THREE.DodecahedronGeometry(0.36 + rng() * 0.16, 0);
    snapVertexJitter(rockGeo, 0.032, rng);
    const rock = new THREE.Mesh(rockGeo, warmCreamStone());
    rock.position.set((rng() - 0.5) * 2.4, -0.58, (rng() - 0.5) * 2.4);
    rock.rotation.set(rng() * 6.2, rng() * 6.2, rng() * 6.2);
    parent.add(rock);
  }
}

/** Length along lane — use full TILE_SIZE so adjacent grid cells meet without gaps */
function deckGrass(parent: THREE.Object3D, lengthZ = TILE_SIZE): void {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_WIDTH * 0.97, 0.14, lengthZ),
    grassMaterial(),
  );
  deck.position.y = -0.07;
  parent.add(deck);
}

/** Second strip along local X — fills the bend leg on corner tiles (single Z strip left gaps). */
function deckGrassSquare(parent: THREE.Object3D): void {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, 0.14, TILE_SIZE),
    grassMaterial(),
  );
  deck.position.y = -0.07;
  parent.add(deck);
}

function deckGrassAlongX(parent: THREE.Object3D): void {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, 0.14, LANE_WIDTH * 0.97),
    grassMaterial(),
  );
  deck.position.y = -0.07;
  parent.add(deck);
}

function parallelRails(
  parent: THREE.Object3D,
  lengthZ: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const railGeo = new THREE.BoxGeometry(RAIL_THICKNESS, RAIL_HEIGHT, lengthZ);
  const y = RAIL_HEIGHT * 0.35 - 0.07;
  const xOff = railSideOffset();
  const left = new THREE.Mesh(railGeo, mat);
  left.position.set(-xOff, y, 0);
  const right = left.clone();
  right.position.x *= -1;
  parent.add(left, right);
}

function localSideForWorldNormal(
  tile: PlacedTile,
  side: { x: number; z: number },
): "left" | "right" | "front" | "back" | null {
  const c = Math.round(Math.cos(tile.rotationY));
  const s = Math.round(Math.sin(tile.rotationY));
  const dirs = {
    right: { x: c, z: -s },
    left: { x: -c, z: s },
    front: { x: s, z: c },
    back: { x: -s, z: -c },
  } as const;
  for (const [name, dir] of Object.entries(dirs)) {
    if (dir.x === Math.sign(side.x) && dir.z === Math.sign(side.z)) {
      return name as "left" | "right" | "front" | "back";
    }
  }
  return null;
}

function explicitRails(parent: THREE.Object3D, tile: PlacedTile): boolean {
  const sides = tile.railWorldSides;
  if (!sides) return false;
  const mat = creamRailMaterial();
  const side = railSideOffset();
  const y = RAIL_HEIGHT * 0.35 - 0.07;
  for (const worldSide of sides) {
    const local = localSideForWorldNormal(tile, worldSide);
    if (local === "left" || local === "right") {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(RAIL_THICKNESS, RAIL_HEIGHT, TILE_SIZE),
        mat,
      );
      rail.position.set(local === "right" ? side : -side, y, 0);
      parent.add(rail);
    } else if (local === "front" || local === "back") {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE, RAIL_HEIGHT, RAIL_THICKNESS),
        mat,
      );
      rail.position.set(0, y, local === "front" ? side : -side);
      parent.add(rail);
    }
  }
  return true;
}

function buildStraightLocal(parent: THREE.Object3D, tile: PlacedTile): void {
  deckGrass(parent);
  if (!explicitRails(parent, tile)) {
    parallelRails(parent, TILE_SIZE, creamRailMaterial());
  }
  islandUnderside(parent, tile);
}

function buildFloorLocal(parent: THREE.Object3D, tile: PlacedTile): void {
  deckGrassSquare(parent);
  islandUnderside(parent, tile);
}

function buildStartLocal(parent: THREE.Object3D, tile: PlacedTile): void {
  deckGrass(parent);
  parallelRails(parent, TILE_SIZE, creamRailMaterial());

  const peg = new THREE.Mesh(
    createLowPolyCylinder(0.07, 0.09, 0.24, 6),
    creamRailMaterial(),
  );
  peg.position.set(0, 0.1, -TILE_SIZE * 0.24);
  parent.add(peg);

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_WIDTH * 0.42, 0.045, 0.14),
    creamRailMaterial(),
  );
  band.position.set(0, 0.03, -TILE_SIZE * 0.36);
  parent.add(band);

  islandUnderside(parent, tile);
}

function buildCornerLocal(parent: THREE.Object3D, tile: PlacedTile): void {
  deckGrass(parent);
  deckGrassAlongX(parent);
  const railMat = creamRailMaterial();
  const { sx, sz } = tile.railS ?? { sx: -1, sz: -1 };
  const side = railSideOffset();

  const railAlongZ = new THREE.Mesh(
    new THREE.BoxGeometry(RAIL_THICKNESS, RAIL_HEIGHT, TILE_SIZE),
    railMat,
  );
  railAlongZ.position.set(
    sx * side,
    RAIL_HEIGHT * 0.35 - 0.07,
    0,
  );

  const railAlongX = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, RAIL_HEIGHT, RAIL_THICKNESS),
    railMat,
  );
  railAlongX.position.set(
    0,
    RAIL_HEIGHT * 0.35 - 0.07,
    sz * side,
  );

  parent.add(railAlongZ, railAlongX);
  islandUnderside(parent, tile);
}

function buildCurveLocal(parent: THREE.Object3D, tile: PlacedTile): void {
  deckGrass(parent, TILE_SIZE);
  deckGrassAlongX(parent);

  const railMat = creamRailMaterial();
  const { sx, sz } = tile.railS ?? { sx: -1, sz: -1 };
  const segments = 6;
  const outer = railSideOffset();
  const y = RAIL_HEIGHT * 0.35 - 0.07;

  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * (Math.PI / 2);
    const t1 = ((i + 1) / segments) * (Math.PI / 2);
    const mx = (Math.cos(t0) + Math.cos(t1)) * 0.5 * outer * sx;
    const mz = (Math.sin(t0) + Math.sin(t1)) * 0.5 * outer * sz;
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(RAIL_THICKNESS * 1.15, RAIL_HEIGHT, TILE_SIZE * 0.22),
      railMat,
    );
    chunk.position.set(mx, y, mz);
    const ang = (t0 + t1) * 0.5;
    chunk.rotation.y = ang * sx * sz;
    parent.add(chunk);
  }

  islandUnderside(parent, tile);
}

/** Animated `flag.gltf` when preloaded; mixer stored on `parent.userData.holeFlagMixer` for the game loop. */
function attachAnimatedHoleFlag(parent: THREE.Object3D): boolean {
  const model = assetRegistry.getModelClone("hole_flag");
  if (!model) return false;

  model.name = "HoleFlagGltf";
  model.visible = true;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).visible = true;
  });
  const clips = assetRegistry.getAnimationClips("hole_flag");

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const targetH = 1.2;
  /** Base fit to ~lane scale, then ×10 (2× previous ×5) — centered on the hole tile */
  const FLAG_VISUAL_SCALE = 8;
  const s =
    (size.y > 1e-5 ? (targetH / size.y) * 0.42 : 0.32) * FLAG_VISUAL_SCALE;
  model.scale.setScalar(s);
  model.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(model);
  model.position.set(0, -b2.min.y , 0.5);
  parent.add(model);

  if (clips.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const act = mixer.clipAction(clip, model);
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.play();
    }
    parent.userData.holeFlagMixer = mixer;
  }
  return true;
}

/** Procedural pole + cloth if GLTF not ready */
function addProceduralHoleFlagFallback(parent: THREE.Object3D): void {
  const pin = new THREE.Mesh(
    createLowPolyCylinder(
      HOLE_FLAG_POLE_R,
      HOLE_FLAG_POLE_R * 1.08,
      HOLE_FLAG_POLE_H,
      8,
    ),
    creamRailMaterial(),
  );
  pin.position.y = HOLE_FLAG_POLE_H * 0.5;
  pin.name = "HoleExitFlagPole";
  parent.add(pin);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(HOLE_FLAG_PLANE_W, HOLE_FLAG_PLANE_H),
    holeFlagRed(),
  );
  flag.position.set(0.34, HOLE_FLAG_POLE_H * 0.78, 0);
  flag.rotation.y = Math.PI / 2;
  flag.renderOrder = 5;
  flag.name = "HoleExitFlagCloth";
  parent.add(flag);
}

/** GLB hole tiles skip procedural geometry — animated flag or fallback pole + cloth */
export function appendHoleFlagVisual(parent: THREE.Object3D): void {
  if (!attachAnimatedHoleFlag(parent)) {
    addProceduralHoleFlagFallback(parent);
  }
}

export function appendHolePortalVisuals(parent: THREE.Object3D): void {
  const cupR = holeCupRadius();
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(cupR * 0.76, cupR * 1.12, 28),
    cupDarkMaterial(),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.005;
  parent.add(rim);

  const cup = new THREE.Mesh(
    new THREE.CircleGeometry(cupR * 0.74, 32),
    cupDarkMaterial(),
  );
  cup.rotation.x = -Math.PI / 2;
  cup.position.y = 0.004;
  cup.renderOrder = 2;
  cup.name = "HoleCupSurface";
  parent.add(cup);

  const portal = new THREE.Mesh(
    new THREE.CircleGeometry(cupR * 1.02, 32),
    holeCupPortalSurfaceMaterial(),
  );
  portal.rotation.x = -Math.PI / 2;
  portal.position.y = 0.009;
  portal.renderOrder = 4;
  portal.name = "HolePortalSurface";
  parent.add(portal);

  const swirlRing = new THREE.Mesh(
    new THREE.RingGeometry(cupR * 0.22, cupR * 0.62, 36),
    holeCupPortalSurfaceMaterial(),
  );
  swirlRing.rotation.x = -Math.PI / 2;
  swirlRing.position.y = 0.011;
  swirlRing.renderOrder = 3;
  swirlRing.name = "HolePortalSwirlRing";
  parent.add(swirlRing);
}

function buildHoleLocal(parent: THREE.Object3D, tile: PlacedTile): void {
  deckGrass(parent);

  const railMat = creamRailMaterial();
  parallelRails(parent, TILE_SIZE, railMat);

  appendHolePortalVisuals(parent);

  appendHoleFlagVisual(parent);
  islandUnderside(parent, tile);
}
