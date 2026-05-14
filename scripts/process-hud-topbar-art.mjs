/**
 * HUD top-bar PNG prep (optional): remove baked-in **outer** black matte only, then trim margins.
 *
 * Border-seeded flood only. `hud_topbar_coins.png` uses stricter numeric gates plus chrominance
 * guards so dark green panel pixels never chain to the border as “matte”.
 * Also processes `skip_level.png` (skip button background).
 *
 * Usage: `npm run process:hud-topbar` (requires devDependency `sharp`).
 */
import { mkdir, stat, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(__dirname, "..", "public", "assets", "ui");

const FILES = [
  "hud_topbar_container.png",
  "hud_topbar_level.png",
  "hud_topbar_coins.png",
  "hud_topbar_strokes.png",
  "hud_topbar_par.png",
  "hud_topbar_pause.png",
  "hud_topbar_settings.png",
  "skip_level.png",
];

/** @typedef {{ seedMax: number; floodMax: number; floodSum: number; floodSpread: number }} MatteRules */

/** @type {Readonly<MatteRules>} */
const DEFAULT_MATTE_RULES = {
  seedMax: 8,
  floodMax: 22,
  floodSum: 52,
  floodSpread: 14,
};

/** Stricter flood for coin strip — dark green interior must not read as neutral matte. */
/** @type {Readonly<Record<string, MatteRules>>} */
const MATTE_RULES_BY_FILE = {
  "hud_topbar_coins.png": {
    seedMax: 6,
    floodMax: 15,
    floodSum: 34,
    floodSpread: 9,
  },
};

/** @param {string} fileName */
function matteRulesFor(fileName) {
  return MATTE_RULES_BY_FILE[fileName] ?? DEFAULT_MATTE_RULES;
}

/** @param {MatteRules} rules */
function isBorderSeed(r, g, b, rules) {
  return r <= rules.seedMax && g <= rules.seedMax && b <= rules.seedMax;
}

/**
 * Neutral near-black matte steps only. Chrominance guards protect green fills and gold frames.
 * @param {MatteRules} rules
 */
function isMatteFloodStep(r, g, b, rules) {
  /** Green-heavy fills (coin panel, par gem) — block even fairly dark greens. */
  if (g > 10 && g >= r + 4 && g >= b + 2) return false;
  if (r > 14 && g > 10 && r > b + 5 && g >= b) return false;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const sum = r + g + b;
  if (max > rules.floodMax) return false;
  if (sum > rules.floodSum) return false;
  if (spread > rules.floodSpread) return false;
  return true;
}

/**
 * @param {Buffer} data
 * @param {number} width
 * @param {number} height
 * @param {MatteRules} rules
 */
function floodBorderMatteToTransparent(data, width, height, rules) {
  const px = Buffer.from(data);
  const n = width * height;
  const visited = new Uint8Array(n);
  /** @type {number[]} */
  const q = [];
  let qh = 0;

  const push = (i) => {
    if (visited[i]) return;
    visited[i] = 1;
    q.push(i);
  };

  const oAt = (i) => i * 4;

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const i = y * width + x;
      const o = oAt(i);
      if (isBorderSeed(px[o], px[o + 1], px[o + 2], rules)) push(i);
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const i = y * width + x;
      const o = oAt(i);
      if (isBorderSeed(px[o], px[o + 1], px[o + 2], rules)) push(i);
    }
  }

  while (qh < q.length) {
    const i = q[qh++];
    const x = i % width;
    const y = (i / width) | 0;
    const nbs = x + 1 < width ? i + 1 : -1;
    const nbw = x > 0 ? i - 1 : -1;
    const nbd = y + 1 < height ? i + width : -1;
    const nbu = y > 0 ? i - width : -1;
    for (const ni of [nbs, nbw, nbd, nbu]) {
      if (ni < 0) continue;
      if (visited[ni]) continue;
      const o = oAt(ni);
      if (!isMatteFloodStep(px[o], px[o + 1], px[o + 2], rules)) continue;
      visited[ni] = 1;
      q.push(ni);
    }
  }

  for (let i = 0; i < n; i++) {
    if (!visited[i]) continue;
    px[oAt(i) + 3] = 0;
  }

  return px;
}

async function matteBorderAndTrim(absPath) {
  const fileName = path.basename(absPath);
  const rules = matteRulesFor(fileName);

  const { data, info } = await sharp(absPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`Expected RGBA, got ${channels} channels for ${absPath}`);
  }

  const px = floodBorderMatteToTransparent(data, width, height, rules);
  const tmp = `${absPath}.processing.png`;
  await sharp(px, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .trim({ threshold: 1 })
    .toFile(tmp);

  await unlink(absPath).catch(() => undefined);
  await rename(tmp, absPath);

  const meta = await sharp(absPath).metadata();
  console.log(`OK ${fileName} → ${meta.width}×${meta.height}`);
}

async function main() {
  await mkdir(uiDir, { recursive: true });
  for (const name of FILES) {
    const abs = path.join(uiDir, name);
    try {
      await stat(abs);
    } catch {
      console.warn(`Skip (missing): ${name}`);
      continue;
    }
    await matteBorderAndTrim(abs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
