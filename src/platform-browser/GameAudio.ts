import { RunPhase } from "../core/RunStateMachine";
import { publicUrl } from "../core/publicPath";
import type { AudioService, StorageService } from "../platform/PlatformServices";
import { browserStorage } from "./BrowserStorageService";

const PATH = {
  hit: publicUrl("assets/audio/hit.ogg"),
  ball: publicUrl("assets/audio/ball_interaction.ogg"),
  bell: publicUrl("assets/audio/bell.wav"),
  hole: publicUrl("assets/audio/hole.ogg"),
  holeInOne: publicUrl("assets/audio/hole_in_one.ogg"),
  levelClear: publicUrl("assets/audio/level_clear.ogg"),
  outOfBounds: publicUrl("assets/audio/out_of_bounds.ogg"),
  portalUse: publicUrl("assets/audio/portal_use.ogg"),
  bg1: publicUrl("assets/audio/bg_1.ogg"),
  bg2: publicUrl("assets/audio/bg_2.ogg"),
  bg3: publicUrl("assets/audio/bg_3.ogg"),
} as const;

/** Level BGM order: was bg2/bg3 alternating; `bg_1` is the third track per round. */
const GAMEPLAY_BGM = [PATH.bg2, PATH.bg3, PATH.bg1] as const;
const LS_AUDIO = "pmg_audio_settings_v1";

export interface AudioSettings {
  musicMuted: boolean;
  sfxMuted: boolean;
  musicVolume: number;
  sfxVolume: number;
}

type AudioCueName =
  | "hit"
  | "rail"
  | "hazard"
  | "oob"
  | "hole"
  | "holeInOne"
  | "levelClear"
  | "portalUse"
  | "coin"
  | "ui"
  | "reward"
  | "skip"
  | "level";

/**
 * Browser HTMLAudio — paths are under Vite `public/` (e.g. `public/assets/audio/…`).
 */
export class GameAudio implements AudioService {
  private unlocked = false;
  private gameplay: HTMLAudioElement | null = null;
  private gameplayKey: string | null = null;
  private ambient: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private lastBumpMs = 0;
  private settings: AudioSettings = {
    musicMuted: false,
    sfxMuted: false,
    musicVolume: 0.36,
    sfxVolume: 1,
  };

  constructor(private readonly storage: StorageService = browserStorage) {
    this.loadSettings();
  }

  /** Call after a user gesture so `play()` is not rejected (autoplay policy). */
  tryUnlock(): void {
    this.unlocked = true;
    this.ensureAudioContext()?.resume().catch(() => {});
  }

  playHit(): void {
    this.playNamed("hit");
  }

  /** Hole-in / cup success */
  playBell(): void {
    this.playNamed("hole");
  }

  /** Rails, bounds, hazards — throttled to avoid machine-gun on multi-contact frames */
  playBallBump(): void {
    if (!this.unlocked) return;
    const t = performance.now();
    if (t - this.lastBumpMs < 85) return;
    this.lastBumpMs = t;
    this.playNamed("rail");
  }

  playNamed(name: AudioCueName): void {
    if (!this.unlocked || this.settings.sfxMuted) return;
    if (name === "hit") {
      if (!this.playSyntheticPutt()) {
        void this.playOneShot(PATH.hit, 0.26 * this.settings.sfxVolume, 0.92);
      }
      return;
    }
    if (name === "rail") {
      if (!this.playSyntheticRail()) {
        void this.playOneShot(PATH.ball, 0.22 * this.settings.sfxVolume, 0.82);
      }
      return;
    }
    const cfg: Record<AudioCueName, { src: string; volume: number; rate: number }> = {
      hit: { src: PATH.hit, volume: 0.34, rate: 0.92 },
      rail: { src: PATH.ball, volume: 0.28, rate: 0.86 },
      hazard: { src: PATH.ball, volume: 0.9, rate: 0.82 },
      oob: { src: PATH.outOfBounds, volume: 0.78, rate: 1 },
      hole: { src: PATH.hole, volume: 0.88, rate: 1 },
      holeInOne: { src: PATH.holeInOne, volume: 0.86, rate: 1 },
      levelClear: { src: PATH.levelClear, volume: 0.82, rate: 1 },
      portalUse: { src: PATH.portalUse, volume: 0.72, rate: 1 },
      coin: { src: PATH.bell, volume: 0.46, rate: 1.38 },
      ui: { src: PATH.ball, volume: 0.34, rate: 1.72 },
      reward: { src: PATH.bell, volume: 0.84, rate: 1.18 },
      skip: { src: PATH.ball, volume: 0.58, rate: 0.72 },
      level: { src: PATH.bell, volume: 0.52, rate: 0.92 },
    };
    const pick = cfg[name];
    void this.playOneShot(pick.src, pick.volume * this.settings.sfxVolume, pick.rate);
  }

  playSfx(id: string): void {
    if (isAudioCueName(id)) this.playNamed(id);
  }

  setMusicMuted(muted: boolean): void {
    this.setSettings({ musicMuted: muted });
  }

