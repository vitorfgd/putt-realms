import { assetRegistry } from "../art/AssetRegistry";
import type { AssetKey } from "../art/AssetRegistry";
import { isProcgenDebugPsxLowResPreferred } from "../core/Constants";

/** Hazards shown on full-map debug — preload FBX/GLB so instances aren’t empty */
const HAZARD_DEBUG_PRELOAD: AssetKey[] = [
  "hazard_windmill",
  "hazard_fan",
  "hazard_bridge",
  "hazard_bumper_mushroom",
  "hazard_portal_gate",
  "hazard_boost",
  "hazard_sandpit",
];
import { ISLAND_DECOR_ASSET_KEYS } from "../level/islandDecorScatter";
import { ProcgenDebugViewer } from "./ProcgenDebugViewer";
import { PROCGEN_TILE_TO_ASSET } from "./procgenAssetKeys";

const PRELOAD_KEYS: AssetKey[] = Array.from(
  new Set([
    ...Object.values(PROCGEN_TILE_TO_ASSET),
    "undermap_island" as AssetKey,
    ...ISLAND_DECOR_ASSET_KEYS,
  ]),
) as AssetKey[];

/**
 * Entry only when URL contains `procgenDebug=1` — does not affect normal gameplay.
 */
export async function mountProcgenDebug(canvas: HTMLCanvasElement): Promise<void> {
  document.querySelector<HTMLElement>("#title-screen")?.remove();
  document.querySelector<HTMLElement>("#hud")?.remove();
  document.body.style.margin = "0";
  canvas.style.display = "block";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";

  const hint = document.createElement("div");
  hint.style.cssText =
    "position:fixed;bottom:12px;left:12px;padding:10px 14px;background:rgba(0,0,0,.72);color:#e8f4ff;font:13px/1.45 system-ui,sans-serif;border-radius:8px;z-index:10000;max-width:min(420px,92vw);pointer-events:none;";
  hint.innerHTML =
    "<b>Procgen debug</b><br>" +
    "1–5: tile types · <b>G</b>: random map · <b>S</b>: socket helpers<br>" +
    "<span style='opacity:.85'>Blue = entry · Green = exit · Red = pivot · " +
    "Generated maps include hazard props (windmill/fan/etc.) when spawned.</span>" +
    "<br><span style='opacity:.82'><b>Game view</b> adds void clouds like gameplay. " +
    "<b>PSX low-res</b>: toolbar or <code>?procgenPsxLowRes</code> / <code>?psxLowRes</code>; defaults in Constants (<code>PROCGEN_DEBUG_PSX_LOW_RES_DEFAULT</code>).</span>";
  document.body.appendChild(hint);

  await Promise.all(
    [...PRELOAD_KEYS, ...HAZARD_DEBUG_PRELOAD].map((k) =>
      assetRegistry.preloadAsset(k),
    ),
  );

  const toolbar = document.createElement("div");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Procgen debug actions");
  toolbar.style.cssText =
    "position:fixed;top:10px;left:10px;right:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;" +
    "z-index:10001;padding:10px 12px;background:rgba(15,25,40,.88);border-radius:10px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:auto;font:13px system-ui,sans-serif;";

  const btnStyle =
    "cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);" +
    "background:rgba(255,255,255,.12);color:#f0f6ff;font:inherit;";
  const btnPrimary =
    btnStyle + "background:rgba(80,160,255,.35);border-color:rgba(120,190,255,.5);";
  const inputStyle =
    "min-width:250px;max-width:min(420px,70vw);padding:8px 10px;border-radius:8px;" +
    "border:1px solid rgba(255,255,255,.24);background:rgba(0,0,0,.28);color:#f0f6ff;font:inherit;";
  const seedLabelStyle =
    "padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.24);color:#d8edff;" +
    "border:1px solid rgba(255,255,255,.12);";

  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.placeholder = "seed";
  seedInput.style.cssText = inputStyle;
  seedInput.setAttribute("aria-label", "Procgen seed");

  const difficultyInput = document.createElement("input");
  difficultyInput.type = "number";
  difficultyInput.min = "1";
  difficultyInput.max = "20";
  difficultyInput.step = "1";
  difficultyInput.value =
    new URLSearchParams(location.search).get("procgenDifficulty") ?? "6";
  difficultyInput.style.cssText = inputStyle + "min-width:82px;max-width:82px;";
  difficultyInput.setAttribute("aria-label", "Procgen difficulty");

  const seedLabel = document.createElement("span");
  seedLabel.style.cssText = seedLabelStyle;
  seedLabel.textContent = "Seed: none yet";

  function updateSeedUi(seed: string): void {
    seedInput.value = seed;
    seedLabel.textContent = `Seed: ${seed}`;
    const url = new URL(location.href);
    url.searchParams.set("procgenSeed", seed);
    url.searchParams.set("procgenDifficulty", difficultyInput.value);
    if (viewer.getPsxLowResEnabled()) url.searchParams.set("procgenPsxLowRes", "1");
    history.replaceState(null, "", url);
  }

  function syncProcgenPsxUrl(enabled: boolean): void {
    const url = new URL(location.href);
    if (enabled) url.searchParams.set("procgenPsxLowRes", "1");
    else url.searchParams.delete("procgenPsxLowRes");
    history.replaceState(null, "", url);
  }

  function selectedDifficulty(): number {
    const n = Number(difficultyInput.value);
    return Number.isFinite(n) ? Math.max(1, Math.min(20, Math.round(n))) : 6;
  }

  const viewer = new ProcgenDebugViewer(canvas, {
    onMapGenerated: (map) => updateSeedUi(map.seed),
    getTargetDifficulty: selectedDifficulty,
    initialPsxLowRes: isProcgenDebugPsxLowResPreferred(),
  });
  viewer.start();

  function addButton(
    label: string,
    title: string,
    onClick: () => void,
    primary = false,
  ): void {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.style.cssText = primary ? btnPrimary : btnStyle;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
    });
    toolbar.appendChild(b);
  }

  addButton("1 Straight", "Show straight_right_wall", () =>
    viewer.showPresetTile(1),
  );
  addButton("2 Convex", "Show convex_right_wall", () =>
    viewer.showPresetTile(2),
  );
  addButton("3 Concave", "Show concave_right_wall", () =>
    viewer.showPresetTile(3),
  );
  addButton("4 Ramp R", "Show ramp_right_wall", () => viewer.showPresetTile(4));
  addButton("5 Ramp L", "Show ramp_left_wall", () => viewer.showPresetTile(5));
  addButton(
    "Generate map",
    "Random procedural map (same as G)",
    () => viewer.generateMapFromUi(undefined, selectedDifficulty()),
    true,
  );
  toolbar.appendChild(seedLabel);
  toolbar.appendChild(seedInput);
  toolbar.appendChild(difficultyInput);
  addButton("Load seed", "Generate the map for the seed in the input", () => {
    const seed = seedInput.value.trim();
    if (seed) viewer.generateMapFromUi(seed, selectedDifficulty());
  });
  addButton("Copy seed", "Copy the current seed to clipboard", () => {
    const seed = seedInput.value.trim();
    if (seed) void navigator.clipboard?.writeText(seed);
  });
  addButton("Sockets", "Toggle socket helpers (same as S)", () =>
    viewer.toggleSocketHelpersFromUi(),
  );

  const psxBtn = document.createElement("button");
  psxBtn.type = "button";
  function refreshPsxBtn(): void {
    const on = viewer.getPsxLowResEnabled();
    psxBtn.textContent = on ? "PSX low-res ✓" : "PSX low-res";
    psxBtn.style.cssText = on ? btnPrimary : btnStyle;
    psxBtn.title = on
      ? "Using reduced-resolution RT + nearest upscale. Turn off to compare. Tune PSX_LOW_RES_INTERNAL_SCALE / ENABLE_PSX_LOW_RES_PIPELINE in Constants.ts."
      : "Enable PSX-style low-res pipeline (same path as ?psxLowRes in the main game). URL: ?procgenPsxLowRes or set PROCGEN_DEBUG_PSX_LOW_RES_DEFAULT.";
  }
  psxBtn.addEventListener("click", (e) => {
    e.preventDefault();
    viewer.setPsxLowResEnabled(!viewer.getPsxLowResEnabled());
    syncProcgenPsxUrl(viewer.getPsxLowResEnabled());
    refreshPsxBtn();
  });
  refreshPsxBtn();
  toolbar.appendChild(psxBtn);

  /** Above fullscreen WebGL canvas — parent `pointer-events: none`, button receives clicks. */
  const procgenOverlayUi = document.createElement("div");
  procgenOverlayUi.id = "procgen-debug-overlay-ui";
  procgenOverlayUi.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483646;touch-action:none;";

  let mapOnlyUi = false;
  const exitCleanBtn = document.createElement("button");
  exitCleanBtn.type = "button";
  exitCleanBtn.textContent = "Exit game view";
  exitCleanBtn.title = "Restore toolbar, hints, debug overlays, sockets (Esc)";
  exitCleanBtn.style.cssText =
    "display:none;position:fixed;bottom:14px;right:14px;pointer-events:auto;touch-action:manipulation;" +
    "cursor:pointer;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.28);" +
    "background:rgba(25,45,72,.92);color:#f0f6ff;font:13px system-ui,sans-serif;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.4);z-index:2147483647;";
  exitCleanBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    leaveMapOnlyUi();
  });

  function leaveMapOnlyUi(): void {
    if (!mapOnlyUi) return;
    mapOnlyUi = false;
    procgenOverlayUi.setAttribute("aria-hidden", "true");
    toolbar.style.display = "";
    hint.style.display = "";
    exitCleanBtn.style.display = "none";
    viewer.setMapOnlyScene(false);
  }

  const mapOnlyBtn = document.createElement("button");
  mapOnlyBtn.type = "button";
  mapOnlyBtn.textContent = "Game view";
  mapOnlyBtn.title =
    "Game-like view: hide toolbar, hints, procgen overlays (placeholders/labels), and sockets. Tiles and hazards stay. Esc or Exit clean view restores.";
  mapOnlyBtn.style.cssText = btnStyle;
  mapOnlyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (mapOnlyUi) return;
    mapOnlyUi = true;
    procgenOverlayUi.setAttribute("aria-hidden", "false");
    toolbar.style.display = "none";
    hint.style.display = "none";
    exitCleanBtn.style.display = "block";
    viewer.setMapOnlyScene(true);
  });
  toolbar.appendChild(mapOnlyBtn);

  procgenOverlayUi.appendChild(exitCleanBtn);
  procgenOverlayUi.setAttribute("aria-hidden", "true");
  document.body.appendChild(toolbar);
  document.body.appendChild(procgenOverlayUi);

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && mapOnlyUi) {
      e.preventDefault();
      leaveMapOnlyUi();
    }
  });

  hint.innerHTML +=
    "<br><span style='opacity:.9'>Or use the <b>buttons</b> at the top. Send the visible <b>Seed</b> when a map breaks.</span>";

  const initialSeed = new URLSearchParams(location.search).get("procgenSeed");
  if (initialSeed) {
    viewer.generateMapFromUi(initialSeed, selectedDifficulty());
  }
}
