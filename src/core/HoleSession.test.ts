import { describe, expect, it } from "vitest";
import { HoleSession } from "./HoleSession";
import { RunEvent, RunPhase } from "./RunStateMachine";

describe("HoleSession", () => {
  it("preserves the existing run transition contract behind a portable seam", () => {
    const session = new HoleSession();
    const phases: RunPhase[] = [];
    session.onPhaseChange((phase) => phases.push(phase));

    expect(session.getPhase()).toBe(RunPhase.Booting);
    expect(session.dispatch(RunEvent.SkipBootToLevelSpawn)).toBe(true);
    expect(session.dispatch(RunEvent.LevelSpawned)).toBe(true);
    expect(session.dispatch(RunEvent.PreviewDurationElapsed)).toBe(true);
    expect(session.dispatch(RunEvent.GameplayCameraReady)).toBe(true);

    expect(session.getPhase()).toBe(RunPhase.AwaitingShot);
    expect(session.canStartDrag()).toBe(true);
    expect(session.isShotInteractionEnabled()).toBe(true);
    expect(session.snapshot()).toEqual({
      phase: RunPhase.AwaitingShot,
      strokes: 0,
      oobCount: 0,
      collectedCoins: 0,
      skips: 0,
      rewardCoins: 0,
      completed: false,
    });
    expect(phases).toEqual([
      RunPhase.LevelSpawning,
      RunPhase.PreviewCamera,
      RunPhase.TransitioningCamera,
      RunPhase.AwaitingShot,
    ]);
    expect(session.drainCommands().some((cmd) => cmd.type === "updateHud")).toBe(true);
  });

  it("emits portable commands for session-owned counters", () => {
    const session = new HoleSession();

    session.record({ type: "stroke" });
    session.record({ type: "collectible", id: "coin-a", value: 3 });
    session.record({ type: "oob" });

    expect(session.snapshot()).toMatchObject({
      strokes: 1,
      collectedCoins: 3,
      oobCount: 1,
    });
    expect(session.drainCommands().map((cmd) => cmd.type)).toEqual([
      "setInputEnabled",
      "playSound",
      "updateHud",
      "spawnCollectible",
      "awardCurrency",
      "playSound",
      "updateHud",
      "showOverlay",
      "recoverOob",
      "recordTelemetry",
      "updateHud",
    ]);
  });

  it("owns skip eligibility and completion side-effect commands", () => {
    const session = new HoleSession();
    session.forcePhase(RunPhase.AwaitingShot);

    expect(session.canRequestSkip({ strokes: 3, par: 3 })).toBe(false);
    expect(session.canRequestSkip({ strokes: 4, par: 3 })).toBe(true);

    session.record({ type: "skip", strokes: 4, turnCount: 2 });
    session.record({
      type: "complete",
      strokes: 1,
      par: 3,
      turnCount: 2,
      rewardCoins: 25,
    });

    expect(session.snapshot()).toMatchObject({
      skips: 1,
      rewardCoins: 25,
      completed: true,
    });
    expect(session.drainCommands()).toEqual(
      expect.arrayContaining([
        { type: "recordTelemetry", result: "skipped", strokes: 4, turnCount: 2 },
        { type: "awardCurrency", amount: 25, reason: "hole-in-one" },
        { type: "playSound", sound: "reward" },
      ]),
    );
  });

  it("emits explicit command order for web and future MHS adapters", () => {
    const session = new HoleSession();

    session.record({ type: "stroke" });
    expect(session.drainCommands()).toEqual([
      { type: "setInputEnabled", enabled: false },
      { type: "playSound", sound: "hit" },
      {
        type: "updateHud",
        snapshot: {
          phase: RunPhase.Booting,
          strokes: 1,
          oobCount: 0,
          collectedCoins: 0,
          skips: 0,
          rewardCoins: 0,
          completed: false,
        },
      },
    ]);

    session.record({ type: "collectible", id: "coin-b", value: 2.8 });
    expect(session.drainCommands().map((command) => command.type)).toEqual([
      "spawnCollectible",
      "awardCurrency",
      "playSound",
      "updateHud",
    ]);

    session.record({ type: "oob", strokes: 2, turnCount: 1 });
    expect(session.drainCommands().map((command) => command.type)).toEqual([
      "showOverlay",
      "recoverOob",
      "recordTelemetry",
      "updateHud",
    ]);

    session.record({
      type: "complete",
      strokes: 1,
      par: 3,
      turnCount: 1,
      rewardCoins: 50,
    });
    expect(session.drainCommands()).toEqual(
      expect.arrayContaining([
        { type: "completeHole" },
        { type: "setInputEnabled", enabled: false },
        { type: "awardCurrency", amount: 50, reason: "hole-in-one" },
        {
          type: "showOverlay",
          overlay: "summary",
          payload: { strokes: 1, par: 3, rewardCoins: 50 },
        },
      ]),
    );
  });
});
