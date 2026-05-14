import type { GeneratedLevel } from "../level/LevelTypes";
import type { AudioSettings } from "../platform-browser/GameAudio";
import type { QuestProgress } from "../progression/QuestService";

const LS_TUTORIAL = "pmg_seen_tutorial_v1";

export interface LevelSummaryView {
  strokes: number;
  par: number;
  coinsCollected: number;
  rewardCoins: number;
  realmName: string;
  unlockedCosmetic?: string;
  questProgress: QuestProgress;
}

export class GameOverlays {
  private readonly root: HTMLElement;
  private readonly pausePanel: HTMLElement;
  private readonly loadingPanel: HTMLElement;
  private readonly routePanel: HTMLElement;
  private readonly tutorialPanel: HTMLElement;
  private readonly summaryPanel: HTMLElement;
  private readonly musicToggle: HTMLInputElement;
  private readonly sfxToggle: HTMLInputElement;
  private seenTutorial: Record<string, boolean> = {};

  onPauseChange?: (paused: boolean) => void;
  onRestart?: () => void;
  onContinue?: () => void;
  /** Optional — e.g. future shop route; summary Shop button still shows an in-panel hint if unset. */
  onShop?: () => void;
  onAudioSettings?: (settings: Partial<AudioSettings>) => void;
  onUiSound?: () => void;

  private shopToastTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "game-overlays";
    parent.appendChild(this.root);

