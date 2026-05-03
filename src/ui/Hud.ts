export type HudHintKind = "drag" | "release" | "rolling";

export type HudRewardToastKind =
  | "hole-in-one"
  | "clean-shot"
  | "out-of-bounds"
  | "free-skip";

/**
 * HTML overlay HUD (no Three.js text). Pointer-events disabled so input hits the canvas.
 */
export class Hud {
  private readonly elLevelValue: HTMLElement;
  private readonly elDifficulty: HTMLElement;
  private readonly elCoins: HTMLElement;
  private readonly elStrokesValue: HTMLElement;
  private readonly elHint: HTMLElement;
  private readonly elToast: HTMLElement;
  private readonly elPowerWrap: HTMLElement;
  private readonly elPowerPct: HTMLElement;
  private readonly elPowerFill: HTMLElement;
  private readonly elPowerBar: HTMLElement;
  private readonly elStatusChip: HTMLElement;
  private readonly elSkipWrap: HTMLElement;
  private readonly elSkipBtn: HTMLButtonElement;
  private readonly elSkipCost: HTMLElement;

  constructor(container: HTMLElement) {
    this.elLevelValue = requireEl(container, "hud-level-value");
    this.elDifficulty = requireEl(container, "hud-difficulty");
    this.elCoins = requireEl(container, "hud-coins");
    this.elStrokesValue = requireEl(container, "hud-strokes-value");
    this.elHint = requireEl(container, "hud-hint");
    this.elToast = requireEl(container, "hud-toast");
    this.elPowerWrap = requireEl(container, "hud-power-wrap");
    this.elPowerPct = requireEl(container, "hud-power-pct");
    this.elPowerFill = requireEl(container, "hud-power-fill");
    this.elPowerBar = requireEl(container, "hud-power-bar");
    this.elStatusChip = requireEl(container, "hud-status-chip");
    this.elSkipWrap = requireEl(container, "hud-skip-wrap");
    this.elSkipBtn = requireEl(container, "hud-skip-btn") as HTMLButtonElement;
    this.elSkipCost = requireEl(container, "hud-skip-cost");
  }

  mount(): void {
    this.setLevel(1);
    this.setDifficultyRating(0, false);
    this.setCoins(0);
    this.setStrokes(0);
    this.setHint("drag");
    this.setPowerMeter(null);
    this.setAimingChip(false);
    this.setSkipRow({ visible: false, label: "", enabled: false });
    this.hideToast();
  }

  /** Skip appears after first stroke — paid/imperfect/stuck rules handled in Game */
  bindSkip(handler: () => void): void {
    this.elSkipBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  setSkipRow(opts: {
    visible: boolean;
    label: string;
    enabled: boolean;
  }): void {
    this.elSkipWrap.classList.toggle("hud-skip-row--hidden", !opts.visible);
    if (opts.visible) {
      this.elSkipCost.textContent = opts.label;
      this.elSkipBtn.disabled = !opts.enabled;
    }
  }

  setLevel(level: number): void {
    this.elLevelValue.textContent = `${level}`;
  }

  setDifficultyRating(score: number, imperfect?: boolean): void {
    this.elDifficulty.textContent = `★ ${score}/10`;
    this.elDifficulty.classList.toggle(
      "hud-badge__meta--imperfect",
      !!imperfect,
    );
  }

  setCoins(amount: number): void {
    this.elCoins.textContent = `${amount}`;
  }

  setStrokes(n: number): void {
    this.elStrokesValue.textContent = `${n}`;
  }

  setHint(kind: HudHintKind): void {
    const text =
      kind === "drag"
        ? "Drag to aim"
        : kind === "release"
          ? "Release to hit"
          : "Rolling...";
    if (this.elHint.textContent !== text) {
      this.elHint.textContent = text;
    }
  }

  /** Shot power while aiming; `null` hides the meter. */
  setPowerMeter(power01: number | null): void {
    if (power01 === null) {
      this.elPowerWrap.classList.add("instruction-panel__power--hidden");
      this.elPowerBar.setAttribute("aria-valuenow", "0");
      return;
    }
    const p = Math.max(0, Math.min(1, power01));
    const pct = Math.round(p * 100);
    this.elPowerWrap.classList.remove("instruction-panel__power--hidden");
    this.elPowerPct.textContent = `${pct}%`;
    this.elPowerFill.style.transform = `scaleX(${p})`;
    this.elPowerBar.setAttribute("aria-valuenow", `${pct}`);
  }

  /** Small “Aiming” chip while dragging. */
  setAimingChip(visible: boolean): void {
    this.elStatusChip.classList.toggle("status-chip--hidden", !visible);
  }

  showHoleCelebration(isHoleInOne: boolean): void {
    if (isHoleInOne) {
      this.showRewardToast("hole-in-one");
    } else {
      this.showRewardToast("clean-shot");
    }
  }

  showOutOfBounds(): void {
    this.showRewardToast("out-of-bounds");
  }

  /** Temporary reward / promo line (e.g. free skip). */
  showRewardToast(kind: HudRewardToastKind): void {
    this.clearToastModifiers();
    const messages: Record<HudRewardToastKind, string> = {
      "hole-in-one": "HOLE IN ONE",
      "clean-shot": "CLEAN SHOT",
      "out-of-bounds": "OUT OF BOUNDS",
      "free-skip": "FREE SKIP AVAILABLE",
    };
    const cls: Record<HudRewardToastKind, string> = {
      "hole-in-one": "hud-toast--hole-in-one",
      "clean-shot": "hud-toast--clean-shot",
      "out-of-bounds": "hud-toast--oob",
      "free-skip": "hud-toast--free-skip",
    };
    this.elToast.textContent = messages[kind];
    this.elToast.classList.add(cls[kind]);
    this.elToast.classList.remove("hud-toast--hidden");
  }

  showCoinsEarned(amount: number): void {
    this.clearToastModifiers();
    this.elToast.textContent = `+${amount} COINS`;
    this.elToast.classList.add("hud-toast--coins");
    this.elToast.classList.remove("hud-toast--hidden");
  }

  hideToast(): void {
    this.elToast.classList.add("hud-toast--hidden");
    this.clearToastModifiers();
  }

  private clearToastModifiers(): void {
    this.elToast.classList.remove(
      "hud-toast--hole-in-one",
      "hud-toast--clean-shot",
      "hud-toast--oob",
      "hud-toast--free-skip",
      "hud-toast--coins",
    );
  }

  update(_deltaSeconds: number): void {
    void _deltaSeconds;
  }
}

function requireEl(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector(`#${id}`);
  if (!el) throw new Error(`HUD missing #${id}`);
  return el as HTMLElement;
}
