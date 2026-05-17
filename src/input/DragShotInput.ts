import * as THREE from "three";
import type { Vec2Like } from "../core/math";
import type { ShotIntent } from "./ShotIntent";

export interface DragShotContext {
  /** When omitted, treated as always true */
  isInteractionEnabled?: () => boolean;
  readonly camera: THREE.PerspectiveCamera;
  readonly planeY: number;
  readonly getPlaneY?: () => number;
  readonly ballRadius: number;
  readonly minDragWorld: number;
  readonly maxDragWorld: number;
  /** If set, power meter reaches 100% at this pull length (≤ maxDragWorld). */
  readonly powerFullDragWorld?: number;
  /** Gameplay sub-rectangle inside the canvas (client pixels, top-left origin). */
  getGameplayScreenBounds(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  getBallWorld(): THREE.Vector3;
  /** Whether a new drag may start (ball idle, run phase, etc.) */
  canBeginShot(): boolean;
  onShot(intent: ShotIntent): void;
  onDragCancel(): void;
  /** Fires when a drag starts (AwaitingShot → Aiming). */
  onAimBegin?: () => void;
}

/**
 * Pull back from the ball (drag vector = anchor → pointer on lane plane).
 * Shot direction is opposite the drag; power scales with drag length (clamped).
 */
export class DragShotInput {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ballCenterWorld = new THREE.Vector3();
  private readonly ballEdgeWorld = new THREE.Vector3();
  private readonly cameraRightWorld = new THREE.Vector3();
  private readonly projectedCenter = new THREE.Vector3();
  private readonly projectedEdge = new THREE.Vector3();

  private dragging = false;
  /** Latest pull vector on xz while dragging (world space, y unused). */
  private readonly pull = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: DragShotContext,
  ) {}

  attach(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
  }

  isAiming(): boolean {
    return this.dragging;
  }

  /** Lane-plane hit near ball — camera orbit skips so shot aim keeps this gesture */
  isPointerNearBall(clientX: number, clientY: number): boolean {
    return this.pointerNearBall(clientX, clientY);
  }

  /** Live preview for HUD / aim line (null when not dragging). */
  getShotPreview(): {
    shotDirXZ: Vec2Like;
    pullLength: number;
    power01: number;
  } | null {
    if (!this.dragging) return null;
    const len = Math.hypot(this.pull.x, this.pull.z);
    if (len < 1e-6) {
      return {
        shotDirXZ: { x: 1, y: 0 },
        pullLength: 0,
        power01: 0,
      };
    }
    const shotDir = { x: -this.pull.x / len, y: -this.pull.z / len };
    const powerNorm =
      this.ctx.powerFullDragWorld ?? this.ctx.maxDragWorld;
    const power01 = Math.min(1, len / powerNorm);
    return { shotDirXZ: shotDir, pullLength: len, power01 };
  }

  private clientToNdc(clientX: number, clientY: number): THREE.Vector2 {
    const b = this.ctx.getGameplayScreenBounds();
    const nx = ((clientX - b.left) / b.width) * 2 - 1;
    const ny = -(((clientY - b.top) / b.height) * 2 - 1);
    this.ndc.set(nx, ny);
    return this.ndc;
  }

  private intersectLane(clientX: number, clientY: number): THREE.Vector3 | null {
    this.clientToNdc(clientX, clientY);
    this.raycaster.setFromCamera(this.ndc, this.ctx.camera);
    this.plane.constant = -(this.ctx.getPlaneY?.() ?? this.ctx.planeY);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit);
  }

  private pointerNearBall(clientX: number, clientY: number): boolean {
    const hit = this.intersectLane(clientX, clientY);
    if (!hit) return this.pointerNearVisibleBall(clientX, clientY);
    const ball = this.ctx.getBallWorld();
    const dx = hit.x - ball.x;
    const dz = hit.z - ball.z;
    const tapSlack = 2.2;
    if (dx * dx + dz * dz <= (this.ctx.ballRadius * tapSlack) ** 2) {
      return true;
    }
    return this.pointerNearVisibleBall(clientX, clientY);
  }

  private pointerNearVisibleBall(clientX: number, clientY: number): boolean {
    const b = this.ctx.getGameplayScreenBounds();
    const ball = this.ctx.getBallWorld();
    this.ballCenterWorld.set(ball.x, ball.y + this.ctx.ballRadius, ball.z);
    this.projectedCenter.copy(this.ballCenterWorld).project(this.ctx.camera);
    if (this.projectedCenter.z < -1 || this.projectedCenter.z > 1) {
      return false;
    }

    this.cameraRightWorld.setFromMatrixColumn(this.ctx.camera.matrixWorld, 0);
    this.ballEdgeWorld
      .copy(this.ballCenterWorld)
      .addScaledVector(this.cameraRightWorld, this.ctx.ballRadius);
    this.projectedEdge.copy(this.ballEdgeWorld).project(this.ctx.camera);

    const centerX = b.left + ((this.projectedCenter.x + 1) * b.width) / 2;
    const centerY = b.top + ((1 - this.projectedCenter.y) * b.height) / 2;
    const edgeX = b.left + ((this.projectedEdge.x + 1) * b.width) / 2;
    const edgeY = b.top + ((1 - this.projectedEdge.y) * b.height) / 2;
    const radiusPx = Math.hypot(edgeX - centerX, edgeY - centerY);
    const tapRadiusPx = Math.max(28, radiusPx * 2.6);
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    return dx * dx + dy * dy <= tapRadiusPx * tapRadiusPx;
  }

  private updatePull(clientX: number, clientY: number): void {
    const hit = this.intersectLane(clientX, clientY);
    const ball = this.ctx.getBallWorld();
    if (!hit) {
      this.pull.set(0, 0, 0);
      return;
    }
    this.pull.set(hit.x - ball.x, 0, hit.z - ball.z);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!this.ctx.canBeginShot()) return;
    if (!this.ctx.isInteractionEnabled?.()) return;
    if (!this.pointerNearBall(e.clientX, e.clientY)) return;

    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.updatePull(e.clientX, e.clientY);
    this.ctx.onAimBegin?.();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.updatePull(e.clientX, e.clientY);
    const len = Math.hypot(this.pull.x, this.pull.z);
    if (len > this.ctx.maxDragWorld) {
      const s = this.ctx.maxDragWorld / len;
      this.pull.x *= s;
      this.pull.z *= s;
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* released elsewhere */
    }

    this.updatePull(e.clientX, e.clientY);
    let len = Math.hypot(this.pull.x, this.pull.z);
    if (len > this.ctx.maxDragWorld) {
      const s = this.ctx.maxDragWorld / len;
      this.pull.x *= s;
      this.pull.z *= s;
      len = this.ctx.maxDragWorld;
    }

    if (len < this.ctx.minDragWorld) {
      this.ctx.onDragCancel();
      return;
    }

    const capped = Math.min(len, this.ctx.maxDragWorld);
    const shotDir = { x: -this.pull.x / len, y: -this.pull.z / len };
    const powerNorm =
      this.ctx.powerFullDragWorld ?? this.ctx.maxDragWorld;
    const power01 = Math.min(1, capped / powerNorm);

    const ball = this.ctx.getBallWorld();
    this.ctx.onShot({
      directionXZ: shotDir,
      power01,
      startWorld: { x: ball.x, y: ball.y, z: ball.z },
      source: "pointer",
    });
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    this.ctx.onDragCancel();
  };
}
