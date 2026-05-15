import {
  RunEvent,
  RunPhase,
  RunStateMachine,
  type PhaseListener,
} from "./RunStateMachine";

export interface HoleSessionSnapshot {
  phase: RunPhase;
  strokes: number;
  oobCount: number;
  collectedCoins: number;
  skips: number;
  rewardCoins: number;
  completed: boolean;
}

export type HoleSessionTelemetryResult =
  | "completed"
  | "skipped"
  | "restarted"
  | "oob";

export interface HoleSummaryPayload {
  strokes: number;
  par: number;
  rewardCoins: number;
}

export type HoleSessionCommand =
  | { type: "phaseChanged"; phase: RunPhase }
  | { type: "updateHud"; snapshot: HoleSessionSnapshot }
  | { type: "playSound"; sound: "hit" | "hole" | "oob" | "coin" | "skip" | "ui" | "reward" }
  | { type: "showOverlay"; overlay: "summary"; payload: HoleSummaryPayload }
  | { type: "showOverlay"; overlay: "oob" | "skip" }
  | { type: "spawnCollectible"; id: string }
  | { type: "completeHole" }
  | { type: "recoverOob" }
  | { type: "recordTelemetry"; result: HoleSessionTelemetryResult; strokes: number; turnCount: number }
  | { type: "awardCurrency"; amount: number; reason: "collectible" | "hole-in-one" | "clean-shot" }
  | { type: "setInputEnabled"; enabled: boolean };

export type HoleSessionEvent =
  | { type: "stroke" }
  | { type: "oob"; strokes?: number; turnCount?: number }
  | { type: "collectible"; id: string; value: number }
  | { type: "skip"; strokes?: number; turnCount?: number }
  | { type: "complete"; strokes?: number; par?: number; turnCount?: number; rewardCoins?: number };

export interface HoleSkipRequest {
  strokes: number;
  par: number;
  phase?: RunPhase;
}

/**
 * Portable hole/session controller seam.
 *
 * For now this wraps the existing state machine without changing behavior. Future MHS work can move
 * scoring, rewards, UI commands, and hazard events here while Three.js stays in the web adapter.
 */
export class HoleSession {
  private readonly run = new RunStateMachine();
  private readonly commands: HoleSessionCommand[] = [];
  private listener: PhaseListener | null = null;
  private strokes = 0;
  private oobCount = 0;
  private collectedCoins = 0;
  private skips = 0;
  private rewardCoins = 0;
  private completed = false;

  constructor() {
    this.run.onPhaseChange((phase) => this.onPhaseChanged(phase));
  }

  getPhase(): RunPhase {
    return this.run.getPhase();
  }

  snapshot(): HoleSessionSnapshot {
    return {
      phase: this.getPhase(),
      strokes: this.strokes,
      oobCount: this.oobCount,
      collectedCoins: this.collectedCoins,
      skips: this.skips,
      rewardCoins: this.rewardCoins,
      completed: this.completed,
    };
  }

  forcePhase(next: RunPhase): void {
    this.run.forcePhase(next);
  }

  onPhaseChange(cb: PhaseListener | null): void {
    this.listener = cb;
  }

  dispatch(event: RunEvent): boolean {
    const applied = this.run.dispatch(event);
    if (applied && event === RunEvent.HoleScored) {
      this.completed = true;
      this.commands.push(
        { type: "completeHole" },
        { type: "setInputEnabled", enabled: false },
        { type: "playSound", sound: "hole" },
      );
    }
    if (applied && event === RunEvent.OutOfBounds) {
      this.record({ type: "oob" });
    }
    return applied;
  }

  isShotInteractionEnabled(): boolean {
    return this.run.isShotInteractionEnabled();
  }

  canStartDrag(): boolean {
    return this.run.canStartDrag();
  }

  record(event: HoleSessionEvent): void {
    switch (event.type) {
      case "stroke":
        this.strokes++;
        this.commands.push(
          { type: "setInputEnabled", enabled: false },
          { type: "playSound", sound: "hit" },
        );
        break;
      case "oob":
        this.oobCount++;
        this.commands.push(
          { type: "showOverlay", overlay: "oob" },
          { type: "recoverOob" },
          { type: "playSound", sound: "oob" },
          {
            type: "recordTelemetry",
            result: "oob",
            strokes: event.strokes ?? this.strokes,
            turnCount: event.turnCount ?? 0,
          },
        );
        break;
      case "collectible":
        this.collectedCoins += Math.max(0, Math.floor(event.value));
        this.commands.push(
          { type: "spawnCollectible", id: event.id },
          { type: "awardCurrency", amount: Math.max(0, Math.floor(event.value)), reason: "collectible" },
          { type: "playSound", sound: "coin" },
        );
        break;
      case "skip":
        this.skips++;
        this.commands.push(
          { type: "setInputEnabled", enabled: false },
          { type: "showOverlay", overlay: "skip" },
          { type: "playSound", sound: "skip" },
          {
            type: "recordTelemetry",
            result: "skipped",
            strokes: event.strokes ?? this.strokes,
            turnCount: event.turnCount ?? 0,
          },
        );
        break;
      case "complete": {
        this.completed = true;
        const rewardCoins = Math.max(0, Math.floor(event.rewardCoins ?? 0));
        this.rewardCoins += rewardCoins;
        this.commands.push(
          { type: "completeHole" },
          { type: "setInputEnabled", enabled: false },
          {
            type: "recordTelemetry",
            result: "completed",
            strokes: event.strokes ?? this.strokes,
            turnCount: event.turnCount ?? 0,
          },
          ...(rewardCoins > 0
            ? [
                {
                  type: "awardCurrency" as const,
                  amount: rewardCoins,
                  reason: "hole-in-one" as const,
                },
                { type: "playSound" as const, sound: "reward" as const },
              ]
            : []),
          {
            type: "showOverlay",
            overlay: "summary",
            payload: {
              strokes: event.strokes ?? this.strokes,
              par: event.par ?? 0,
              rewardCoins: event.rewardCoins ?? 0,
            },
          },
        );
        break;
      }
    }
    this.commands.push({ type: "updateHud", snapshot: this.snapshot() });
  }

  canRequestSkip(request: HoleSkipRequest): boolean {
    const phase = request.phase ?? this.getPhase();
    return (
      request.strokes > request.par &&
      (phase === RunPhase.AwaitingShot || phase === RunPhase.BallInFlight)
    );
  }

  drainCommands(): HoleSessionCommand[] {
    return this.commands.splice(0);
  }

  resetCounters(): void {
    this.strokes = 0;
    this.oobCount = 0;
    this.collectedCoins = 0;
    this.skips = 0;
    this.rewardCoins = 0;
    this.completed = false;
    this.commands.push(
      { type: "setInputEnabled", enabled: true },
      { type: "updateHud", snapshot: this.snapshot() },
    );
  }

  private onPhaseChanged(phase: RunPhase): void {
    this.commands.push(
      { type: "phaseChanged", phase },
      { type: "updateHud", snapshot: this.snapshot() },
    );
    this.listener?.(phase);
  }
}
