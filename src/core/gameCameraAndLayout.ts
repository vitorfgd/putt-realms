import * as THREE from "three";
import { Ball } from "../gameplay/Ball";
import type { LevelWorldBounds } from "../level/LevelTypes";
import {
  GAMEPLAY_ASPECT,
  GAMEPLAY_CAM_BACK_DIST,
  GAMEPLAY_CAM_HEIGHT,
  GAMEPLAY_CAM_HORIZ_SCALE,
} from "./Constants";

const MIN_CAMERA_ZOOM = 0.58;
const MAX_CAMERA_ZOOM = 1.9;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computePortraitGameplayRect(
  innerWidth: number,
  innerHeight: number,
): { x: number; y: number; width: number; height: number } {
  let gw = innerWidth;
  let gh = gw / GAMEPLAY_ASPECT;
  if (gh > innerHeight) {
    gh = innerHeight;
    gw = gh * GAMEPLAY_ASPECT;
  }
  const x = (innerWidth - gw) / 2;
  const yTop = (innerHeight - gh) / 2;
  const yBottom = innerHeight - yTop - gh;
  return { x, y: yBottom, width: gw, height: gh };
}

/**
 * Eye sits behind the ball along the line to the hole so the cup stays in front — easier to aim than a fixed course shot.
 */
export function computeBallFollowCameraPose(
  ballX: number,
  ballZ: number,
  holeX: number,
  holeZ: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  ballY = 0,
  yawOffset = 0,
  zoomScale = 1,
): void {
  let fx = holeX - ballX;
  let fz = holeZ - ballZ;
  const len = Math.hypot(fx, fz);
  if (len < 0.2) {
    fx = 0;
    fz = 1;
  } else {
    fx /= len;
    fz /= len;
  }
  const zoom = clamp(zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const ox = -fx * GAMEPLAY_CAM_BACK_DIST * zoom;
  const oz = -fz * GAMEPLAY_CAM_BACK_DIST * zoom;
  const c = Math.cos(yawOffset);
  const s = Math.sin(yawOffset);
  const rx = ox * c + oz * s;
  const rz = -ox * s + oz * c;
  const eyeY =
    GAMEPLAY_CAM_HEIGHT * zoom + Math.min(4.5, Math.max(0, ballY)) * 0.42;
  outPos.set(
    ballX + rx * GAMEPLAY_CAM_HORIZ_SCALE,
    eyeY,
    ballZ + rz * GAMEPLAY_CAM_HORIZ_SCALE,
  );
  const tgtY = Ball.RADIUS * 0.58 + ballY;
  outTarget.set(ballX, tgtY, ballZ);
}

export function computeTopDownCameraPose(
  bounds: LevelWorldBounds,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  zoomScale = 1,
  panX = 0,
  panZ = 0,
): void {
  const cx = (bounds.minX + bounds.maxX) / 2 + panX;
  const cz = (bounds.minZ + bounds.maxZ) / 2 + panZ;
  const dx = bounds.maxX - bounds.minX;
  const dz = bounds.maxZ - bounds.minZ;
  const span = Math.max(32, dx, dz);
  const y = (span * 1.45 + 42) * clamp(zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  outPos.set(cx, y, cz);
  outTarget.set(cx, 0, cz);
}

export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else (mat as THREE.Material | undefined)?.dispose();
    }
  });
}
