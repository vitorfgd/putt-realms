import * as THREE from "three";

/** Blender/FBX names often use `_` / `.001`; normalize so `windmill_arm` matches `windmillArm`. */
export function normalizeForAssetMatch(name: string): string {
  return name.toLowerCase().replace(/[-\s_.]/g, "");
}

/**
 * When named spin nodes are missing, prefer a mesh-bearing sibling under the same parent
 * (typical FBX: static base + rotor group) instead of spinning the whole file root.
 */
function collectSpinFallbackTargets(root: THREE.Object3D): THREE.Object3D[] {
  const staticHint =
    /base|bottom|stand|pole|mast|tower|column|stem|post|pylon|pedestal|foundation|ground|deck|housing|body|mount/i;

  const containsMesh = (o: THREE.Object3D): boolean => {
    let found = false;
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) found = true;
    });
    return found;
  };

  const horizontalSpan = (o: THREE.Object3D): number => {
    const box = new THREE.Box3().setFromObject(o);
    const sz = box.getSize(new THREE.Vector3());
    return Math.max(sz.x, sz.z);
  };

  const scoreNode = (s: THREE.Object3D): number => {
    const span = horizontalSpan(s);
    const penalty =
      staticHint.test(s.name) ||
      staticHint.test(normalizeForAssetMatch(s.name))
        ? 0.35
        : 1;
    return span * penalty;
  };

  root.updateMatrixWorld(true);

  let parents: THREE.Object3D[] = [root];
  const expanded = new Set<string>([root.uuid]);

  while (parents.length > 0) {
    const nextParents: THREE.Object3D[] = [];

    for (const p of parents) {
      const meshKids = p.children.filter(containsMesh);
      if (meshKids.length >= 2) {
        const sorted = [...meshKids].sort((a, b) => scoreNode(b) - scoreNode(a));
        return [sorted[0]!];
      }
      for (const ch of meshKids) {
        if (!expanded.has(ch.uuid)) {
          expanded.add(ch.uuid);
          nextParents.push(ch);
        }
      }
    }

    parents = nextParents;
  }

  const meshKids = root.children.filter(containsMesh);
  if (meshKids.length === 1) {
    return [meshKids[0]!];
  }
  return [root];
}

/** FBX exports: name rotating blade/arm objects with a `windmillArm` prefix (e.g. `windmillArm`,
 * `windmill_arm`, `windmillArm.001`) so each gets {@link THREE.Object3D.rotation.y} driven in sync.
 */
export function collectWindmillSpinTargets(root: THREE.Object3D): THREE.Object3D[] {
  const seen = new Set<string>();
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!o.name?.trim()) return;
    const compact = normalizeForAssetMatch(o.name);
    if (/^windmillarm/.test(compact)) {
      if (!seen.has(o.uuid)) {
        seen.add(o.uuid);
        out.push(o);
      }
    }
  });
  if (out.length === 0) {
    const named = root.getObjectByName("windmillArm");
    if (named && !seen.has(named.uuid)) {
      out.push(named);
    }
  }
  if (out.length === 0) {
    return collectSpinFallbackTargets(root);
  }
  return out;
}

/**
 * Fan FBX / legacy: prefix `fanArm`, `fanBlade`, `fanRotor`, or bare `blade` / `propeller` / `rotor` + digits.
 */
export function collectFanSpinTargets(root: THREE.Object3D): THREE.Object3D[] {
  const seen = new Set<string>();
  const out: THREE.Object3D[] = [];
  const tryAdd = (o: THREE.Object3D | null | undefined) => {
    if (!o || seen.has(o.uuid)) return;
    seen.add(o.uuid);
    out.push(o);
  };
  tryAdd(root.getObjectByName("fanBlades"));
  tryAdd(root.getObjectByName("fanBlade"));
  tryAdd(root.getObjectByName("fanArm"));
  root.traverse((o) => {
    if (!o.name?.trim()) return;
    const n = normalizeForAssetMatch(o.name);
    if (/^fan(arm|blade|rotor)/.test(n) || /^(blade|propeller|rotor)\d*$/.test(n)) {
      tryAdd(o);
    }
  });
  if (out.length === 0) {
    return collectSpinFallbackTargets(root);
  }
  return out;
}

/** FBX/GLB windmills often add a grey pole/mast; hide by name so only spinning arms read */
export function hideWindmillGreyStaticParts(
  root: THREE.Object3D,
  spinRoots: readonly THREE.Object3D[],
): void {
  const re =
    /pole|mast|tower|column|stem|post|stand|pylon|pedestal|mount|shaft|hub|bearing/i;
  const underSpin = (mesh: THREE.Mesh): boolean => {
    for (const arm of spinRoots) {
      let p: THREE.Object3D | null = mesh.parent;
      while (p) {
        if (p === arm) return true;
        p = p.parent;
      }
    }
    return false;
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (spinRoots.includes(o)) return;
    if (underSpin(o)) return;
    if (re.test(o.name)) o.visible = false;
  });
}