    this.pausePanel = this.panel("pause-panel overlay-panel--hidden");
    this.pausePanel.innerHTML = `
      <div class="overlay-card">
        <h2>Paused</h2>
        <p class="overlay-muted">Take a breath. The realm can wait.</p>
        <label class="overlay-toggle"><input id="overlay-music-toggle" type="checkbox" /> Music</label>
        <label class="overlay-toggle"><input id="overlay-sfx-toggle" type="checkbox" /> SFX</label>
        <button type="button" data-action="resume">Resume</button>
        <button type="button" data-action="restart">Restart hole</button>
      </div>
    `;
    this.musicToggle = this.pausePanel.querySelector(
      "#overlay-music-toggle",
    ) as HTMLInputElement;
    this.sfxToggle = this.pausePanel.querySelector(
      "#overlay-sfx-toggle",
    ) as HTMLInputElement;
    this.pausePanel.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute("data-action");
      if (!action) return;
      this.onUiSound?.();
      if (action === "resume") this.showPause(false);
      if (action === "restart") {
        this.showPause(false);
        this.onRestart?.();
      }
    });
    this.musicToggle.addEventListener("change", () => {
      this.onAudioSettings?.({ musicMuted: !this.musicToggle.checked });
    });
    this.sfxToggle.addEventListener("change", () => {
      this.onAudioSettings?.({ sfxMuted: !this.sfxToggle.checked });
    });
    this.root.appendChild(this.pausePanel);

    this.loadingPanel = this.panel("loading-panel overlay-panel--hidden");
    this.loadingPanel.innerHTML = `
      <div class="overlay-card overlay-card--small">
        <div class="loading-rune"></div>
        <strong>Conjuring Realm</strong>
      </div>
    `;
    this.root.appendChild(this.loadingPanel);

    this.routePanel = this.panel("route-panel overlay-panel--hidden");
    this.root.appendChild(this.routePanel);

    this.tutorialPanel = this.panel("tutorial-panel overlay-panel--hidden");
    this.root.appendChild(this.tutorialPanel);

    this.summaryPanel = this.panel("summary-panel overlay-panel--hidden");
    this.root.appendChild(this.summaryPanel);

    this.loadSeenTutorial();
  }

  syncAudioSettings(settings: AudioSettings): void {
    this.musicToggle.checked = !settings.musicMuted;
    this.sfxToggle.checked = !settings.sfxMuted;
  }

  showPause(show: boolean): void {
    this.pausePanel.classList.toggle("overlay-panel--hidden", !show);
    this.onPauseChange?.(show);
  }

  showLoading(show: boolean): void {
    this.loadingPanel.classList.toggle("overlay-panel--hidden", !show);
  }

  showRoute(level: GeneratedLevel): void {
    const p = level.progressionSummary;
    if (!p) return;
    const diff = level.difficultyScore;
    const hole = p.level;
    this.routePanel.innerHTML = `
      <div class="realm-route" role="status" aria-live="polite">
        <div class="realm-route__frame">
          <div class="realm-route__picture">
            <img
              class="realm-route__bg"
              src="/assets/ui/realm_run_frame.png"
              alt=""
              width="967"
              height="348"
              decoding="async"
            />
          </div>
          <div class="realm-route__text">
            <p class="realm-route__realm">${escapeHtml(p.realmName)}</p>
            <p class="realm-route__meta">
              Hole <strong>${hole}</strong> · Difficulty <strong>${diff}/10</strong> · Par ${level.par}
            </p>
          </div>
        </div>
      </div>
    `;
    this.routePanel.classList.remove("overlay-panel--hidden");
    window.setTimeout(
      () => this.routePanel.classList.add("overlay-panel--hidden"),
      2300,
    );
  }

  showTutorialOnce(key: string, title: string, _body: string): void {
    if (this.seenTutorial[key]) return;
    this.seenTutorial[key] = true;
    this.saveSeenTutorial();
    this.tutorialPanel.innerHTML = `
      <div class="tutorial-card">
        <span>Tip</span>
        <strong>${title}</strong>
      </div>
    `;
    this.tutorialPanel.classList.remove("overlay-panel--hidden");
    window.setTimeout(
      () => this.tutorialPanel.classList.add("overlay-panel--hidden"),
      2400,
    );
  }

  showSummary(summary: LevelSummaryView): void {
    const coinsTotal = summary.coinsCollected + summary.rewardCoins;
    const qp = summary.questProgress;
    this.summaryPanel.innerHTML = `
      <div class="run-summary" role="dialog" aria-labelledby="run-summary-title">
        <h2 id="run-summary-title" class="run-summary__visually-hidden">Run summary</h2>
        <div class="run-summary__frame">
          <img
            class="run-summary__bg"
            src="/assets/ui/run_summary_frame.png"
            alt=""
            width="520"
            height="620"
            decoding="async"
          />
          <div class="run-summary__stats">
            <p class="run-summary__realm">${escapeHtml(summary.realmName)}</p>
            <dl class="run-summary__grid">
              <dt>Strokes</dt><dd>${summary.strokes}</dd>
              <dt>Par</dt><dd>${summary.par}</dd>
              <dt>Coins</dt><dd>+${coinsTotal}</dd>
            </dl>
            ${
              summary.unlockedCosmetic
                ? `<p class="run-summary__unlock">Unlocked: ${escapeHtml(summary.unlockedCosmetic)}</p>`
                : ""
            }
            <p class="run-summary__quests">
              <span class="run-summary__quests-row">
                <span class="run-summary__quests-label">Under par</span>
                <span class="run-summary__quests-val">${qp.underParCompletions}/3</span>
              </span>
              <span class="run-summary__quests-row">
                <span class="run-summary__quests-label">Run coins</span>
                <span class="run-summary__quests-val">${qp.collectedCoins}/10</span>
              </span>
            </p>
          </div>
          <p class="run-summary__shop-toast run-summary__shop-toast--hidden" role="status" aria-live="polite">
            Shop — coming soon
          </p>
          <div class="run-summary__footer">
            <button type="button" class="run-summary__btn" data-action="continue" aria-label="Next level">
              <img src="/assets/ui/run_summary_btn_next.png" alt="" width="280" height="96" decoding="async" />
            </button>
            <button type="button" class="run-summary__btn" data-action="shop" aria-label="Shop">
              <img src="/assets/ui/run_summary_btn_shop.png" alt="" width="280" height="96" decoding="async" />
            </button>
          </div>
        </div>
      </div>
    `;
    this.summaryPanel.classList.remove("overlay-panel--hidden");
    const nextBtn = this.summaryPanel.querySelector("[data-action='continue']");
    nextBtn?.addEventListener(
      "click",
      () => {
        this.onUiSound?.();
        this.hideSummary();
        this.onContinue?.();
      },
      { once: true },
    );
    const shopBtn = this.summaryPanel.querySelector("[data-action='shop']");
    shopBtn?.addEventListener("click", () => {
      this.onUiSound?.();
      this.onShop?.();
      const toast = this.summaryPanel.querySelector(".run-summary__shop-toast");
      toast?.classList.remove("run-summary__shop-toast--hidden");
      window.clearTimeout(this.shopToastTimer);
      this.shopToastTimer = window.setTimeout(() => {
        toast?.classList.add("run-summary__shop-toast--hidden");
      }, 2400);
    });
  }

  hideSummary(): void {
    window.clearTimeout(this.shopToastTimer);
    this.shopToastTimer = 0;
    this.summaryPanel.classList.add("overlay-panel--hidden");
  }

  private panel(className: string): HTMLElement {
    const el = document.createElement("div");
    el.className = `overlay-panel ${className}`;
    return el;
  }

  private loadSeenTutorial(): void {
    try {
      this.seenTutorial = JSON.parse(localStorage.getItem(LS_TUTORIAL) ?? "{}");
    } catch {
      this.seenTutorial = {};
    }
  }

  private saveSeenTutorial(): void {
    try {
      localStorage.setItem(LS_TUTORIAL, JSON.stringify(this.seenTutorial));
    } catch {
      /* ignore full storage */
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
