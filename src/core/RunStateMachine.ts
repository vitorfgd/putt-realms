/**
 * Central run flow. Gameplay code requests transitions via {@link RunStateMachine.dispatch};
 * only this module mutates the active phase.
 */
export enum RunPhase {
  Booting = "Booting",
  LevelSpawning = "LevelSpawning",
  PreviewCamera = "PreviewCamera",
  TransitioningCamera = "TransitioningCamera",
  AwaitingShot = "AwaitingShot",
  Aiming = "Aiming",
  BallInFlight = "BallInFlight",
  LevelComplete = "LevelComplete",
  ResolvingOOB = "ResolvingOOB",
  RunEnding = "RunEnding",
  RunSummary = "RunSummary",
}

/** Requests-only inputs to the state machine (no direct phase writes). */
export enum RunEvent {
  /** Skip splash / boot (web prototype jumps straight into a level). */
  SkipBootToLevelSpawn = "SkipBootToLevelSpawn",
  /** Level assets are parented in the scene and ready for preview. */
  LevelSpawned = "LevelSpawned",
  PreviewDurationElapsed = "PreviewDurationElapsed",
  GameplayCameraReady = "GameplayCameraReady",
  AimStarted = "AimStarted",
  ShotReleased = "ShotReleased",
  AimCancelled = "AimCancelled",
  BallSettled = "BallSettled",
  HoleScored = "HoleScored",
  OutOfBounds = "OutOfBounds",
  /** Sink tween + celebration + post-hole delay finished → spawn next */
  LevelFinishSequenceComplete = "LevelFinishSequenceComplete",
  OobMessageComplete = "OobMessageComplete",
  /** Paid/free skip — abort hole and load next level */
  LevelSkipped = "LevelSkipped",
}

export type PhaseListener = (phase: RunPhase) => void;

function transitionTable(
  phase: RunPhase,
  event: RunEvent,
): RunPhase | null {
  switch (phase) {
    case RunPhase.Booting:
      if (event === RunEvent.SkipBootToLevelSpawn) return RunPhase.LevelSpawning;
      break;
    case RunPhase.LevelSpawning:
      if (event === RunEvent.LevelSpawned) return RunPhase.PreviewCamera;
      break;
    case RunPhase.PreviewCamera:
      if (event === RunEvent.PreviewDurationElapsed)
        return RunPhase.TransitioningCamera;
      break;
    case RunPhase.TransitioningCamera:
      if (event === RunEvent.GameplayCameraReady) return RunPhase.AwaitingShot;
      break;
    case RunPhase.AwaitingShot:
      if (event === RunEvent.AimStarted) return RunPhase.Aiming;
      if (event === RunEvent.LevelSkipped) return RunPhase.LevelSpawning;
      break;
    case RunPhase.Aiming:
      if (event === RunEvent.ShotReleased) return RunPhase.BallInFlight;
      if (event === RunEvent.AimCancelled) return RunPhase.AwaitingShot;
      break;
    case RunPhase.BallInFlight:
      if (event === RunEvent.HoleScored) return RunPhase.LevelComplete;
      if (event === RunEvent.OutOfBounds) return RunPhase.ResolvingOOB;
      if (event === RunEvent.BallSettled) return RunPhase.AwaitingShot;
      if (event === RunEvent.LevelSkipped) return RunPhase.LevelSpawning;
      break;
    case RunPhase.LevelComplete:
      if (event === RunEvent.LevelFinishSequenceComplete)
        return RunPhase.LevelSpawning;
      break;
    case RunPhase.ResolvingOOB:
      if (event === RunEvent.OobMessageComplete) return RunPhase.AwaitingShot;
      break;
    default:
      break;
  }
  return null;
}

export class RunStateMachine {
  private phase: RunPhase = RunPhase.Booting;
  private listener: PhaseListener | null = null;

  getPhase(): RunPhase {
    return this.phase;
  }

  /** Used only for web prototype init when skipping Booting. */
  forcePhase(next: RunPhase): void {
    this.phase = next;
    this.listener?.(this.phase);
  }

  onPhaseChange(cb: PhaseListener | null): void {
    this.listener = cb;
  }

  /**
   * @returns true if the transition was applied
   */
  dispatch(event: RunEvent): boolean {
    const next = transitionTable(this.phase, event);
    if (next === null) return false;
    this.phase = next;
    this.listener?.(this.phase);
    return true;
  }

  /** Whether input should drive aiming / shot */
  isShotInteractionEnabled(): boolean {
    switch (this.phase) {
      case RunPhase.AwaitingShot:
      case RunPhase.Aiming:
        return true;
      default:
        return false;
    }
  }

  /** Drag allowed only in AwaitingShot (start drag there → Aiming). */
  canStartDrag(): boolean {
    return this.phase === RunPhase.AwaitingShot;
  }
}
