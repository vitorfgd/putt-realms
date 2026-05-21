import * as THREE from "three";
import { Ball } from "../gameplay/Ball";
import type { GeneratedLevel, LevelWorldBounds } from "../level/LevelTypes";
import {
  CAM_ORBIT_YAW_MAX,
  GAMEPLAY_CAM_BACK_DIST,
  GAMEPLAY_CAM_FOLLOW_SMOOTH,
  GAMEPLAY_CAM_HEIGHT,
  GAMEPLAY_CAM_HORIZ_SCALE,
  GAMEPLAY_CAMERA_BLEND_DURATION,
  HOLE_FINISH_CAM_BLEND_DURATION,
  PREVIEW_CAMERA_DURATION,
} from "./Constants";
import { clamp } from "./PlayableLevelService";

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const MIN_CAMERA_ZOOM = 0.58;
const MAX_CAMERA_ZOOM = 1.9;

function computeBallFollowCameraPose(
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
  outTarget.set(ballX, Ball.RADIUS * 0.58 + ballY, ballZ);
}

function computeTopDownCameraPose(
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
  const y =
    (span * 1.45 + 42) * clamp(zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  outPos.set(cx, y, cz);
  outTarget.set(cx, 0, cz);
}

/** Low fairway flyby: beside the lane, gliding from down-range back toward the tee (smooth handoff to follow cam). */
function computeFairwayFlybyPose(
  level: GeneratedLevel,
  t: number,
  zoomScale: number,
  panXZ: THREE.Vector2,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
): void {
  const b = level.bounds;
  const sx = level.startPosition.x;
  const sz = level.startPosition.z;
  const sy = level.startPosition.y;
  const hx = level.holePosition.x;
  const hz = level.holePosition.z;
  const hy = level.holePosition.y;
  const fdx = hx - sx;
  const fdz = hz - sz;
  const fairwayLen = Math.hypot(fdx, fdz);

  const zoom = clamp(zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);

  if (fairwayLen < 1.2) {
    computeTopDownCameraPose(b, outPos, outTarget, zoomScale, panXZ.x, panXZ.y);
    return;
  }

  const fx = fdx / fairwayLen;
  const fz = fdz / fairwayLen;
  const px = -fz;
  const pz = fx;

  const u = clamp((t - 0.02) / 0.96, 0, 1);
  const ease = u * u * (3 - 2 * u);
  /** 1 → at tee: smooth landing near the player for transition to follow cam */
  const fracFromTee = (1 - ease) * 0.9;
  const along = fracFromTee * fairwayLen;

  const sideBase = 7.2 * zoom;
  const side = sideBase + Math.sin(Math.PI * ease) * 1.8;

  const gx = sx + fx * along + panXZ.x;
  const gz = sz + fz * along + panXZ.y;
  const gy = sy + (hy - sy) * (along / fairwayLen);

  /** Low fairway flyby with a mid-flight crest so the shot preview reads like a lofted stroke */
  const arcEase = Math.sin(Math.PI * ease);
  const arcPeak = arcEase * Math.min(6.2, 0.055 * fairwayLen);
  const lift =
    7.6 * zoom + (1 - smoothstep(0, 0.22, t)) * 4.4 + arcPeak;

  outPos.set(gx + px * side, gy + lift, gz + pz * side);

  const aimHole = smoothstep(0.28, 0.85, u);
  const midFx = sx + fx * fairwayLen * 0.38;
  const midFz = sz + fz * fairwayLen * 0.38;
  const midY = sy + (hy - sy) * 0.38;
  const tx = midFx + (hx - midFx) * aimHole;
  const tz = midFz + (hz - midFz) * aimHole;
  const ty =
    midY +
    (hy - midY) * aimHole +
    Ball.RADIUS * 0.55 +
    arcEase * 1.45;
  outTarget.set(tx, ty, tz);
}

export class GameCameraController {
  private readonly previewPos = new THREE.Vector3();
  private readonly previewTarget = new THREE.Vector3();
  private readonly gameplayPos = new THREE.Vector3();
  private readonly gameplayTarget = new THREE.Vector3();
  private readonly followIdeal = new THREE.Vector3();
  private readonly holeSpectatorPos = new THREE.Vector3();
  private readonly holeFinishCamCapturedPos = new THREE.Vector3();
  private readonly holeSpectatorPullTarget = new THREE.Vector3();
  private holeFinishCamCaptured = false;
  private readonly kickOffset = new THREE.Vector3();
  private level: GeneratedLevel | null = null;
  private yawOffset = 0;
  private zoomScale = 1;
  private readonly previewPan = new THREE.Vector2(0, 0);
  private transitionBlend = 0;
  private kickVelocity = 0;
  private kickTime = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  resetForLevel(level: GeneratedLevel, ball: THREE.Vector3): void {
    this.level = level;
    this.yawOffset = 0;
    this.zoomScale = 1;
    this.previewPan.set(0, 0);
    this.transitionBlend = 0;
    this.kickOffset.set(0, 0, 0);
    this.kickVelocity = 0;
    this.kickTime = 0;
    this.holeFinishCamCaptured = false;
    this.computeGameplay(ball);
    this.computeOverview(0);
    this.camera.position.copy(this.previewPos);
    this.camera.lookAt(this.previewTarget);
  }

  previewDuration(): number {
    if (!this.level) return PREVIEW_CAMERA_DURATION;
    const b = this.level.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    return PREVIEW_CAMERA_DURATION + clamp((span - 42) / 100, 0, 2.2);
  }

  beginTransition(ball: THREE.Vector3): void {
    this.transitionBlend = 0;
    this.computeGameplay(ball);
  }

  addYaw(delta: number): void {
    this.yawOffset = clamp(this.yawOffset + delta, -CAM_ORBIT_YAW_MAX, CAM_ORBIT_YAW_MAX);
  }

  addZoom(delta: number): void {
    this.zoomScale = clamp(
      this.zoomScale * Math.exp(delta * 0.001),
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM,
    );
  }

  /** Clamped follow pinch zoom — used by decor occlusion to ease culling when zoomed out. */
  getFollowZoomScale(): number {
    return clamp(this.zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  }

  panPreview(dxPixels: number, dyPixels: number, viewportHeight: number): void {
    if (!this.level) return;
    const phaseSpan = Math.max(
      32,
      this.level.bounds.maxX - this.level.bounds.minX,
      this.level.bounds.maxZ - this.level.bounds.minZ,
    );
    const worldPerPixel = (phaseSpan * this.zoomScale) / Math.max(1, viewportHeight);
    this.previewPan.x -= dxPixels * worldPerPixel;
    this.previewPan.y += dyPixels * worldPerPixel;
    const limit = phaseSpan * 0.55;
    this.previewPan.x = clamp(this.previewPan.x, -limit, limit);
    this.previewPan.y = clamp(this.previewPan.y, -limit, limit);
  }

  kick(power01: number): void {
    this.kickVelocity = Math.max(this.kickVelocity, clamp(power01, 0, 1) * 0.55);
    this.kickTime = 0.18;
  }

  updatePreview(elapsed01: number): void {
    this.computeOverview(clamp(elapsed01, 0, 1));
    this.camera.position.copy(this.previewPos);
    this.camera.lookAt(this.previewTarget);
  }

  updateTransition(deltaSeconds: number, ball: THREE.Vector3): boolean {
    this.transitionBlend += deltaSeconds / GAMEPLAY_CAMERA_BLEND_DURATION;
    this.computeGameplay(ball);
    const raw = clamp(this.transitionBlend, 0, 1);
    const k = raw * raw * (3 - 2 * raw);
    this.camera.position.lerpVectors(this.previewPos, this.gameplayPos, k);
    const tgt = new THREE.Vector3().lerpVectors(
      this.previewTarget,
      this.gameplayTarget,
      k,
    );
    this.camera.lookAt(tgt);
    return this.transitionBlend >= 1;
  }

  updateFollow(deltaSeconds: number, ball: THREE.Vector3): void {
    if (!this.level) return;
    const hp = this.level.holePosition;
    computeBallFollowCameraPose(
      ball.x,
      ball.z,
      hp.x,
      hp.z,
      this.followIdeal,
      this.gameplayTarget,
      ball.y,
      this.yawOffset,
      this.zoomScale,
    );
    this.updateKick(deltaSeconds);
    const alpha = 1 - Math.exp(-GAMEPLAY_CAM_FOLLOW_SMOOTH * deltaSeconds);
    this.camera.position.lerp(this.followIdeal.add(this.kickOffset), alpha);
    this.camera.lookAt(this.gameplayTarget);
  }

  /**
   * Hole-out sequence: ease from the current gameplay camera into a fixed cup-side spectator
   * frame. The look target stays on the cup so the suction reads clearly while the ball spirals.
   */
  updateHoleFinishCinematic(
    hole: { x: number; y: number; z: number },
    start: { x: number; y: number; z: number },
    levelCompleteTimer: number,
    vortex01: number,
  ): void {
    if (!this.level) return;
    const hp = hole;
    const sx = start.x;
    const sz = start.z;
    if (!this.holeFinishCamCaptured) {
      this.holeFinishCamCaptured = true;
      this.holeFinishCamCapturedPos.copy(this.camera.position);
    }
    this.computeHoleSpectatorPose(hp, sx, sz, this.holeSpectatorPos);
    const zoom = clamp(this.zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    const vortexPull = smoothstep(0.22, 1, clamp(vortex01, 0, 1));
    this.holeSpectatorPullTarget.set(
      hp.x,
      hp.y + Ball.RADIUS * 1.1 + 5.2 * zoom,
      hp.z,
    );
    this.holeSpectatorPos.lerp(this.holeSpectatorPullTarget, vortexPull * 0.22);
    const posBlend = smoothstep(
      0,
      HOLE_FINISH_CAM_BLEND_DURATION,
      levelCompleteTimer,
    );
    const posEase = posBlend * posBlend * (3 - 2 * posBlend);
    this.camera.position.lerpVectors(
      this.holeFinishCamCapturedPos,
      this.holeSpectatorPos,
      posEase,
    );
    const cupLookY = hp.y + Ball.RADIUS * 0.42;
    this.gameplayTarget.set(hp.x, cupLookY, hp.z);
    this.camera.lookAt(this.gameplayTarget);
  }

  /** Eye beside the cup along fairway normal — stable while the ball corkscrews in XZ. */
  private computeHoleSpectatorPose(
    hole: { x: number; y: number; z: number },
    startX: number,
    startZ: number,
    outPos: THREE.Vector3,
  ): void {
    const vx = hole.x - startX;
    const vz = hole.z - startZ;
    const vlen = Math.hypot(vx, vz) || 1;
    const fx = vx / vlen;
    const fz = vz / vlen;
    const rx = -fz;
    const rz = fx;
    const zoom = clamp(this.zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    const side = 15.2 * zoom;
    const lift = 10.2 * zoom;
    const fwd = 4.1 * zoom;
    outPos.set(
      hole.x + rx * side + fx * fwd,
      hole.y + lift,
      hole.z + rz * side + fz * fwd,
    );
  }

  updateFog(scene: THREE.Scene): void {
    if (!this.level) return;
    const span = Math.max(
      this.level.bounds.maxX - this.level.bounds.minX,
      this.level.bounds.maxZ - this.level.bounds.minZ,
    );
    const near = 78 + span * 0.28;
    const far = 240 + span * 1.7;
    scene.fog = new THREE.Fog(0x9fe7ff, near, far);
  }

  private computeGameplay(ball: THREE.Vector3): void {
    if (!this.level) return;
    const hp = this.level.holePosition;
    computeBallFollowCameraPose(
      ball.x,
      ball.z,
      hp.x,
      hp.z,
      this.gameplayPos,
      this.gameplayTarget,
      ball.y,
      this.yawOffset,
      this.zoomScale,
    );
  }

  private computeOverview(t: number): void {
    if (!this.level) return;
    computeFairwayFlybyPose(
      this.level,
      t,
      this.zoomScale,
      this.previewPan,
      this.previewPos,
      this.previewTarget,
    );
  }

  private updateKick(deltaSeconds: number): void {
    if (this.kickTime <= 0) {
      this.kickOffset.lerp(new THREE.Vector3(0, 0, 0), 0.2);
      return;
    }
    this.kickTime -= deltaSeconds;
    const pulse = Math.sin((this.kickTime / 0.18) * Math.PI);
    this.kickOffset.set(0, pulse * this.kickVelocity * 0.35, pulse * this.kickVelocity);
  }
}
