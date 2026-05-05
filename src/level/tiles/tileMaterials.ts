import * as THREE from "three";
import {
  cloudWhite,
  holeCupDark,
  warmCreamStone,
  woodBrown,
} from "../../art/Materials";

/** Pastel fairway base: cute, soft, and readable against cream rails. */
export const GRASS_COLOR = 0x98dba8;

let grassMat: THREE.MeshStandardMaterial | null = null;

function createPastelGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#98dba8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 12) {
    ctx.fillStyle =
      y % 24 === 0 ? "rgba(255,255,255,0.13)" : "rgba(85,170,108,0.12)";
    ctx.fillRect(0, y, canvas.width, 6);
  }
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const h = 2 + Math.random() * 4;
    ctx.strokeStyle =
      Math.random() > 0.5
        ? "rgba(242,255,229,0.35)"
        : "rgba(78,152,93,0.22)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, y - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1.6);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function grassMaterial(): THREE.MeshStandardMaterial {
  if (!grassMat) {
    grassMat = new THREE.MeshStandardMaterial({
      color: GRASS_COLOR,
      map: createPastelGrassTexture(),
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.28,
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
