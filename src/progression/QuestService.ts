import type { StorageService } from "../platform/PlatformServices";
import { browserStorage } from "../platform-browser/BrowserStorageService";

export interface QuestProgress {
  underParCompletions: number;
  collectedCoins: number;
  hazardlessCompletions: number;
  dailyChallengeCompletions: number;
}

const LS_QUESTS = "pmg_quest_progress_v1";

function emptyProgress(): QuestProgress {
  return {
    underParCompletions: 0,
    collectedCoins: 0,
    hazardlessCompletions: 0,
    dailyChallengeCompletions: 0,
  };
}

export class QuestService {
  private progress: QuestProgress = emptyProgress();

  constructor(private readonly storage: StorageService = browserStorage) {
    this.load();
  }

  recordHole(opts: {
    underPar: boolean;
    coinsCollected: number;
    hazardless: boolean;
    dailyChallenge: boolean;
  }): void {
    if (opts.underPar) this.progress.underParCompletions++;
    this.progress.collectedCoins += Math.max(0, opts.coinsCollected);
    if (opts.hazardless) this.progress.hazardlessCompletions++;
    if (opts.dailyChallenge) this.progress.dailyChallengeCompletions++;
    this.save();
  }

  getProgress(): QuestProgress {
    return { ...this.progress };
  }

  private load(): void {
    try {
      const raw = this.storage.read(LS_QUESTS);
      if (!raw) return;
      this.progress = { ...emptyProgress(), ...JSON.parse(raw) };
    } catch {
      this.progress = emptyProgress();
    }
  }

  private save(): void {
    try {
      this.storage.write(LS_QUESTS, JSON.stringify(this.progress));
    } catch {
      /* ignore full storage */
    }
  }
}
