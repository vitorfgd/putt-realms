/**
 * Copies artist FBX from repo `/Tiles` into `public/assets/models/` with registry filenames.
 * Run: npm run sync:tiles
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "Tiles");
const dstDir = path.join(root, "public", "assets", "models");

/** [source in Tiles/, destination in public/assets/models/] */
const COPIES = [
  ["tile1_straight.fbx", "tile_straight_rw.fbx"],
  ["tile2_curve.fbx", "tile_convex_rw.fbx"],
  ["tile3_concave.fbx", "tile_concave_rw.fbx"],
  ["tile4_ramp1.fbx", "tile_ramp_rw.fbx"],
  ["tile5_ramp2.fbx", "tile_ramp_lw.fbx"],
  ["tile6_open.fbx", "tile_start_ph.fbx"],
  ["tile6_open.fbx", "tile_hole_ph.fbx"],
];

async function main() {
  await fs.mkdir(dstDir, { recursive: true });
  for (const [from, to] of COPIES) {
    const src = path.join(srcDir, from);
    const dst = path.join(dstDir, to);
    try {
      await fs.copyFile(src, dst);
      console.log(`OK  ${from} → ${to}`);
    } catch (e) {
      console.error(`FAIL ${from} → ${to}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
