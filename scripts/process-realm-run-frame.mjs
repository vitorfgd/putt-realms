/**
 * Build `public/assets/ui/realm_run_frame.png` from `realm_run_frame.source.png`.
 *
 * 1) **Crop** — Remove checker / neutral margins (Sharp trim fails on checkerboard rows).
 * 2) **Edge flood** — From image border, clear light “fringe” pixels in the four rectangular
 *    corners outside the rounded stone frame only. **The inner plate (navy, grass, etc.) stays opaque.**
 *
 * Usage: place art as `public/assets/ui/realm_run_frame.source.png`, then:
 *   `npm run process:realm-run-frame`
 */
import path from "node:path";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { writePngAtomic } from "./lib/writePngAtomic.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(__dirname, "..", "public", "assets", "ui");
const sourcePath = path.join(uiDir, "realm_run_frame.source.png");
const outPath = path.join(uiDir, "realm_run_frame.png");

const MARGIN_ROWCOL_LUMA = 200;

/** Light rectangular-corner fringe (outside rounded stone), not tan stone or blue. */
function isLightFringe(r, g, b) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sp = Math.max(r, g, b) - Math.min(r, g, b);
  return y >= 232 && sp <= 44;
}

function rowMeanLuma(data, w, c, y) {
  let sum = 0;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * c;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / w;
}

function colMeanLuma(data, w, h, c, x) {
  let sum = 0;
  for (let y = 0; y < h; y++) {
    const i = (y * w + x) * c;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / h;
}

function contentBBox(data, w, h, c) {
  let top = 0;
  while (top < h && rowMeanLuma(data, w, c, top) > MARGIN_ROWCOL_LUMA) top++;
  let bottom = h - 1;
  while (bottom >= 0 && rowMeanLuma(data, w, c, bottom) > MARGIN_ROWCOL_LUMA) bottom--;
  let left = 0;
  while (left < w && colMeanLuma(data, w, h, c, left) > MARGIN_ROWCOL_LUMA) left++;
  let right = w - 1;
  while (right >= 0 && colMeanLuma(data, w, h, c, right) > MARGIN_ROWCOL_LUMA) right--;
  if (left > right || top > bottom) {
    throw new Error(
      "Crop: could not find content bounds (adjust MARGIN_ROWCOL_LUMA or source art).",
    );
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * BFS from border pixels that match `isLightFringe`, expanding only through matching pixels.
 * @returns {number} pixels cleared
 */
function floodLightFringeFromBorder(buf, w, h, maxFrac) {
  const c = 4;
  const seen = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qt = 0;
  let qh = 0;
  const enqueue = (x, y) => {
    const k = y * w + x;
    if (seen[k]) return;
    const i = k * c;
    if (!isLightFringe(buf[i], buf[i + 1], buf[i + 2])) return;
    seen[k] = 1;
    qx[qh] = x;
    qy[qh] = y;
    qh++;
  };

  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }

  const maxQ = Math.floor(w * h * maxFrac);
  let count = 0;

  while (qt < qh) {
    if (qh > maxQ) {
      throw new Error("Edge flood grew too large — tighten isLightFringe or inspect source.");
    }
    const x = qx[qt];
    const y = qy[qt];
    qt++;
    const bi = (y * w + x) * c;
    buf[bi + 3] = 0;
    count++;

    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      enqueue(nx, ny);
    }
  }

  return count;
}

try {
  await stat(sourcePath);
} catch {
  console.error(`Missing ${sourcePath}`);
  console.error("Copy your realm frame art there, then run: npm run process:realm-run-frame");
  process.exit(1);
}

const { data: rgbFull, info: fullInfo } = await sharp(sourcePath)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const box = contentBBox(rgbFull, fullInfo.width, fullInfo.height, fullInfo.channels);
console.log(
  `Crop: ${fullInfo.width}x${fullInfo.height} → ${box.width}x${box.height} @ (${box.left},${box.top})`,
);

const { data: rgba, info: cropInfo } = await sharp(sourcePath)
  .extract(box)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = cropInfo.width;
const h = cropInfo.height;

const edgePx = floodLightFringeFromBorder(rgba, w, h, 0.38);
console.log(`Edge fringe → transparent: ${edgePx}px`);

await writePngAtomic(outPath, async (tmpPath) => {
  await sharp(rgba, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(tmpPath);
});

const meta = await sharp(outPath).metadata();
console.log(`Wrote ${outPath} (${meta.width}x${meta.height}, alpha=${meta.hasAlpha})`);
