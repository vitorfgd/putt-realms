import { BALL_COSMETICS } from "./cosmeticCatalog";
import type { BallCosmeticId } from "./cosmeticTypes";

const LS_EQUIPPED = "pmg_equipped_ball_cosmetic_v1";
const LS_UNLOCKED = "pmg_unlocked_ball_cosmetics_v1";

function defaultUnlockedIds(): Set<BallCosmeticId> {
  const s = new Set<BallCosmeticId>();
  for (const c of BALL_COSMETICS) {
    if (c.defaultUnlocked) s.add(c.id);
  }
  return s;
}

/**
 * Persistence stub for equipped ball look — unlock rules / shop later.
 */
export class CosmeticService {
  private equipped: BallCosmeticId = "classic_ivory";
  private unlocked: Set<BallCosmeticId> = defaultUnlockedIds();

  constructor() {
    this.load();
  }

  getEquippedBallCosmetic(): BallCosmeticId {
    return this.equipped;
  }

  isUnlocked(id: BallCosmeticId): boolean {
    return this.unlocked.has(id);
  }

  /** No-op if locked — caller should check {@link isUnlocked} */
  setEquippedBallCosmetic(id: BallCosmeticId): void {
    if (!this.unlocked.has(id)) return;
    this.equipped = id;
    this.saveEquipped();
  }

  /** Future: grant from shop / achievements */
  unlock(id: BallCosmeticId): void {
    this.unlocked.add(id);
    this.saveUnlocked();
  }

  private load(): void {
    this.unlocked = this.loadUnlockedSet();
    for (const id of defaultUnlockedIds()) {
      this.unlocked.add(id);
    }
    try {
      const raw = localStorage.getItem(LS_EQUIPPED);
      if (
        raw &&
        BALL_COSMETICS.some((c) => c.id === raw) &&
        this.unlocked.has(raw as BallCosmeticId)
      ) {
        this.equipped = raw as BallCosmeticId;
      }
    } catch {
      /* ignore */
    }
  }

  private loadUnlockedSet(): Set<BallCosmeticId> {
    const raw = localStorage.getItem(LS_UNLOCKED);
    if (!raw) return new Set();
    try {
      const arr = JSON.parse(raw) as unknown;
      const out = new Set<BallCosmeticId>();
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (
            typeof x === "string" &&
            BALL_COSMETICS.some((c) => c.id === x)
          ) {
            out.add(x as BallCosmeticId);
          }
        }
      }
      return out;
    } catch {
      return new Set();
    }
  }

  private saveEquipped(): void {
    try {
      localStorage.setItem(LS_EQUIPPED, this.equipped);
    } catch {
      /* ignore */
    }
  }

  private saveUnlocked(): void {
    try {
      localStorage.setItem(
        LS_UNLOCKED,
        JSON.stringify([...this.unlocked]),
      );
    } catch {
      /* ignore */
    }
  }
}
