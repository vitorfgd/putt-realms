import { RunPhase } from "../core/RunStateMachine";
import { publicUrl } from "../core/publicPath";

const PATH = {
  hit: publicUrl("assets/audio/hit.ogg"),
  ball: publicUrl("assets/audio/ball_interaction.ogg"),
  bell: publicUrl("assets/audio/bell.wav"),
  bg1: publicUrl("assets/audio/bg_1.ogg"),
  bg2: publicUrl("assets/audio/bg_2.ogg"),
  bg3: publicUrl("assets/audio/bg_3.ogg"),
} as const;

/** Level BGM order: was bg2/bg3 alternating; `bg_1` is the third track per round. */
const GAMEPLAY_BGM = [PATH.bg2, PATH.bg3, PATH.bg1] as const;

/**
 * Browser HTMLAudio — paths are under Vite `public/` (e.g. `public/assets/audio/…`).
 */
export class GameAudio {
  private unlocked = false;
  private gameplay: HTMLAudioElement | null = null;
  private gameplayKey: string | null = null;
  private lastBumpMs = 0;

  /** Call after a user gesture so `play()` is not rejected (autoplay policy). */
  tryUnlock(): void {
    this.unlocked = true;
  }

  playHit(): void {
    if (!this.unlocked) return;
    void this.playOneShot(PATH.hit, 0.88);
  }

  /** Hole-in / cup success */
  playBell(): void {
    if (!this.unlocked) return;
    void this.playOneShot(PATH.bell, 0.92);
  }

  /** Rails, bounds, hazards — throttled to avoid machine-gun on multi-contact frames */
  playBallBump(): void {
    if (!this.unlocked) return;
    const t = performance.now();
    if (t - this.lastBumpMs < 85) return;
    this.lastBumpMs = t;
    void this.playOneShot(PATH.ball, 0.78);
  }

  /**
   * BGM: `bg_2` / `bg_3` / `bg_1` cycle by level index during play only.
   * Preview / transitions / hole-out do not stop or switch tracks — same loop keeps playing.
   */
  syncForPhase(phase: RunPhase, levelIndex: number): void {
    if (!this.unlocked) return;

    if (phase === RunPhase.LevelComplete) {
      this.playBell();
    }

    if (
      phase === RunPhase.AwaitingShot ||
      phase === RunPhase.Aiming ||
      phase === RunPhase.BallInFlight
    ) {
      this.ensureGameplayLoop(levelIndex);
    }
  }

  /**
   * After {@link tryUnlock}, start level BGM before gameplay phases (e.g. title / tap-to-play).
   */
  startEarlyLevelBgm(levelIndex: number): void {
    if (!this.unlocked) return;
    this.ensureGameplayLoop(levelIndex);
  }

  dispose(): void {
    this.stopGameplayLoop();
  }

  private playOneShot(src: string, volume: number): Promise<void> {
    const a = new Audio(src);
    a.volume = volume;
    return a.play().catch(() => {});
  }

  private ensureGameplayLoop(levelIndex: number): void {
    const key = GAMEPLAY_BGM[levelIndex % GAMEPLAY_BGM.length]!;
    if (this.gameplayKey === key && this.gameplay && !this.gameplay.paused) {
      return;
    }
    if (this.gameplay) {
      this.gameplay.pause();
      this.gameplay.src = "";
      this.gameplay = null;
    }
    this.gameplayKey = key;
    const a = new Audio(key);
    a.loop = true;
    a.volume = 0.36;
    this.gameplay = a;
    void a.play().catch(() => {});
  }

  private stopGameplayLoop(): void {
    if (!this.gameplay) return;
    this.gameplay.pause();
    this.gameplay.currentTime = 0;
    this.gameplay.src = "";
    this.gameplay = null;
    this.gameplayKey = null;
  }
}
