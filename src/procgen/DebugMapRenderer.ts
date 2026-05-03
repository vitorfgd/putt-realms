import * as THREE from "three";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
} from "./TileCatalog";
import { PROC_GEN_MODEL_TARGET_MAX_EXTENT } from "./procgenModelScale";
import type { GeneratedMap, TileType } from "./MapGenerationTypes";

/**
 * Debug-only placeholder meshes when artist GLBs are missing from {@link AssetRegistry}.
 * Does not replace real asset loading — attach this group behind/in parallel with production tiles.
 */
const TYPE_COLOR_HEX: Record<TileType, number> = {
  straight_right_wall: 0x6ecf7a,
  convex_right_wall: 0xffc857,
  concave_right_wall: 0x6ab0ff,
  ramp_right_wall: 0xd96cff,
  ramp_left_wall: 0xff6bcd,
  floor_plain: 0x6ecf7a,
  start_placeholder: 0xffffff,
  hole_placeholder: 0x222222,
};

function shortTileType(type: TileType): string {
  switch (type) {
    case "straight_right_wall":
      return "straight_right_wall";
    case "convex_right_wall":
      return "convex_right_wall";
    case "concave_right_wall":
      return "concave_right_wall";
    case "ramp_right_wall":
      return "ramp_right_wall";
    case "ramp_left_wall":
      return "ramp_left_wall";
    case "floor_plain":
      return "floor_plain";
    case "start_placeholder":
      return "start_placeholder";
    case "hole_placeholder":
      return "hole_placeholder";
  }
}

function createTileLabelSprite(coord: string, type: TileType): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.roundRect(10, 16, 492, 128, 16);
    ctx.fill();
    ctx.strokeStyle = "#e8f4ff";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(coord, 256, 58);
    ctx.fillStyle = "#b8ffcb";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(shortTileType(type), 256, 108);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(6.2, 1.95, 1);
  sprite.renderOrder = 1100;
  return sprite;
}

/**
 * Builds a group of colored slabs + poles at each tile **deck** center (matches gameplay root placement).
 */
export function createDebugPlaceholderGroup(map: GeneratedMap): THREE.Group {
  const root = new THREE.Group();
  root.name = "ProcgenDebugPlaceholders";
  const gridPath = Array.isArray(map.debugInfo["gridPath"])
    ? map.debugInfo["gridPath"] as { x: number; z: number }[]
    : [];

  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    const def = getTileDefinition(t.tileType);
    const deck = deckCenterWorldFromPivot(t.position, t.rotationY, def);
    const color = TYPE_COLOR_HEX[t.tileType] ?? 0xcccccc;
    const mat = new THREE.MeshBasicMaterial({
      color,
      wireframe: false,
      transparent: true,
      opacity: 0.85,
    });
    const s = PROC_GEN_MODEL_TARGET_MAX_EXTENT;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(s, 0.12, s),
      mat,
    );
    mesh.position.set(deck.x, 0.15, deck.z);
    mesh.rotation.y = t.rotationY;
    mesh.renderOrder = 400;
    mesh.name = `dbg_${t.tileType}_${t.id}`;
    root.add(mesh);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }),
    );
    pole.position.set(deck.x, 0.8, deck.z);
    root.add(pole);

    const cell = gridPath[i];
    const coord = cell
      ? `(${cell.x},${cell.z})`
      : `#${i}`;
    const label = createTileLabelSprite(coord, t.tileType);
    label.position.set(deck.x, deck.y + 2.25, deck.z);
    label.name = `dbg_label_${coord}_${t.tileType}`;
    root.add(label);
  }

  return root;
}

function createTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.roundRect(8, 16, 240, 64, 14);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 49);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 1.8, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function createEndpointMarker(
  label: string,
  pos: THREE.Vector3,
  color: number,
  textColor: string,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `ProcgenDebug${label}Marker`;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.68, 32),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y + 0.08, pos.z);
  ring.renderOrder = 999;
  root.add(ring);

  const sprite = createTextSprite(label, textColor);
  sprite.position.set(pos.x, pos.y + 2.2, pos.z);
  root.add(sprite);

  return root;
}

export function createDebugEndpointLabels(map: GeneratedMap): THREE.Group {
  const root = new THREE.Group();
  root.name = "ProcgenDebugEndpointLabels";
  root.add(createEndpointMarker("START", map.startPosition, 0x33ff77, "#7cff9f"));
  root.add(createEndpointMarker("END", map.holePosition, 0xffd84a, "#ffe28a"));
  return root;
}
