/** Portrait gameplay composition — 9 : 18 (camera + letterboxed viewport) */
export const GAMEPLAY_ASPECT_WIDTH = 9;
export const GAMEPLAY_ASPECT_HEIGHT = 18;

/** width / height */
export const GAMEPLAY_ASPECT =
  GAMEPLAY_ASPECT_WIDTH / GAMEPLAY_ASPECT_HEIGHT;

import { PSX_SKY_BLUE } from "../art/Materials";

/** Scene clear color — matches PSX fantasy sky */
export const SKY_BLUE = PSX_SKY_BLUE;

/**
 * When `false` and the URL has no `?psxLowRes`, uses the normal single-pass
 * `WebGLRenderer.render` path (fully reversible).
 */
export const ENABLE_PSX_LOW_RES_PIPELINE = false;
/** Integer-ish divisor on gameplay viewport resolution (e.g. 3 ≈ 1/3 per axis). */
export const PSX_LOW_RES_INTERNAL_SCALE = 2;
/**
 * Posterize RGB on the PSX blit (`0` = off). When off, the blit uses `MeshBasicMaterial`
 * so brightness matches the pre-shader path. Enabling uses a shader pass; try 32–40 with
 * {@link PSX_PRESENT_ORDERED_DITHER_STRENGTH} to reduce banding.
 */
export const PSX_PRESENT_COLOR_LEVELS = 0;

/** `0` = off. `0.35`–`0.7` = 4×4 Bayer before / with quantise (low-res pipeline only). */
export const PSX_PRESENT_ORDERED_DITHER_STRENGTH = 0;

/** `0` = off. `0.2`–`0.45` = alternating-row bright/dim (CRT-ish; low-res pipeline only). */
export const PSX_PRESENT_SCANLINE_STRENGTH = 0;

/**
 * Low-res RT pass is on if the constant is true or the page URL includes `?psxLowRes`.
 * Remove the query param and set `ENABLE_PSX_LOW_RES_PIPELINE` to `false` for stock rendering.
 */
export function isPsxLowResPipelineActive(): boolean {
  if (ENABLE_PSX_LOW_RES_PIPELINE) return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("psxLowRes");
}

/** Exact replay: `?procgenSeed=<HUD seed>`; omit param to roll a new layout on each reload. */
export function readProcgenSeedUrlOverride(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("procgenSeed");
  const t = v?.trim();
  return t ? t : null;
}

/** When true, levels come from the procedural map endpoint + adapter; otherwise legacy LevelGenerator. */
export const USE_PROCGEN_ENDPOINT = true;

/** Ball */
export const BALL_RADIUS = 0.34;

/**
 * Hides tagged scenery between camera and ball — wired in `Game` when `true`.
 */
export const ENABLE_DECOR_CAMERA_OCCLUSION = true;

/**
 * Follow zoom (pinch) — same scale as `GameCameraController` [~0.58, 1.9]. At/above this,
 * decor occlusion is off so zoomed-out views are not thinned by culling.
 */
export const OCCLUSION_SKIP_ABOVE_FOLLOW_ZOOM = 1.4;
/**
 * Occlusion is full strength at or below this follow zoom; it eases off between this and
 * {@link OCCLUSION_SKIP_ABOVE_FOLLOW_ZOOM}.
 */
export const OCCLUSION_EASE_FOLLOW_ZOOM_START = 1.04;

/** Drag / shot — clamp keeps aim vector sane at screen edges */
export const MIN_DRAG_WORLD = 0.35;
export const MAX_DRAG_WORLD = 5.0;
/** Pull length (world units) that reaches 100% power — lower than clamp so typical sweeps can max out */
export const POWER_FULL_DRAG_WORLD = 4.1;
export const MAX_SHOT_SPEED = 74;

/** Offer free skip after crawling at low speed away from the cup */
export const STUCK_SKIP_PLANAR_SPEED = 0.11;
export const STUCK_SKIP_SECONDS = 2.5;
/** Min distance from hole center (world units) to count as “bad lie” */
export const STUCK_SKIP_MIN_DIST_FROM_HOLE = 2.9;

/** Physics */
export const PHYS_FRICTION_PER_SEC = 2.8;
export const PHYS_SETTLE_SPEED = 0.06;
export const WALL_RESTITUTION = 0.82;
/** Downward acceleration (world Y-up) */
export const GRAVITY = 38;
/** Upward kick vs planar shot speed — 0 = roll on deck without hop */
export const SHOT_LOB_RATIO = 0;
/** After landing on grass, damp vertical bounce — 0 = no post-landing hop */
export const GROUND_RESTITUTION_Y = 0;
/** Out-of-bounds when ball falls this far below the deck */
export const FALL_OOB_Y = -16;

/** Hole scoring: max planar speed to count (flyovers ignored); raised so cup swirl entries still drop */
export const HOLE_SCORE_MAX_SPEED = 6;

/** Cup “gravity well”: inward pull + mild swirl inside this radius (world xz) */
export const HOLE_PULL_RADIUS = 3.85;
export const HOLE_RADIAL_PULL_ACCEL = 48;
/** Swirl fades out inside this distance so the ball doesn’t orbit the rim forever */
export const HOLE_SWIRL_FADE_DIST = 0.72;
export const HOLE_SWIRL_PULL_ACCEL = 16;
/** Damps tangential velocity near the cup (kills stable loops) */
export const HOLE_ORBIT_DAMP = 18;

/** Course edge: forward (+z) runway past play bounds before OOB */
export const OOB_Z_EXTRA = 7;

/**
 * Follow camera: eye behind the ball toward the hole.
 * Higher {@link GAMEPLAY_CAM_HEIGHT} / shorter {@link GAMEPLAY_CAM_BACK_DIST} ⇒ steeper (less shallow).
 */
export const GAMEPLAY_CAM_HEIGHT = 14.6;
export const GAMEPLAY_CAM_BACK_DIST = 18.2;
/** Multiplier on lateral camera offset — `1` = no extra “stretch” vs height (steepen vs `> 1`). */
export const GAMEPLAY_CAM_HORIZ_SCALE = 1;
/** Position lerp responsiveness (higher = snappier tracking) */
export const GAMEPLAY_CAM_FOLLOW_SMOOTH = 14;
/** Horizontal swipe orbit (radians per CSS pixel) — pointer starts away from ball only */
export const CAM_ORBIT_RAD_PER_PX = 0.0048;
/** Clamp orbit yaw around follow baseline */
export const CAM_ORBIT_YAW_MAX = Math.PI * 1.15;

/** Camera / flow timings (seconds) */
export const PREVIEW_CAMERA_DURATION = 1.32;
export const GAMEPLAY_CAMERA_BLEND_DURATION = 0.82;
export const HOLE_SINK_DURATION = 0.48;
export const HOLE_CELEBRATION_DURATION = 0.42;
export const POST_HOLE_LEVEL_DELAY = 0.8;
export const OOB_MESSAGE_DURATION = 1.45;
