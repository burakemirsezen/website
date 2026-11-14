// Shared by the offline bake (src/pages/bake.astro) and the runtime
// (lightbake.ts): how the room's meshes are listed, fingerprinted and mapped.
// Both sides must derive the same things from the same scene, so the logic
// lives in one place.
//
// The bake is ambient occlusion only (mood independent). Two kinds of data:
//  - Large flat faces (floor, walls, ceiling, rug top, ...) get a "patch" in
//    one shared atlas, mapped by world position (no unwrapping needed).
//  - Every other mesh gets one occlusion byte per vertex.

import * as THREE from 'three';

export const BAKE_VERSION = 1;

/** Anything wholly beyond this z is behind the camera (the closing front wall). */
const BEHIND_CAMERA_Z = 1.7;
/** A flat face this large (m²) or larger gets an atlas patch. */
const MIN_PATCH_AREA = 0.4;
const ROOM_CENTRE = new THREE.Vector3(0, 1.35, 0);
/** Atlas gutter, in texels, around every patch (edge values are repeated into it). */
export const PATCH_PAD = 2;
/** The top-left block of the atlas is kept white; uv (0,0) means "no occlusion". */
export const WHITE_BLOCK = 4;

export interface MeshInfo {
  index: number;
  mesh: THREE.Mesh;
  fp: string;
  /** Receives per-vertex occlusion (static, standard material, not instanced). */
  receiver: boolean;
  /** Is solid for rays (visible, opaque, lit). */
  occluder: boolean;
  /** World-space position and normal of every vertex (receivers only). */
  wpos?: Float32Array;
  wnrm?: Float32Array;
}

export interface Patch {
  key: string;
  info: MeshInfo;
  /** Vertex indices of this face. */
  verts: number[];
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  /** Axes of the in-plane coordinates a and b. */
  ua: 0 | 1 | 2;
  ub: 0 | 1 | 2;
  /** Coordinate along the normal axis. */
  plane: number;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

export interface Collected {
  meshes: MeshInfo[];
  patches: Patch[];
  sceneFp: string;
}

const IN_PLANE: Record<number, [0 | 1 | 2, 0 | 1 | 2]> = { 0: [2, 1], 1: [0, 2], 2: [0, 1] };

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const cm = (x: number) => Math.round(x * 100);

export function isVisibleInTree(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export function standardMaterials(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.filter((m): m is THREE.MeshStandardMaterial => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true);
}

function solid(mesh: THREE.Mesh) {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.every((m) => {
    const p = m as THREE.MeshPhysicalMaterial;
    return !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial && !m.transparent && m.opacity >= 1 && !(p.transmission > 0);
  });
}

/**
 * Lists the scene's meshes in traversal order, with fingerprints and flat-face
 * patches. `full` also computes world-space vertices for every receiver (the
 * bake needs them; the runtime does not).
 */
export function collectScene(scene: THREE.Scene, full = true): Collected {
  scene.updateMatrixWorld(true);
  const meshes: MeshInfo[] = [];
  const patches: Patch[] = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    box.setFromObject(mesh);
    const fp = `${pos.count}:${cm(box.min.x)},${cm(box.min.y)},${cm(box.min.z)},${cm(box.max.x)},${cm(box.max.y)},${cm(box.max.z)}`;
    const behind = box.min.z > BEHIND_CAMERA_Z;
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh === true;
    // Moving parts (tagged in scene.ts): never matched by position.
    const dynamic = mesh.userData.bakeDynamic === true;
    const lit = standardMaterials(mesh).length > 0;
    const info: MeshInfo = {
      index: meshes.length,
      mesh,
      fp,
      receiver: !dynamic && !behind && !instanced && lit && !!geo.attributes.normal && !(mesh as THREE.SkinnedMesh).isSkinnedMesh,
      occluder: !behind && isVisibleInTree(mesh) && solid(mesh),
    };
    meshes.push(info);
    if (!info.receiver) return;

    // World-space vertices. At runtime (full = false) only the flat-face
    // candidates need them.
    const flat = geo.type === 'PlaneGeometry' || geo.type === 'BoxGeometry';
    if (!full && !flat) return;
    const n = pos.count;
    const normal = geo.attributes.normal as THREE.BufferAttribute;
    const wpos = new Float32Array(n * 3);
    const wnrm = new Float32Array(n * 3);
    nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).toArray(wpos, i * 3);
      v.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize().toArray(wnrm, i * 3);
    }
    info.wpos = wpos;
    info.wnrm = wnrm;

