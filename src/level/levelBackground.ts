import * as THREE from "three";

/** Bundled PNG — same art as HUD `.hud-badge--level` / optional `public/` copy */
export const LEVEL_BACKGROUND_TEXTURE_URL = new URL(
  "../assets/textures/level_background.png",
  import.meta.url,
).href;

/**
 * Plane size that fills the camera frustum at `distance` while preserving
 * texture aspect (CSS object-fit: cover).
 */
export function computeBackdropPlaneSize(
  camera: THREE.PerspectiveCamera,
  distance: number,
  texAspect: number,
): { width: number; height: number } {
  const vRad = (camera.fov * Math.PI) / 180;
  const viewH = 2 * Math.tan(vRad / 2) * distance;
  const viewW = viewH * camera.aspect;
  let pw = viewW;
  let ph = pw / texAspect;
  if (ph < viewH) {
    ph = viewH;
    pw = ph * texAspect;
  }
  const margin = 1.05;
  return { width: pw * margin, height: ph * margin };
}

export function loadLevelBackgroundTexture(): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      LEVEL_BACKGROUND_TEXTURE_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

function textureAspect(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (img?.width && img?.height) return img.width / img.height;
  return 1;
}

export function createLevelBackdropMesh(
  texture: THREE.Texture,
  camera: THREE.PerspectiveCamera,
  distance: number,
): THREE.Mesh {
  const ta = textureAspect(texture);
  const { width, height } = computeBackdropPlaneSize(camera, distance, ta);
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 1,
    toneMapped: false,
    /** Avoid one-sided plane disappearing depending on camera/plane alignment */
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "LevelBackdrop";
  /** Slight lift so art sits comfortably in the tilted follow-framing */
  mesh.position.set(0, 6, -distance);
  mesh.renderOrder = -400;
  return mesh;
}

export function resizeLevelBackdropMesh(
  mesh: THREE.Mesh,
  texture: THREE.Texture,
  camera: THREE.PerspectiveCamera,
  distance: number,
): void {
  const ta = textureAspect(texture);
  const { width, height } = computeBackdropPlaneSize(camera, distance, ta);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.PlaneGeometry(width, height);
}