  setSfxMuted(muted: boolean): void {
    this.setSettings({ sfxMuted: muted });
  }

  setSettings(next: Partial<AudioSettings>): void {
    this.settings = {
      ...this.settings,
      ...next,
      musicVolume: Math.max(0, Math.min(1, next.musicVolume ?? this.settings.musicVolume)),
      sfxVolume: Math.max(0, Math.min(1, next.sfxVolume ?? this.settings.sfxVolume)),
    };
    if (this.gameplay) {
      this.gameplay.volume = this.settings.musicMuted ? 0 : this.settings.musicVolume;
    }
    if (this.ambient) {
      this.ambient.volume = this.settings.musicMuted ? 0 : this.settings.musicVolume * 0.22;
    }
    this.saveSettings();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /**
   * Switches the looping gameplay BGM to the track for `levelIndex` (bg_2 / bg_3 / bg_1 cycle).
   * Call when the player advances to the next level (e.g. summary “Next level”) so the song
   * changes immediately, not when preview / first shot gameplay resumes.
   */
  switchGameplayBgmToLevel(levelIndex: number): void {
    if (!this.unlocked) return;
    this.ensureGameplayLoop(levelIndex);
  }

  /**
   * BGM: keeps the current gameplay loop running and adjusts ducking by phase.
   * Track selection for a new level is driven by {@link switchGameplayBgmToLevel} on advance;
   * entering {@link RunPhase.AwaitingShot} after that re-applies the same track (no-op if unchanged).
   * Preview / transitions / hole-out do not stop the loop — same track keeps playing until advance.
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
      this.ensureAmbientLoop();
      this.setMusicIntensity(phase === RunPhase.BallInFlight ? 1 : 0.45);
    }
  }

  /**
   * After {@link tryUnlock}, start level BGM before gameplay phases (e.g. title / tap-to-play).
   */
  startEarlyLevelBgm(levelIndex: number): void {
    if (!this.unlocked) return;
    this.ensureGameplayLoop(levelIndex);
    this.ensureAmbientLoop();
  }

  dispose(): void {
    this.stopGameplayLoop();
    this.stopAmbientLoop();
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    const Ctor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    this.audioCtx = new Ctor();
    return this.audioCtx;
  }

  private playSyntheticPutt(): boolean {
    const ctx = this.ensureAudioContext();
    if (!ctx) return false;
    void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16 * this.settings.sfxVolume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(82, t + 0.13);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, t);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.17);
    return true;
  }

  private playSyntheticRail(): boolean {
    const ctx = this.ensureAudioContext();
    if (!ctx) return false;
    void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11 * this.settings.sfxVolume, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(380, t);
    filter.Q.setValueAtTime(0.9, t);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
    return true;
  }

  private playOneShot(src: string, volume: number, playbackRate = 1): Promise<void> {
    const a = new Audio(src);
    a.volume = this.settings.sfxMuted ? 0 : volume;
    a.playbackRate = playbackRate;
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
    a.volume = this.settings.musicMuted ? 0 : this.settings.musicVolume;
    this.gameplay = a;
    void a.play().catch(() => {});
  }

  private ensureAmbientLoop(): void {
    if (this.ambient && !this.ambient.paused) return;
    const a = new Audio(PATH.bg1);
    a.loop = true;
    a.volume = this.settings.musicMuted ? 0 : this.settings.musicVolume * 0.18;
    a.playbackRate = 0.72;
    this.ambient = a;
    void a.play().catch(() => {});
  }

  private setMusicIntensity(intensity: number): void {
    if (!this.gameplay) return;
    const target = this.settings.musicMuted
      ? 0
      : this.settings.musicVolume * (0.72 + Math.max(0, Math.min(1, intensity)) * 0.28);
    this.gameplay.volume += (target - this.gameplay.volume) * 0.08;
  }

  private stopGameplayLoop(): void {
    if (!this.gameplay) return;
    this.gameplay.pause();
    this.gameplay.currentTime = 0;
    this.gameplay.src = "";
    this.gameplay = null;
    this.gameplayKey = null;
  }

  private stopAmbientLoop(): void {
    if (!this.ambient) return;
    this.ambient.pause();
    this.ambient.currentTime = 0;
    this.ambient.src = "";
    this.ambient = null;
  }

  private loadSettings(): void {
    try {
      const raw = this.storage.read(LS_AUDIO);
      if (!raw) return;
      this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch {
      /* ignore corrupt settings */
    }
  }

  private saveSettings(): void {
    try {
      this.storage.write(LS_AUDIO, JSON.stringify(this.settings));
    } catch {
      /* ignore full storage */
    }
  }
}

function isAudioCueName(value: string): value is AudioCueName {
  return (
    value === "hit" ||
    value === "rail" ||
    value === "hazard" ||
    value === "oob" ||
    value === "hole" ||
    value === "holeInOne" ||
    value === "levelClear" ||
    value === "portalUse" ||
    value === "coin" ||
    value === "ui" ||
    value === "reward" ||
    value === "skip" ||
    value === "level"
  );
}
