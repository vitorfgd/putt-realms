/** Tracks strokes for the current hole / level (HUD-facing). */
export class StrokeController {
  private strokes = 0;

  getStrokes(): number {
    return this.strokes;
  }

  /** Called once per valid shot release */
  recordStroke(): void {
    this.strokes += 1;
  }

  resetHole(): void {
    this.strokes = 0;
  }

  resetLevel(): void {
    this.strokes = 0;
  }
}
