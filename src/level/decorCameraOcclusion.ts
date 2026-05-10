import * as THREE from "three";
import {
  BALL_RADIUS,
  OCCLUSION_EASE_FOLLOW_ZOOM_START,
  OCCLUSION_SKIP_ABOVE_FOLLOW_ZOOM,
} from "../core/Constants";

const BOX = new THREE.Box3();
const _RAY = new THREE.Ray();
const _DIR_SEG = new THREE.Vector3();
const _ORIGIN = new THREE.Vector3();
const _SEG_END = new THREE.Vector3();
const _RAY_HIT = new THREE.Vector3();
const _T_ALONG = new THREE.Vector3();

/** Stop tracing slightly before the ball. */
const BALL_TRACE_END_EPS = BALL_RADIUS + 0.65;

/** Extra padding on world AABB before testing (world units). */
const OCCLUSION_BOX_EXPAND = 1.35;

/**
 * World-axis-aligned bounds vs cam→ball segment — tighter than a bounding sphere on tall
 * narrow props and catches thin meshes after precise vertex expansion.
 */
function segmentHitsExpandedBox(
  segStart: THREE.Vector3,
  segEnd: THREE.Vector3,
  box: THREE.Box3,
): boolean {
  if (box.isEmpty()) return false;

  _DIR_SEG.subVectors(segEnd, segStart);
  const segLen = _DIR_SEG.length();
  if (segLen < 1e-5) return box.containsPoint(segStart);
  _DIR_SEG.multiplyScalar(1 / segLen);

  _RAY.set(segStart, _DIR_SEG);
  const hit = _RAY.intersectBox(box, _RAY_HIT);
  if (hit === null) return false;

  const tHit = _T_ALONG.subVectors(hit, segStart).dot(_DIR_SEG);
  const eps = 0.04;
  return tHit >= eps && tHit <= segLen - eps;
}

const OCC_SCORE_HIDE_BASE = 6;
const OCC_BLOCK_WEIGHT_BASE = 5;
const OCC_CLEAR_WEIGHT = 1;

function showAllTaggedOccluders(
  groups: readonly (THREE.Group | null)[],
): void {
  for (const g of groups) {
    if (!g) continue;
    for (const root of g.children) {
      if (!root.userData.decorOccludesCamera) continue;
      root.visible = true;
      delete root.userData._decorOccScore;
    }
  }
}

function occlusionEase01(followZoom: number): number {
  if (followZoom >= OCCLUSION_SKIP_ABOVE_FOLLOW_ZOOM) return 1;
  if (followZoom <= OCCLUSION_EASE_FOLLOW_ZOOM_START) return 0;
  return (
    (followZoom - OCCLUSION_EASE_FOLLOW_ZOOM_START) /
    (OCCLUSION_SKIP_ABOVE_FOLLOW_ZOOM - OCCLUSION_EASE_FOLLOW_ZOOM_START)
  );
}

function processDecorOcclusionGroup(
  origin: THREE.Vector3,
  segEnd: THREE.Vector3,
  group: THREE.Group,
  scoreToHide: number,
  blockWeight: number,
  boxExpand: number,
): void {
  for (const root of group.children) {
    if (!root.userData.decorOccludesCamera) continue;

    root.updateMatrixWorld(true);
    BOX.setFromObject(root, true);
    if (BOX.isEmpty()) continue;
    BOX.expandByScalar(boxExpand);

    const blocks = segmentHitsExpandedBox(origin, segEnd, BOX);

    let score = (root.userData._decorOccScore as number | undefined) ?? 0;
    if (blocks) score += blockWeight;
    else score -= OCC_CLEAR_WEIGHT;
    score = Math.max(0, Math.min(20, score));
    root.userData._decorOccScore = score;

    root.visible = score < scoreToHide;
  }
}

/**
 * Camera→ball sight-line occlusion for scenery roots tagged `userData.decorOccludesCamera`.
 * Processes multiple groups (island décor, distant floats, …).
 *
 * @param followZoomScale — pass `cameraController.getFollowZoomScale()`; eases culling when zoomed out.
 */
export function updateDecorCameraOcclusion(
  camera: THREE.Camera,
  ballWorld: THREE.Vector3,
  groups: readonly (THREE.Group | null)[],
  followZoomScale = 1,
): void {
  const ease = occlusionEase01(followZoomScale);
  if (ease >= 1) {
    showAllTaggedOccluders(groups);
    return;
  }

  /** 0 = aggressive; 1 = gentle (before full skip). */
  const scoreToHide = OCC_SCORE_HIDE_BASE + ease * 11;
  const blockWeight = OCC_BLOCK_WEIGHT_BASE * (1 - 0.42 * ease);
  const boxExpand = OCCLUSION_BOX_EXPAND + ease * 1.15;

  camera.getWorldPosition(_ORIGIN);

  const rayLen = _ORIGIN.distanceTo(ballWorld);
  if (rayLen < 0.05) return;

  const traceLen = Math.max(0, rayLen - BALL_TRACE_END_EPS);
  if (traceLen < 0.08) return;

  _SEG_END.copy(_ORIGIN).lerp(ballWorld, traceLen / rayLen);

  for (const g of groups) {
    if (!g) continue;
    processDecorOcclusionGroup(
      _ORIGIN,
      _SEG_END,
      g,
      scoreToHide,
      blockWeight,
      boxExpand,
    );
  }
}
