import * as THREE from "three";
import { createPixelTexture } from "./PsxStyle";

/** Bundled asset URL — reliable in Vite dev + production (hash-stable) */
const GOLF_BALL_ALBEDO_ASSET = new URL(
  "../assets/textures/golf_ball.png",
  import.meta.url,
).href;

/** Scene background / fog-friendly sky tone — bright fantasy blue */
export const PSX_SKY_BLUE = 0x78d4ff;

const tex = {
  meadow: () =>
    createPixelTexture({
      size: 64,
      baseColor: 0x52e078,
      noiseAmount: 0.16,
      pixelSize: 4,
    }),
  cream: () =>
    createPixelTexture({
      size: 64,
      baseColor: 0xf3e6d2,
      noiseAmount: 0.11,
      pixelSize: 4,
    }),
  gold: () =>
    createPixelTexture({
      size: 48,
      baseColor: 0xffcc33,
      noiseAmount: 0.18,
      pixelSize: 3,
    }),
  wood: () =>
    createPixelTexture({
      size: 56,
      baseColor: 0x9a6240,
      noiseAmount: 0.14,
      pixelSize: 4,
    }),
  sand: () =>
    createPixelTexture({
      size: 56,
      baseColor: 0xf0d070,
      noiseAmount: 0.15,
      pixelSize: 4,
    }),
  cloud: () =>
    createPixelTexture({
      size: 48,
      baseColor: 0xf8fdff,
      noiseAmount: 0.08,
      pixelSize: 6,
    }),
};

type MatKey =
  | "meadowGreen"
  | "warmCreamStone"
  | "goldCoin"
  | "woodBrown"
  | "sandGold"
  | "cloudWhite";

const singletons: Partial<Record<MatKey, THREE.MeshStandardMaterial>> = {};

function psxStandard(
  key: MatKey,
  map: THREE.Texture,
  overrides?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.MeshStandardMaterial {
  let m = singletons[key];
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 0.35,
      ...overrides,
    });
    singletons[key] = m;
  }
  return m;
}

export function meadowGreen(): THREE.MeshStandardMaterial {
  return psxStandard("meadowGreen", tex.meadow());
}

export function warmCreamStone(): THREE.MeshStandardMaterial {
  return psxStandard("warmCreamStone", tex.cream());
}

export function goldCoin(): THREE.MeshStandardMaterial {
  return psxStandard("goldCoin", tex.gold(), {
    metalness: 0.06,
    roughness: 0.92,
  });
}

export function woodBrown(): THREE.MeshStandardMaterial {
  return psxStandard("woodBrown", tex.wood());
}

export function sandGold(): THREE.MeshStandardMaterial {
  return psxStandard("sandGold", tex.sand());
}

/** Cloud blobs & under-course void — bright white */
export function cloudWhite(): THREE.MeshStandardMaterial {
  return psxStandard("cloudWhite", tex.cloud(), {
    roughness: 1,
    metalness: 0,
  });
}

