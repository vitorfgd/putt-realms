import {
  computeHoleInOnePayout,
  skipCostCoins,
} from "./economyFormulas";

const LS_COINS = "pmg_coins_v1";
const LS_STREAK = "pmg_hio_streak_v1";

/**
 * Coins + hole-in-one streak persistence (localStorage).
 */
export class EconomyService {
  private coins = 0;
  /** Consecutive levels completed with a hole-in-one */
  private holeInOneStreak = 0;

  constructor() {
    this.load();
  }

  getCoins(): number {
    return this.coins;
  }

  getHoleInOneStreak(): number {
    return this.holeInOneStreak;
  }

  /**
   * Award for sinking this hole in one stroke. Updates streak (+1) and balance.
   * @returns coins granted this event
   */
  awardHoleInOne(difficultyScore: number): number {
    const nextStreak = this.holeInOneStreak + 1;
    const payout = computeHoleInOnePayout(difficultyScore, nextStreak);
    this.holeInOneStreak = nextStreak;
    this.coins += payout;
    this.save();
    return payout;
  }

  /** Any completed hole that is not a hole-in-one resets the streak */
  recordNonHoleInOneCompletion(): void {
    if (this.holeInOneStreak === 0) return;
    this.holeInOneStreak = 0;
    this.save();
  }

  /**
   * Skip level: always clears streak; charges coins unless free path applies.
   * @returns false only when a paid skip was unaffordable (streak unchanged)
   */
  attemptSkip(
    difficultyScore: number,
    freeForImperfect: boolean,
    freeForStuck: boolean,
  ): boolean {
    const free = freeForImperfect || freeForStuck;
    if (!free) {
      const cost = skipCostCoins(difficultyScore);
      if (this.coins < cost) return false;
      this.coins -= cost;
    }
    this.holeInOneStreak = 0;
    this.save();
    return true;
  }

  skipPrice(difficultyScore: number): number {
    return skipCostCoins(difficultyScore);
  }

  private load(): void {
    try {
      const c = localStorage.getItem(LS_COINS);
      if (c !== null) {
        const n = Number.parseInt(c, 10);
        if (!Number.isNaN(n) && n >= 0) this.coins = n;
      }
      const s = localStorage.getItem(LS_STREAK);
      if (s !== null) {
        const n = Number.parseInt(s, 10);
        if (!Number.isNaN(n) && n >= 0) this.holeInOneStreak = n;
      }
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(LS_COINS, String(this.coins));
      localStorage.setItem(LS_STREAK, String(this.holeInOneStreak));
    } catch {
      /* ignore */
    }
  }
}
