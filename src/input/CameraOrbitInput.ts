import type { DragShotInput } from "./DragShotInput";

export interface CameraOrbitOptions {
  sensitivity: number;
  /** Limit pointer to the letterboxed gameplay rect */
  isPointerInGameplay(clientX: number, clientY: number): boolean;
  shotInput: DragShotInput;
  canOrbit(): boolean;
  addYaw(deltaRadians: number): void;
  canNavigate?: () => boolean;
  addZoom?: (delta: number) => void;
  addPan?: (dxPixels: number, dyPixels: number) => void;
}

/**
 * Horizontal drag away from the ball orbits the follow camera around the vertical axis through the ball.
 * Does not start when the pointer is over the ball — {@link DragShotInput} owns that gesture.
 */
export class CameraOrbitInput {
  private dragging = false;
  private mode: "orbit" | "pan" = "orbit";
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: CameraOrbitOptions,
  ) {}

  attach(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    let wantsPan = e.button === 1 || e.button === 2 || e.shiftKey;
    if (e.button !== 0 && !wantsPan) return;
    const canOrbit = this.opts.canOrbit();
    const canNavigate = this.opts.canNavigate?.() !== false;
    if (!wantsPan && !canOrbit && canNavigate) wantsPan = true;
    const canUse = wantsPan ? canNavigate : canOrbit;
    if (!canUse) return;
    if (!this.opts.isPointerInGameplay(e.clientX, e.clientY)) return;
    if (this.opts.shotInput.isPointerNearBall(e.clientX, e.clientY)) return;

    this.dragging = true;
    this.mode = wantsPan ? "pan" : "orbit";
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* already captured */
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const canUse =
      this.mode === "pan"
        ? this.opts.canNavigate?.() !== false
        : this.opts.canOrbit();
    if (!canUse) {
      this.dragging = false;
      return;
    }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.mode === "pan") {
      this.opts.addPan?.(dx, dy);
    } else {
      this.opts.addYaw(dx * this.opts.sensitivity);
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.opts.addZoom) return;
    if (this.opts.canNavigate?.() === false) return;
    if (!this.opts.isPointerInGameplay(e.clientX, e.clientY)) return;
    e.preventDefault();
    this.opts.addZoom(e.deltaY);
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    if (!this.opts.isPointerInGameplay(e.clientX, e.clientY)) return;
    e.preventDefault();
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
