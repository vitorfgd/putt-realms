/**
 * Write a PNG via Sharp to a temp path, then replace `outPath` atomically.
 * Avoids half-written files if the process dies mid-write.
 *
 * @param {string} outPath Final `.png` path
 * @param {(tmpPath: string) => Promise<void>} writeTmp async Sharp pipeline writing to `tmpPath`
 */
import { unlink, rename } from "node:fs/promises";

export async function writePngAtomic(outPath, writeTmp) {
  const tmpPath = `${outPath}.processing.png`;
  await writeTmp(tmpPath);
  await unlink(outPath).catch(() => undefined);
  await rename(tmpPath, outPath);
}