/** Bright fantasy sky — solid props / tuning reference. */
let skyBlueSolid: THREE.MeshStandardMaterial | null = null;
export function skyBlue(): THREE.MeshStandardMaterial {
  if (!skyBlueSolid) {
    skyBlueSolid = new THREE.MeshStandardMaterial({
      color: PSX_SKY_BLUE,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
  }
  return skyBlueSolid;
}

/** Speed-pad chevrons on the grass — unlit so they read clearly */
let boostPadArrowMat: THREE.MeshBasicMaterial | null = null;
export function boostPadArrowBlue(): THREE.MeshBasicMaterial {
  if (!boostPadArrowMat) {
    boostPadArrowMat = new THREE.MeshBasicMaterial({
      color: 0x1f7cff,
      toneMapped: false,
    });
  }
  return boostPadArrowMat;
}

/** Under-bridge / water plane — same hue, no gloss */
let skyBlueTransMat: THREE.MeshStandardMaterial | null = null;
export function skyBlueTransparent(opacity = 0.38): THREE.MeshStandardMaterial {
  if (!skyBlueTransMat || Math.abs(skyBlueTransMat.opacity - opacity) > 1e-5) {
    skyBlueTransMat = new THREE.MeshStandardMaterial({
      color: PSX_SKY_BLUE,
      transparent: true,
      opacity,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      depthWrite: false,
    });
  }
  return skyBlueTransMat;
}

/** Bridge side gaps / OOB strip — reads as danger (not grass or sky water) */
let hazardBridgeGapRedMat: THREE.MeshStandardMaterial | null = null;
export function hazardBridgeGapRed(opacity = 0.5): THREE.MeshStandardMaterial {
  if (
    !hazardBridgeGapRedMat ||
    Math.abs(hazardBridgeGapRedMat.opacity - opacity) > 1e-5
  ) {
    hazardBridgeGapRedMat = new THREE.MeshStandardMaterial({
      color: 0xc41e1e,
      transparent: true,
      opacity,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }
  return hazardBridgeGapRedMat;
}

/** Cup interior / shadow wells — not glossy */
let holeCupDarkMat: THREE.MeshStandardMaterial | null = null;
export function holeCupDark(): THREE.MeshStandardMaterial {
  if (!holeCupDarkMat) {
    holeCupDarkMat = new THREE.MeshStandardMaterial({
      color: 0x1a2420,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
  }
  return holeCupDarkMat;
}

/** Bundled portal swirl — hole cup surface (transparent edges) */
const HOLE_PORTAL_ASSET = new URL(
  "../assets/textures/hole_portal.png",
  import.meta.url,
).href;

let holeCupPortalMat: THREE.MeshBasicMaterial | null = null;

/**
 * Unlit textured cup — shared across holes. PNG alpha preserved.
 * Call {@link preloadHolePortalTexture} early so the map is usually ready before first paint.
 */
export function holeCupPortalSurfaceMaterial(): THREE.MeshBasicMaterial {
  if (!holeCupPortalMat) {
    holeCupPortalMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -0.8,
      polygonOffsetUnits: -0.8,
    });
    const loader = new THREE.TextureLoader();
    loader.load(
      HOLE_PORTAL_ASSET,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        if (holeCupPortalMat) {
          holeCupPortalMat.map = tex;
          holeCupPortalMat.needsUpdate = true;
        }
      },
      undefined,
      () => {
        /* keep flat white cup */
      },
    );
  }
  return holeCupPortalMat;
}

/** Ensures portal material exists and loading has started — invoke from main before Game */
export function preloadHolePortalTexture(): void {
  holeCupPortalSurfaceMaterial();
}

/** Saturated fantasy flag — flat, readable silhouette */
let holeFlagRedMat: THREE.MeshStandardMaterial | null = null;
export function holeFlagRed(): THREE.MeshStandardMaterial {
  if (!holeFlagRedMat) {
    holeFlagRedMat = new THREE.MeshStandardMaterial({
      color: 0xff5560,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
  }
  return holeFlagRedMat;
}

/** Aim line — warm readable streak */
let aimStripeMat: THREE.MeshStandardMaterial | null = null;
export function aimStripe(): THREE.MeshStandardMaterial {
  if (!aimStripeMat) {
    aimStripeMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c8,
      emissive: 0xffcc88,
      emissiveIntensity: 0.12,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
  }
  return aimStripeMat;
}

/** Fan housing — misty stone */
let fanStoneMat: THREE.MeshStandardMaterial | null = null;
export function fanStone(): THREE.MeshStandardMaterial {
  if (!fanStoneMat) {
    fanStoneMat = new THREE.MeshStandardMaterial({
      color: 0xd8eef8,
      map: tex.cream(),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
  }
  return fanStoneMat;
}

/** Blade metal — matte fantasy steel */
let bladeSteelMat: THREE.MeshStandardMaterial | null = null;
export function bladeSteel(): THREE.MeshStandardMaterial {
  if (!bladeSteelMat) {
    bladeSteelMat = new THREE.MeshStandardMaterial({
      color: 0xc8d0e8,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true,
    });
  }
  return bladeSteelMat;
}

/** Soft bright cloud deck below the course */
let cloudVoidMat: THREE.MeshStandardMaterial | null = null;
export function cloudVoid(): THREE.MeshStandardMaterial {
  if (!cloudVoidMat) {
    cloudVoidMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.cloud(),
      roughness: 1,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 0.15,
    });
  }
  return cloudVoidMat;
}

let golfBallAlbedoMap: THREE.Texture | null = null;

function getGolfBallAlbedoMap(): THREE.Texture {
  if (!golfBallAlbedoMap) {
    const loader = new THREE.TextureLoader();
    golfBallAlbedoMap = loader.load(GOLF_BALL_ALBEDO_ASSET, (tex) => {
      tex.needsUpdate = true;
    });
    golfBallAlbedoMap.wrapS = THREE.RepeatWrapping;
    golfBallAlbedoMap.wrapT = THREE.RepeatWrapping;
    /** Single seamless sheet — one wrap around the sphere (was 3×3 tile for dimple-only atlas) */
    golfBallAlbedoMap.repeat.set(1, 1);
    golfBallAlbedoMap.anisotropy = 8;
    golfBallAlbedoMap.colorSpace = THREE.SRGBColorSpace;
    golfBallAlbedoMap.generateMipmaps = true;
    golfBallAlbedoMap.minFilter = THREE.LinearMipmapLinearFilter;
    golfBallAlbedoMap.magFilter = THREE.LinearFilter;
  }
  return golfBallAlbedoMap;
}

/** Unlit base — `golf_ball.png` albedo stays visible regardless of scene lighting */
let defaultBall: THREE.MeshBasicMaterial | null = null;
export function createDefaultBallMaterial(): THREE.MeshBasicMaterial {
  if (!defaultBall) {
    const map = getGolfBallAlbedoMap();
    defaultBall = new THREE.MeshBasicMaterial({
      map,
      color: 0xffffff,
    });
  }
  return defaultBall;
}
