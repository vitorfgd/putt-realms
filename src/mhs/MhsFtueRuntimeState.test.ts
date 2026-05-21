import { describe, expect, it } from "vitest";
import {
  FTUE_INTRO_SCRIPT,
  SessionFtueRuntimeState,
  YIP_MUSHROOM_TIP,
} from "../../../putt_realms/scripts/puttrealms/progression/FtueRuntimeState";

describe("MHS FTUE runtime state", () => {
  it("walks the original Yip intro script and completes once", () => {
    const ftue = new SessionFtueRuntimeState();

    expect(ftue.isIntroComplete()).toBe(false);
    expect(ftue.startIntro()).toMatchObject({
      speaker: "Yip",
      stepIndex: 0,
      stepCount: FTUE_INTRO_SCRIPT.length,
      title: FTUE_INTRO_SCRIPT[0].title,
    });

    for (let i = 1; i < FTUE_INTRO_SCRIPT.length; i++) {
      expect(ftue.advanceIntro()).toBe("advanced");
      expect(ftue.currentIntroDialogue()).toMatchObject({
        stepIndex: i,
        title: FTUE_INTRO_SCRIPT[i].title,
      });
    }

    expect(ftue.advanceIntro()).toBe("completed");
    expect(ftue.isIntroComplete()).toBe(true);
    expect(ftue.currentIntroDialogue()).toBeNull();
    expect(ftue.startIntro()).toBeNull();
  });

  it("can hydrate the intro as already complete from persistence", () => {
    const ftue = new SessionFtueRuntimeState();

    expect(ftue.startIntro()).not.toBeNull();
    ftue.setIntroComplete(true);

    expect(ftue.isIntroComplete()).toBe(true);
    expect(ftue.isIntroActive()).toBe(false);
    expect(ftue.currentIntroDialogue()).toBeNull();
    expect(ftue.startIntro()).toBeNull();
  });

  it("returns mushroom reminder tiers only on the 1st, 3rd, and 6th hits", () => {
    const ftue = new SessionFtueRuntimeState();

    expect(YIP_MUSHROOM_TIP).toBe("Careful of the mushrooms - they'll bounce you!");
    expect([
      ftue.recordMushroomBumperHit(),
      ftue.recordMushroomBumperHit(),
      ftue.recordMushroomBumperHit(),
      ftue.recordMushroomBumperHit(),
      ftue.recordMushroomBumperHit(),
      ftue.recordMushroomBumperHit(),
      ftue.recordMushroomBumperHit(),
    ]).toEqual([1, null, 3, null, null, 6, null]);
  });
});
