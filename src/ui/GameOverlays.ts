import type { GeneratedLevel } from "../level/LevelTypes";
import type { AudioSettings } from "../platform-browser/GameAudio";
import type { QuestProgress } from "../progression/QuestService";

const LS_TUTORIAL = "pmg_seen_tutorial_v1";

export interface LevelSummaryView {
  strokes: number;
  par: number;
  coinsCollected: number;
  rewardCoins: number;
  seed?: string;
  difficulty: number;
  realmName: string;
  unlockedCosmetic?: string;
  questProgress: QuestProgress;
}

export class GameOverlays {
  private readonly root: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
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
  onAudioSettings?: (settings: Partial<AudioSettings>) => void;
  onUiSound?: () => void;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "game-overlays";
    parent.appendChild(this.root);

    this.pauseBtn = document.createElement("button");
    this.pauseBtn.type = "button";
    this.pauseBtn.className = "overlay-pause-button";
    this.pauseBtn.textContent = "Pause";
    this.pauseBtn.addEventListener("click", () => {
      this.onUiSound?.();
      this.showPause(true);
    });
    this.root.appendChild(this.pauseBtn);

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
    const nodes = Array.from({ length: p.maxLevel }, (_, i) => i + 1)
      .map((n) => {
        const cls = [
          "route-node",
          n < p.level ? "route-node--done" : "",
          n === p.level ? "route-node--current" : "",
          p.milestoneLevels.includes(n) ? "route-node--milestone" : "",
        ].join(" ");
        return `<span class="${cls}">${n}</span>`;
      })
      .join("");
    this.routePanel.innerHTML = `
      <div class="overlay-card route-card">
        <span class="overlay-eyebrow">Realm Run</span>
        <h2>${p.realmName}</h2>
        <p class="overlay-muted">Level ${p.level}/${p.maxLevel} | Par ${level.par}</p>
        <div class="route-line">${nodes}</div>
      </div>
    `;
    this.routePanel.classList.remove("overlay-panel--hidden");
    window.setTimeout(
      () => this.routePanel.classList.add("overlay-panel--hidden"),
      1500,
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
    this.summaryPanel.innerHTML = `
      <div class="overlay-card summary-card">
        <span class="overlay-eyebrow">Hole Complete</span>
        <h2>${summary.realmName}</h2>
        <div class="summary-grid">
          <span>Strokes</span><strong>${summary.strokes}</strong>
          <span>Par</span><strong>${summary.par}</strong>
          <span>Coins</span><strong>+${summary.coinsCollected + summary.rewardCoins}</strong>
          <span>Difficulty</span><strong>${summary.difficulty}/10</strong>
        </div>
        ${summary.unlockedCosmetic ? `<p class="overlay-reward">Unlocked: ${summary.unlockedCosmetic}</p>` : ""}
        <p class="overlay-muted">Seed ${summary.seed ?? "legacy"} | Under par ${summary.questProgress.underParCompletions}/3 | Coins ${summary.questProgress.collectedCoins}/10</p>
        <button type="button" data-action="continue">Continue</button>
      </div>
    `;
    this.summaryPanel.classList.remove("overlay-panel--hidden");
    const btn = this.summaryPanel.querySelector("[data-action='continue']");
    btn?.addEventListener("click", () => {
      this.onUiSound?.();
      this.hideSummary();
      this.onContinue?.();
    }, { once: true });
  }

  hideSummary(): void {
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
