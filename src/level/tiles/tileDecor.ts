import * as THREE from "three";
import { goldCoin, warmCreamStone, woodBrown } from "../../art/Materials";
import { grassMaterial } from "./tileMaterials";
import { createLowPolyCylinder, snapVertexJitter } from "../../art/PsxStyle";
import type { PlacedTile } from "../LevelTypes";
import { LANE_HALF_WIDTH, TILE_SIZE } from "../TileDimensions";

function tileRng(tile: PlacedTile, salt: number): () => number {
  let s =
    tile.gridX * 1103515245 +
    tile.gridZ * 12345 +
    salt +
    (tile.type.charCodeAt(0) ?? 0);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0xfffffff;
  };
}

/**
 * Sparse lane-edge props — fantasy flair without blocking reads on the path.
 */
export function addSparseDecor(root: THREE.Object3D, tile: PlacedTile): void {
  if (tile.type === "hole") return;

  const rng = tileRng(tile, 91);
  const density = tile.type === "start" ? 0.18 : 0.34;
  if (rng() > density) return;

  const kindRoll = rng();
  const x = (rng() - 0.5) * LANE_HALF_WIDTH * 2.25;
  const z = (rng() - 0.5) * TILE_SIZE * 0.82;
  /** Clear the rolling lane center */
  if (Math.abs(x) < 1.05 && Math.abs(z) < TILE_SIZE * 0.28) return;

  const g = new THREE.Group();

  if (kindRoll < 0.34) {
    const stem = new THREE.Mesh(
      createLowPolyCylinder(0.035, 0.048, 0.26, 5),
      woodBrown(),
    );
    stem.position.y = 0.13;
    const head = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.11, 0),
      grassMaterial(),
    );
    head.position.y = 0.32;
    const eye = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.045, 0),
      goldCoin(),
    );
    eye.position.y = 0.34;
    eye.position.z = 0.06;
    g.add(stem, head, eye);
  } else if (kindRoll < 0.66) {
    const stem = new THREE.Mesh(
      createLowPolyCylinder(0.06, 0.07, 0.18, 6),
      woodBrown(),
    );
    stem.position.y = 0.09;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      warmCreamStone(),
    );
    cap.scale.set(1, 0.65, 1);
    cap.position.y = 0.26;
    g.add(stem, cap);
  } else {
    const rockGeo = new THREE.DodecahedronGeometry(0.2 + rng() * 0.12, 0);
    snapVertexJitter(rockGeo, 0.028, rng);
    const rock = new THREE.Mesh(rockGeo, warmCreamStone());
    rock.rotation.set(rng() * 5, rng() * 5, rng() * 5);
    g.add(rock);
  }

  g.position.set(x, 0, z);
  g.rotation.y = rng() * Math.PI * 2;
  root.add(g);
}
