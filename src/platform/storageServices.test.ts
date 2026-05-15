import { describe, expect, it } from "vitest";
import { CosmeticService } from "../cosmetics/CosmeticService";
import { EconomyService } from "../economy/EconomyService";
import { QuestService } from "../progression/QuestService";
import { TelemetryService } from "../progression/TelemetryService";
import type { GeneratedLevel } from "../level/LevelTypes";
import type { StorageService } from "./PlatformServices";

class MemoryStorage implements StorageService {
  private readonly data = new Map<string, string>();

  read(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}

function minimalLevel(): GeneratedLevel {
  return {
    id: "test-level",
    levelIndex: 1,
    difficultyScore: 2,
    targetDifficulty: 2,
    hazardSpecs: [],
    tiles: [],
    startPosition: { x: 0, y: 0, z: 0 },
    holePosition: { x: 0, y: 0, z: 1 },
    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    surface: { patches: [] },
    par: 2,
    realmId: "test",
    collectibles: [],
    railColliders: [],
  };
}

describe("storage-backed services", () => {
  it("persists economy state through the storage adapter", () => {
    const storage = new MemoryStorage();
    const economy = new EconomyService(storage);

    economy.addCoins(12);
    economy.awardHoleInOne(4);

    const reloaded = new EconomyService(storage);
    expect(reloaded.getCoins()).toBe(economy.getCoins());
    expect(reloaded.getHoleInOneStreak()).toBe(1);
  });

  it("persists cosmetics through the storage adapter", () => {
    const storage = new MemoryStorage();
    const cosmetics = new CosmeticService(storage);

    cosmetics.unlock("sapphire");
    cosmetics.setEquippedBallCosmetic("sapphire");

    const reloaded = new CosmeticService(storage);
    expect(reloaded.getEquippedBallCosmetic()).toBe("sapphire");
    expect(reloaded.isUnlocked("sapphire")).toBe(true);
  });

  it("persists quest and telemetry state through the storage adapter", () => {
    const storage = new MemoryStorage();
    const quests = new QuestService(storage);
    const telemetry = new TelemetryService(storage);

    quests.recordHole({
      underPar: true,
      coinsCollected: 3,
      hazardless: true,
      dailyChallenge: false,
    });
    telemetry.record(
      minimalLevel(),
      { oobCount: 1, restarts: 0, skips: 0, hazardHits: 2, coinPickups: 3 },
      { strokes: 2, turnCount: 0, result: "completed" },
    );

    expect(new QuestService(storage).getProgress()).toMatchObject({
      underParCompletions: 1,
      collectedCoins: 3,
      hazardlessCompletions: 1,
    });
    expect(new TelemetryService(storage).summary()).toMatchObject({
      completed: 1,
      oobCount: 1,
      hazardHits: 2,
      coinPickups: 3,
    });
  });
});
