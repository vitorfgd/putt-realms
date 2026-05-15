import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const TARGETS = [
  "fan.glb",
  "collectible_crown_coin.glb",
  "hazard_portal_gate.glb",
  "hazard_bumper_mushroom.glb",
  "windmill.glb",
  "hazard_sandpit.glb",
];

const MODEL_DIR = path.join("public", "assets", "models");
const JPEG_QUALITY = 72;
const MAX_TEXTURE_DIMENSION = 1024;

function align4(n) {
  return (n + 3) & ~3;
}

function paddedBuffer(buf, padByte) {
  const out = Buffer.alloc(align4(buf.length), padByte);
  buf.copy(out);
  return out;
}

function parseGlb(buffer, file) {
  if (buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`${file}: not a GLB file`);
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`${file}: expected GLB version 2, got ${version}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + chunkLength;
    if (chunkType === "JSON") {
      json = JSON.parse(buffer.slice(start, end).toString("utf8"));
    } else if (chunkType === "BIN\0") {
      bin = buffer.slice(start, end);
    }
    offset = end;
  }
  if (!json || !bin) {
    throw new Error(`${file}: expected JSON and BIN chunks`);
  }
  return { json, bin };
}

async function compressImage(bytes) {
  const metadata = await sharp(bytes).metadata();
  if (
    Math.max(metadata.width ?? 0, metadata.height ?? 0) <=
    MAX_TEXTURE_DIMENSION
  ) {
    return { bytes, changed: false };
  }
  const compressed = await sharp(bytes)
    .resize({
      width: MAX_TEXTURE_DIMENSION,
      height: MAX_TEXTURE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return { bytes: compressed, changed: true };
}

async function compressGlb(file) {
  const fullPath = path.join(MODEL_DIR, file);
  const original = await readFile(fullPath);
  const { json, bin } = parseGlb(original, file);
  if (!Array.isArray(json.images) || json.images.length === 0) {
    throw new Error(`${file}: no embedded images found`);
  }
  if (!Array.isArray(json.bufferViews)) {
    throw new Error(`${file}: no bufferViews found`);
  }

  const replacements = new Map();
  for (const image of json.images) {
    if (image.mimeType !== "image/jpeg" || image.bufferView === undefined) {
      continue;
    }
    const view = json.bufferViews[image.bufferView];
    if (!view) {
      throw new Error(`${file}: image references missing bufferView ${image.bufferView}`);
    }
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    replacements.set(image.bufferView, await compressImage(bin.slice(start, end)));
  }

  if (replacements.size === 0) {
    throw new Error(`${file}: no embedded JPEG bufferViews found`);
  }

  const newBinParts = [];
  let binOffset = 0;
  json.bufferViews = json.bufferViews.map((view, index) => {
    const oldStart = view.byteOffset ?? 0;
    const oldEnd = oldStart + view.byteLength;
    const replacement = replacements.get(index);
    const bytes = replacement?.bytes ?? bin.slice(oldStart, oldEnd);
    const alignedOffset = align4(binOffset);
    if (alignedOffset > binOffset) {
      newBinParts.push(Buffer.alloc(alignedOffset - binOffset));
      binOffset = alignedOffset;
    }
    newBinParts.push(bytes);
    const nextView = {
      ...view,
      byteOffset: binOffset,
      byteLength: bytes.length,
    };
    binOffset += bytes.length;
    return nextView;
  });

  const rawBin = Buffer.concat(newBinParts);
  const paddedBin = paddedBuffer(rawBin, 0x00);
  json.buffers = [{ ...(json.buffers?.[0] ?? {}), byteLength: rawBin.length }];

  const jsonBytes = paddedBuffer(Buffer.from(JSON.stringify(json)), 0x20);
  const totalLength = 12 + 8 + jsonBytes.length + 8 + paddedBin.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBytes.length, 0);
  jsonHeader.write("JSON", 4, "ascii");

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBin.length, 0);
  binHeader.write("BIN\0", 4, "ascii");

  const output = Buffer.concat([header, jsonHeader, jsonBytes, binHeader, paddedBin]);
  const changed = [...replacements.values()].some((replacement) => replacement.changed);
  if (changed) {
    await writeFile(fullPath, output);
  }
  return { file, before: original.length, after: changed ? output.length : original.length };
}

let beforeTotal = 0;
let afterTotal = 0;
for (const file of TARGETS) {
  const result = await compressGlb(file);
  beforeTotal += result.before;
  afterTotal += result.after;
  const saved = result.before - result.after;
  console.log(
    `${result.file}: ${result.before} -> ${result.after} bytes (${saved} saved)`,
  );
}

console.log(
  `Total: ${beforeTotal} -> ${afterTotal} bytes (${beforeTotal - afterTotal} saved)`,
);
