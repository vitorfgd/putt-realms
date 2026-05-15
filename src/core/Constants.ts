import { PSX_SKY_BLUE } from "../art/Materials";
import { browserDebugConfig } from "../platform-browser/BrowserDebugConfigService";
import type { ProcgenLayoutMode } from "../procgen/MapGenerationTypes";

/** Portrait gameplay composition — 9 : 18 (camera + letterboxed viewport) */
export const GAMEPLAY_ASPECT_WIDTH = 9;
export const GAMEPLAY_ASPECT_HEIGHT = 18;

/** width / height */
export const GAMEPLAY_ASPECT =
  GAMEPLAY_ASPECT_WIDTH / GAMEPLAY_ASPECT_HEIGHT;

/** Scene clear color — matches PSX fantasy sky */
export const SKY_BLUE = PSX_SKY_BLUE;

/**
 * When `true`, the PSX low-res pipeline is always on (URL cannot disable).
 * When `false`, the pipeline defaults on; use `?psxLowRes=false` (or `0` / `off` / `no`)
 * for the stock single-pass `WebGLRenderer.render` path.
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

function isDebugUrlFlagExplicitlyOff(
  flag: string | boolean | null,
): boolean {
  if (flag === null) return false;
  if (flag === true || flag === "") return false;
  if (typeof flag === "string") {
    const v = flag.trim().toLowerCase();
    return v === "0" || v === "false" || v === "off" || v === "no";
  }
  return false;
}

/**
 * Low-res RT pass is on by default. Use `?psxLowRes=false` (or `0` / `off` / `no`) for the stock
 * single-pass `WebGLRenderer.render` path. When {@link ENABLE_PSX_LOW_RES_PIPELINE} is `true`,
 * the pipeline is always on (URL cannot disable).
 */
export function isPsxLowResPipelineActive(): boolean {
  if (ENABLE_PSX_LOW_RES_PIPELINE) return true;
  if (isDebugUrlFlagExplicitlyOff(browserDebugConfig.getFlag("psxLowRes"))) {
    return false;
  }
  return true;
}

/**
 * Procgen debug (`?procgenDebug`): PSX low-res presenter on first load matches the main game default (on).
 * URL `?procgenPsxLowRes=false` or `?psxLowRes=false` opts out; the toolbar toggle updates `procgenPsxLowRes`.
 */
export const PROCGEN_DEBUG_PSX_LOW_RES_DEFAULT = true;

export function isProcgenDebugPsxLowResPreferred(): boolean {
  if (
    isDebugUrlFlagExplicitlyOff(
      browserDebugConfig.getFlag("procgenPsxLowRes"),
    ) ||
    isDebugUrlFlagExplicitlyOff(browserDebugConfig.getFlag("psxLowRes"))
  ) {
    return false;
  }
  if (
    browserDebugConfig.getFlag("procgenPsxLowRes") !== null ||
    browserDebugConfig.getFlag("psxLowRes") !== null
  ) {
    return true;
  }
  return PROCGEN_DEBUG_PSX_LOW_RES_DEFAULT;
}

/** Exact replay: `?procgenSeed=<HUD seed>`; omit param to roll a new layout on each reload. */
export function readProcgenSeedUrlOverride(): string | null {
  const v = browserDebugConfig.getFlag("procgenSeed");
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/**
 * Optional procgen topology override for QA: `?procgenLayout=single_path` or `double_row_straight`.
 * Omit param to use the generator default (double-row). Aliases: `single`, `double`, `2row`.
 */
export function readProcgenLayoutUrlOverride(): ProcgenLayoutMode | null {
  const raw = browserDebugConfig.getFlag("procgenLayout");
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return null;
  if (v === "single_path" || v === "single") return "single_path";
  if (v === "double_row_straight" || v === "double" || v === "2row") {
    return "double_row_straight";
  }
  return null;
}

/** When `true` (default shipped build), `PlayableLevelService` uses procgen endpoint + adapter. Set `false` to use {@link LevelGenerator} only (QA / bisect). */
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
/** Pull length (world units) that reaches 100% power — higher = softer / more pull for full send */
export const POWER_FULL_DRAG_WORLD = 4.55;
export const MAX_SHOT_SPEED = 70;
/** `speed = pow(power01, gamma) * MAX_SHOT_SPEED` — higher gamma = less speed for partial pulls (tighter curve) */
export const SHOT_POWER_CURVE_GAMMA = 1.72;

export function shotSpeedFromPower01(power01: number): number {
  const p = Math.max(0, Math.min(1, power01));
  return p ** SHOT_POWER_CURVE_GAMMA * MAX_SHOT_SPEED;
}

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
/** Upward kick vs planar shot speed — higher = more lift off the deck on strike */
export const SHOT_LOB_RATIO = 0.24;
/** After landing on grass, damp vertical bounce — 0 = no post-landing hop */
export const GROUND_RESTITUTION_Y = 0;
/** Out-of-bounds when ball falls this far below the deck */
export const FALL_OOB_Y = -16;

/** Hole scoring: max planar speed to count when still outside the commit ring (see Game.tryHoleScore) */
export const HOLE_SCORE_MAX_SPEED = 9;

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
/** Lerp from ball-follow to cup spectator cam at hole-out (see GameCameraController) */
export const HOLE_FINISH_CAM_BLEND_DURATION = 0.58;
/** Ball corkscrew “vacuum slurp” into cup — comic beat before poof */
export const HOLE_VORTEX_DURATION = 0.78;
/** Quick shrink after poof VFX */
export const HOLE_POOF_SHRINK_DURATION = 0.2;
/** Total in-cup animation before celebration / summary */
export const HOLE_SINK_SEQUENCE_DURATION =
  HOLE_VORTEX_DURATION + HOLE_POOF_SHRINK_DURATION;
/** Legacy sink tween length — used for shrink progress after vortex */
export const HOLE_SINK_DURATION = 0.48;
export const HOLE_CELEBRATION_DURATION = 0.42;
export const POST_HOLE_LEVEL_DELAY = 0.8;
export const OOB_MESSAGE_DURATION = 1.45;
