import * as THREE from "three";
import {
  cloudWhite,
  holeCupDark,
  warmCreamStone,
  woodBrown,
} from "../../art/Materials";

/** Fallback tint before atlas grass map finishes loading */
export const GRASS_COLOR = 0x98dba8;

const DECK_GRASS_ATLAS_URL = encodeURI("/assets/models/tile tex 256.png");

/** Grass checkerboard region in `tile tex 256.png` (atlas is 256×256) */
const GRASS_ATLAS_CROP = { sx: 0, sy: 0, sw: 182, sh: 182 } as const;

let grassMat: THREE.MeshStandardMaterial | null = null;
let grassTexLoadStarted = false;

function startDeckGrassTextureLoad(mat: THREE.MeshStandardMaterial): void {
  if (grassTexLoadStarted) return;
  grassTexLoadStarted = true;
  const loader = new THREE.TextureLoader();
  loader.load(
    DECK_GRASS_ATLAS_URL,
    (atlasTex) => {
      const img = atlasTex.image as HTMLImageElement;
      const { sx, sy, sw, sh } = GRASS_ATLAS_CROP;
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      atlasTex.dispose();

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1.6, 1.6);
      tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      mat.map = tex;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    },
    undefined,
    () => {
      grassTexLoadStarted = false;
    },
  );
}

export function grassMaterial(): THREE.MeshStandardMaterial {
  if (!grassMat) {
    grassMat = new THREE.MeshStandardMaterial({
      color: GRASS_COLOR,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.28,
    });
    startDeckGrassTextureLoad(grassMat);
  }
  return grassMat;
}

/** Kick off deck grass atlas fetch — call during bootstrap so the map is often ready before play */
export function preloadDeckGrassTexture(): void {
  grassMaterial();
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
