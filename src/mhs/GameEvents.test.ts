import { describe, expect, it } from "vitest";
import { MHS_AUDIO_EVENT_IDS, type GameEvent } from "./GameEvents";

describe("MHS game event contracts", () => {
  it("keeps audio event IDs stable for future AudioHub mapping", () => {
    expect(MHS_AUDIO_EVENT_IDS).toEqual([
      "hit",
      "rail",
      "hazard",
      "oob",
      "hole",
      "coin",
      "ui",
      "reward",
      "skip",
      "level",
      "bgm",
    ]);
  });

  it("allows plain serializable gameplay events for future adapters", () => {
    const event: GameEvent = {
      type: "coinCollected",
      collectibleId: "coin-1",
      value: 3,
      position: { x: 1, y: 2, z: 3 },
    };
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});

