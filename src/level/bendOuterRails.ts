/**
 * Outer L-rail signs in tile **local** space (before `rotationY`).
 * `sx` → offset sign for the rail that runs along local ±Z (mesh `railAlongZ.position.x`).
 * `sz` → offset sign for the rail along local ±X (`railAlongX.position.z`).
 *
 * Keys are grid steps `prev→cur→next` as incoming `(dxIn,dzIn)` and outgoing `(dxOut,dzOut)`.
 * This cannot be reduced to `cross>0` alone: the same cross sign can need different locals
 * once the tile is rotated so local +Z aligns with outgoing.
 */
export type BendRailSigns = { sx: 1 | -1; sz: 1 | -1 };

const TABLE: Record<string, BendRailSigns> = {
  "1,0,0,1": { sx: -1, sz: -1 }, // E → N
  "-1,0,0,1": { sx: -1, sz: -1 }, // W → N
  "1,0,0,-1": { sx: -1, sz: 1 }, // E → S
  "-1,0,0,-1": { sx: 1, sz: 1 }, // W → S
  "0,1,1,0": { sx: -1, sz: -1 }, // N → E
  "0,1,-1,0": { sx: 1, sz: -1 }, // N → W
  "0,-1,1,0": { sx: 1, sz: 1 }, // S → E
  "0,-1,-1,0": { sx: -1, sz: 1 }, // S → W
};

export function bendOuterRailSigns(
  dxIn: number,
  dzIn: number,
  dxOut: number,
  dzOut: number,
): BendRailSigns {
  const k = `${dxIn},${dzIn},${dxOut},${dzOut}`;
  return TABLE[k] ?? { sx: -1, sz: -1 };
}
