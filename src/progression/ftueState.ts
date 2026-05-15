/**
 * First-time Yip tutorial + mushroom encounter tooltips (localStorage).
 */

const LS_FTUE_INTRO = "pmg_ftue_yip_intro_v1";
const LS_MUSHROOM_ENC = "pmg_yip_mushroom_encounters_v1";
const LS_MUSHROOM_TIPS = "pmg_yip_mushroom_tips_shown_v1";

export function isFtueIntroComplete(): boolean {
  try {
    return localStorage.getItem(LS_FTUE_INTRO) === "1";
  } catch {
    return false;
  }
}

export function markFtueIntroComplete(): void {
  try {
    localStorage.setItem(LS_FTUE_INTRO, "1");
  } catch {
    /* ignore */
  }
}

export function getMushroomBumperEncounterCount(): number {
  try {
    const v = parseInt(localStorage.getItem(LS_MUSHROOM_ENC) ?? "0", 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

function bumpMushroomEncounterCount(): number {
  const n = getMushroomBumperEncounterCount() + 1;
  try {
    localStorage.setItem(LS_MUSHROOM_ENC, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

function mushroomTipAlreadyShown(tier: 1 | 3 | 6): boolean {
  try {
    const raw = localStorage.getItem(LS_MUSHROOM_TIPS) ?? "";
    const set = new Set(raw.split(",").filter(Boolean));
    return set.has(String(tier));
  } catch {
    return false;
  }
}

function markMushroomTipShown(tier: 1 | 3 | 6): void {
  try {
    const raw = localStorage.getItem(LS_MUSHROOM_TIPS) ?? "";
    const parts = raw.split(",").filter(Boolean);
    parts.push(String(tier));
    localStorage.setItem(LS_MUSHROOM_TIPS, [...new Set(parts)].join(","));
  } catch {
    /* ignore */
  }
}

export type MushroomTipTier = 1 | 3 | 6;

/**
 * After a bumper-mushroom impulse hit, bump global encounter count and return a tier
 * to show a Yip line for (1st, 3rd, 6th encounter), or `null` if no tip this time.
 */
export function recordMushroomBumperHit(): MushroomTipTier | null {
  const n = bumpMushroomEncounterCount();
  const tiers: MushroomTipTier[] = [1, 3, 6];
  for (const t of tiers) {
    if (n === t && !mushroomTipAlreadyShown(t)) {
      markMushroomTipShown(t);
      return t;
    }
  }
  return null;
}
