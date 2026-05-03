/**
 * Tile surface materials — grass is a single flat color (no noisy PSX texture).
 */
import * as THREE from "three";
import {
  cloudWhite,
  holeCupDark,
  warmCreamStone,
  woodBrown,
} from "../../art/Materials";

/** Unified grass tint — between the old dark and overly light mint */
export const GRASS_COLOR = 0x7ec9a0;

let grassMat: THREE.MeshStandardMaterial | null = null;

export function grassMaterial(): THREE.MeshStandardMaterial {
  if (!grassMat) {
    grassMat = new THREE.MeshStandardMaterial({
      color: GRASS_COLOR,
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.36,
    });
  }
  return grassMat;
}

export function creamRailMaterial(): ReturnType<typeof warmCreamStone> {
  return warmCreamStone();
}

export function brownBaseMaterial(): ReturnType<typeof woodBrown> {
  return woodBrown();
}

export function cupDarkMaterial(): ReturnType<typeof holeCupDark> {
  return holeCupDark();
}

export function cloudMaterial(): ReturnType<typeof cloudWhite> {
  return cloudWhite();
}
