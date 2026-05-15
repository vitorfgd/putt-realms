import type { GeneratedLevel, HoleTelemetry } from "../level/LevelTypes";
import type { StorageService } from "../platform/PlatformServices";
import { browserStorage } from "../platform-browser/BrowserStorageService";

const LS_TELEMETRY = "pmg_hole_telemetry_v1";

export interface HoleStatsDraft {
  oobCount: number;
  restarts: number;
  skips: number;
  hazardHits: number;
  coinPickups: number;
}

export class TelemetryService {
  private readonly entries: HoleTelemetry[] = [];

  constructor(private readonly storage: StorageService = browserStorage) {
    this.load();
  }

  record(
    level: GeneratedLevel,
    stats: HoleStatsDraft,
    opts: {
      strokes: number;
      turnCount: number;
      result: HoleTelemetry["result"];
    },
  ): void {
    const entry: HoleTelemetry = {
      id: `${Date.now()}-${level.id}-${opts.result}`,
      levelIndex: level.levelIndex,
      seed: level.procgenSeed,
      progressionLevel: level.progressionLevel,
      difficultyScore: level.difficultyScore,
      tileCount: level.tiles.length,
      rampCount: level.tiles.filter((tile) => tile.isRamp).length,
      turnCount: opts.turnCount,
      strokes: opts.strokes,
      par: level.par,
      oobCount: stats.oobCount,
      restarts: stats.restarts,
      skips: stats.skips,
      hazardHits: stats.hazardHits,
      coinPickups: stats.coinPickups,
      result: opts.result,
      createdAt: Date.now(),
    };
    this.entries.push(entry);
    while (this.entries.length > 160) this.entries.shift();
    this.save();
  }

  summary(): {
    completed: number;
    averageStrokes: number;
    oobCount: number;
    skips: number;
    restarts: number;
    hazardHits: number;
    coinPickups: number;
  } {
    const completed = this.entries.filter((e) => e.result === "completed");
    const strokes = completed.reduce((sum, e) => sum + e.strokes, 0);
    return {
      completed: completed.length,
      averageStrokes: completed.length > 0 ? strokes / completed.length : 0,
      oobCount: this.entries.reduce((sum, e) => sum + e.oobCount, 0),
      skips: this.entries.reduce((sum, e) => sum + e.skips, 0),
      restarts: this.entries.reduce((sum, e) => sum + e.restarts, 0),
      hazardHits: this.entries.reduce((sum, e) => sum + e.hazardHits, 0),
      coinPickups: this.entries.reduce((sum, e) => sum + e.coinPickups, 0),
    };
  }

  private load(): void {
    try {
      const raw = this.storage.read(LS_TELEMETRY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries.push(...parsed.filter((x) => x && typeof x === "object"));
      }
    } catch {
      /* ignore corrupt local telemetry */
    }
  }

  private save(): void {
    try {
      this.storage.write(LS_TELEMETRY, JSON.stringify(this.entries));
    } catch {
      /* ignore full storage */
    }
  }
}
