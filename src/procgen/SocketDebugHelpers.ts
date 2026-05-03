import * as THREE from "three";
import type { TileDefinition } from "./TileCatalog";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
  rotateFlatOffset,
} from "./TileCatalog";
import type { PlacedTile } from "./MapGenerationTypes";
import { SocketDirection } from "./MapGenerationTypes";

const COL_ENTRY = 0x3388ff;
const COL_EXIT = 0x44dd66;
const COL_PIVOT = 0xff2222;

/** Edge midpoint on the deck footprint, in **deck-local** space (+Y up). */
export function socketEdgeCenterLocal(
  sd: SocketDirection,
  halfWidth: number,
  halfLength: number,
  y = 0.35,
): THREE.Vector3 {
  switch (sd) {
    case SocketDirection.NegZ:
      return new THREE.Vector3(0, y, -halfLength);
    case SocketDirection.PosZ:
      return new THREE.Vector3(0, y, halfLength);
    case SocketDirection.NegX:
      return new THREE.Vector3(-halfWidth, y, 0);
    case SocketDirection.PosX:
      return new THREE.Vector3(halfWidth, y, 0);
  }
}

/** Travel direction **into** the tile through the entry socket (deck-local). */
export function entryFlowDirectionLocal(sd: SocketDirection): THREE.Vector3 {
  switch (sd) {
    case SocketDirection.NegZ:
      return new THREE.Vector3(0, 0, 1);
    case SocketDirection.PosZ:
      return new THREE.Vector3(0, 0, -1);
    case SocketDirection.NegX:
      return new THREE.Vector3(1, 0, 0);
    case SocketDirection.PosX:
      return new THREE.Vector3(-1, 0, 0);
  }
}

/** Travel direction **out of** the tile through the exit socket (deck-local). */
export function exitFlowDirectionLocal(sd: SocketDirection): THREE.Vector3 {
  switch (sd) {
    case SocketDirection.NegZ:
      return new THREE.Vector3(0, 0, -1);
    case SocketDirection.PosZ:
      return new THREE.Vector3(0, 0, 1);
    case SocketDirection.NegX:
      return new THREE.Vector3(-1, 0, 0);
    case SocketDirection.PosX:
      return new THREE.Vector3(1, 0, 0);
  }
}

function smallSphere(color: number, radius: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(radius, 16, 12);
  const m = new THREE.MeshBasicMaterial({ color, depthTest: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = "socketDebug_sphere";
  return mesh;
}

/**
 * Visual socket audit for pivot + entry/exit (blue / green) with flow arrows.
 * Does not load art — attach under the same parent as the tile mesh (or scene).
 */
export function createSocketDebugGroup(
  def: TileDefinition,
  pivotWorld: THREE.Vector3,
  rotationY: number,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "SocketDebugHelpers";

  const deckWorld = deckCenterWorldFromPivot(pivotWorld, rotationY, def);
  const { halfWidth: hw, halfLength: hl } = def.footprint;

  const entryLocal = socketEdgeCenterLocal(def.entrySocket, hw, hl);
  const exitLocal = socketEdgeCenterLocal(def.exitSocket, hw, hl);

  const entryWorld = rotateFlatOffset(entryLocal, rotationY, new THREE.Vector3()).add(
    deckWorld,
  );
  const exitWorld = rotateFlatOffset(exitLocal, rotationY, new THREE.Vector3()).add(
    deckWorld,
  );

  const entryDirW = rotateFlatOffset(
    entryFlowDirectionLocal(def.entrySocket),
    rotationY,
    new THREE.Vector3(),
  ).normalize();
  const exitDirW = rotateFlatOffset(
    exitFlowDirectionLocal(def.exitSocket),
    rotationY,
    new THREE.Vector3(),
  ).normalize();

  const pivotBall = smallSphere(COL_PIVOT, 0.22);
  pivotBall.position.copy(pivotWorld);
  pivotBall.position.y += 0.05;
  root.add(pivotBall);

  const entryBall = smallSphere(COL_ENTRY, 0.18);
  entryBall.position.copy(entryWorld);
  root.add(entryBall);

  const exitBall = smallSphere(COL_EXIT, 0.18);
  exitBall.position.copy(exitWorld);
  root.add(exitBall);

  const arrowLen = 1.35;
  const entryArrow = new THREE.ArrowHelper(
    entryDirW,
    entryWorld.clone().addScaledVector(entryDirW, -0.15),
    arrowLen,
    COL_ENTRY,
    0.35,
    0.22,
  );
  root.add(entryArrow);

  const exitArrow = new THREE.ArrowHelper(
    exitDirW,
    exitWorld.clone().addScaledVector(exitDirW, -0.05),
    arrowLen,
    COL_EXIT,
    0.35,
    0.22,
  );
  root.add(exitArrow);

  return root;
}

/** Convenience for a full procgen {@link PlacedTile} row. */
export function createSocketDebugGroupForPlacedTile(tile: PlacedTile): THREE.Group {
  const def = getTileDefinition(tile.tileType);
  return createSocketDebugGroup(def, tile.position, tile.rotationY);
}
