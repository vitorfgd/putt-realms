import * as THREE from "three";

/**
 * Chunky low-segment cylinder for PS1-style props (posts, coins, stems).
 */
export function createLowPolyCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 8,
  heightSegments = 1,
): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
    false,
  );
}

export interface PixelTextureOptions {
  /** Canvas resolution — keep small for mobile (32–128). */
  size?: number;
  baseColor: number;
  /** Channel noise strength 0–1 */
  noiseAmount?: number;
  /** Mosaic block size in texels (≥1). Larger = chunkier. */
  pixelSize?: number;
}

const textureCache = new Map<string, THREE.CanvasTexture>();

function cacheKey(o: PixelTextureOptions): string {
  return `${o.size ?? 64}|${o.baseColor}|${o.noiseAmount ?? 0.12}|${o.pixelSize ?? 4}`;
}

/**
 * Simple procedural grain + chunky upscale for a subtle pixel/crunch feel.
 * Textures are cached by options; reuse materials to stay GPU-light.
 */
export function createPixelTexture(options: PixelTextureOptions): THREE.CanvasTexture {
  const key = cacheKey(options);
  const existing = textureCache.get(key);
  if (existing) return existing;

  const size = options.size ?? 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d context unavailable");
  }

  const base = options.baseColor >>> 0;
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  const noise = options.noiseAmount ?? 0.12;
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * noise * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.92));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.88));
  }
  ctx.putImageData(img, 0, 0);

  const pixelSize = Math.max(1, Math.floor(options.pixelSize ?? 4));
  if (pixelSize > 1) {
    const sw = Math.max(1, Math.ceil(size / pixelSize));
    const sh = Math.max(1, Math.ceil(size / pixelSize));
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const tctx = tmp.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(canvas, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, size, size);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Duplicate verts so each triangle owns normals — reads chunky under `flatShading`.
 * Caller owns lifecycle (dispose geometry when done).
 */
export function applyFlatShading(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.computeVertexNormals();
  return g;
}

/**
 * Very subtle vertex wobble for hand-crafted PS1 imperfection (keep amount tiny).
 */
export function snapVertexJitter(
  geometry: THREE.BufferGeometry,
  amount: number,
  rng: () => number = Math.random,
): void {
  const pos = geometry.getAttribute("position");
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (rng() - 0.5) * amount);
    pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount);
    pos.setZ(i, pos.getZ(i) + (rng() - 0.5) * amount);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}
