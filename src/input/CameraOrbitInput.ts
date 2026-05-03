import type { DragShotInput } from "./DragShotInput";

export interface CameraOrbitOptions {
  sensitivity: number;
  /** Limit pointer to the letterboxed gameplay rect */
  isPointerInGameplay(clientX: number, clientY: number): boolean;
  shotInput: DragShotInput;
  canOrbit(): boolean;
  addYaw(deltaRadians: number): void;
}

/**
 * Horizontal drag away from the ball orbits the follow camera around the vertical axis through the ball.
 * Does not start when the pointer is over the ball — {@link DragShotInput} owns that gesture.
 */
export class CameraOrbitInput {
  private dragging = false;
  private lastX = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: CameraOrbitOptions,
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

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!this.opts.canOrbit()) return;
    if (!this.opts.isPointerInGameplay(e.clientX, e.clientY)) return;
    if (this.opts.shotInput.isPointerNearBall(e.clientX, e.clientY)) return;

    this.dragging = true;
    this.lastX = e.clientX;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* already captured */
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    if (!this.opts.canOrbit()) {
      this.dragging = false;
      return;
    }
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.opts.addYaw(dx * this.opts.sensitivity);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* released elsewhere */
    }
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
}