    // Flat faces of planes and boxes.
    if (!flat) return;
    const groups = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      let axis = -1;
      for (let a = 0; a < 3; a++) if (Math.abs(wnrm[i * 3 + a]) > 0.995) axis = a;
      if (axis < 0) continue;
      const key = `${axis}${wnrm[i * 3 + axis] > 0 ? '+' : '-'}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(i);
    }
    for (const [face, verts] of groups) {
      const axis = Number(face[0]) as 0 | 1 | 2;
      const sign = face[1] === '+' ? 1 : -1;
      const [ua, ub] = IN_PLANE[axis];
      let a0 = Infinity,
        a1 = -Infinity,
        b0 = Infinity,
        b1 = -Infinity,
        p0 = Infinity,
        p1 = -Infinity;
      for (const i of verts) {
        const a = wpos[i * 3 + ua],
          b = wpos[i * 3 + ub],
          p = wpos[i * 3 + axis];
        a0 = Math.min(a0, a);
        a1 = Math.max(a1, a);
        b0 = Math.min(b0, b);
        b1 = Math.max(b1, b);
        p0 = Math.min(p0, p);
        p1 = Math.max(p1, p);
      }
      if (p1 - p0 > 1e-3 || (a1 - a0) * (b1 - b0) < MIN_PATCH_AREA) continue;
      // Only faces that look into the room.
      v.set(0, 0, 0);
      v.setComponent(axis, (p0 + p1) / 2).setComponent(ua, (a0 + a1) / 2).setComponent(ub, (b0 + b1) / 2);
      if (v.sub(ROOM_CENTRE).getComponent(axis) * sign >= 0) continue;
      patches.push({ key: `${fp}|${face}`, info, verts, axis, sign, ua, ub, plane: (p0 + p1) / 2, a0, a1, b0, b1 });
    }
  });

  const fixed = meshes.filter((m) => m.mesh.userData.bakeDynamic !== true);
  return { meshes, patches, sceneFp: hash(fixed.map((m) => m.fp).join(';')) };
}

/** Where a patch sits in the atlas (pixels, y down), as stored in the manifest. */
export interface PatchRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Atlas uv of the in-plane coordinates (a, b) of a patch. */
export function patchUv(p: Patch, r: PatchRect, atlasW: number, atlasH: number, a: number, b: number, out: THREE.Vector2) {
  const s = THREE.MathUtils.clamp((a - p.a0) / (p.a1 - p.a0), 0, 1);
  const t = THREE.MathUtils.clamp((b - p.b0) / (p.b1 - p.b0), 0, 1);
  const px = r.x + PATCH_PAD + s * (r.w - 2 * PATCH_PAD);
  const py = r.y + PATCH_PAD + (1 - t) * (r.h - 2 * PATCH_PAD);
  return out.set(px / atlasW, 1 - py / atlasH);
}

/** The uv1 attribute for one mesh: its patches mapped into the atlas, white elsewhere. */
export function buildUv1(info: MeshInfo, patches: { patch: Patch; rect: PatchRect }[], atlasW: number, atlasH: number) {
  const n = (info.mesh.geometry as THREE.BufferGeometry).attributes.position.count;
  const uv = new Float32Array(n * 2);
  const tmp = new THREE.Vector2();
  for (const { patch, rect } of patches) {
    for (const i of patch.verts) {
      patchUv(patch, rect, atlasW, atlasH, info.wpos![i * 3 + patch.ua], info.wpos![i * 3 + patch.ub], tmp);
      uv[i * 2] = tmp.x;
      uv[i * 2 + 1] = tmp.y;
    }
  }
  return new THREE.BufferAttribute(uv, 2);
}

export interface BakeManifest {
  version: number;
  sceneFp: string;
  /** Bake settings, for the record. */
  params: Record<string, number>;
  atlas: { file: string; w: number; h: number };
  vertex: { file: string };
  patches: PatchRect[];
  meshes: { index: number; fp: string; offset: number; count: number }[];
}
