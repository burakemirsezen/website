// Applies the precomputed ambient occlusion (see src/pages/bake.astro and the
// README) to a built room. Runtime only samples; nothing is traced here.
//
// - Flat faces (floor, walls, ceiling, rug, ...) get a uv1 set that points into
//   one shared atlas, used as the material's aoMap.
// - Other meshes get a per-vertex `bakedOcc` byte, folded into the same
//   indirect-light term three's aoMap darkens (ambient, hemisphere, reflections;
//   never the sun or the lamps).
// Anything that no longer matches the bake is skipped, and the room then looks
// exactly as it did without it. With no bake files at all, this does nothing.

import * as THREE from 'three';
import { BAKE_VERSION, buildUv1, collectScene, isVisibleInTree, standardMaterials, type BakeManifest, type MeshInfo, type Patch, type PatchRect } from './lightbake-common';

const files = import.meta.glob('../../assets/bake/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = (name: string) => Object.entries(files).find(([k]) => k.endsWith('/' + name))?.[1];

export interface BakeOptions {
  /** Hide the hand-placed contact-shadow and corner-fade decals the bake replaces. Default true. */
  hideFakeShadows?: boolean;
  /** 0 = off, 1 = as baked. Default 1. */
  intensity?: number;
}

export interface BakeReport {
  patches: number;
  meshes: number;
  stale: number;
}

let warned = false;
function stale(what: string) {
  if (warned) return;
  warned = true;
  console.info(`Room lighting bake is out of date (${what}); re-bake with npm run bake. Affected meshes are drawn without it.`);
}

/** Folds the per-vertex occlusion into the indirect-light term of a standard material. */
function injectVertexOcclusion(mat: THREE.MeshStandardMaterial) {
  if (mat.userData.bakedOccInjected) return;
  mat.userData.bakedOccInjected = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    const chunk = THREE.ShaderChunk.aomap_fragment;
    if (!/float ambientOcclusion = [^;]*;/.test(chunk) || !shader.fragmentShader.includes('#include <aomap_fragment>')) return;
    // The stock chunk, but with the vertex term as the base and the aoMap (if
    // any) multiplied on top, and active even without an aoMap.
    const body = chunk.replace('#ifdef USE_AOMAP', '#if 1').replace(
      /float ambientOcclusion = [^;]*;/,
      `float ambientOcclusion = 1.0 - vBakedOcc;
      #ifdef USE_AOMAP
        ambientOcclusion *= ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
      #endif`,
    );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float bakedOcc;\nvarying float vBakedOcc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBakedOcc = bakedOcc;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBakedOcc;')
      .replace('#include <aomap_fragment>', body);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|bakedOcc';
  mat.needsUpdate = true;
}

export async function applyBake(scene: THREE.Scene, options: BakeOptions = {}): Promise<BakeReport | null> {
  const manifestUrl = urlOf('ao-manifest.json');
  if (!manifestUrl) return null;
  let manifest: BakeManifest;
  let bin: Uint8Array;
  let atlas: THREE.Texture;
  try {
    const atlasUrl = urlOf('ao-atlas.webp');
    const binUrl = urlOf('ao-vertex.bin');
    if (!atlasUrl || !binUrl) return null;
    const [m, b, t] = await Promise.all([
      fetch(manifestUrl).then((r) => r.json() as Promise<BakeManifest>),
      fetch(binUrl).then((r) => r.arrayBuffer()),
      new THREE.TextureLoader().loadAsync(atlasUrl),
    ]);
    manifest = m;
    bin = new Uint8Array(b);
    atlas = t;
  } catch {
    return null;
  }
  if (manifest.version !== BAKE_VERSION) {
    stale('format changed');
    return null;
  }

  atlas.colorSpace = THREE.NoColorSpace;
  atlas.channel = 1;
  atlas.generateMipmaps = false;
  atlas.minFilter = atlas.magFilter = THREE.LinearFilter;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;

  const { meshes, patches, sceneFp } = collectScene(scene, false);
  if (sceneFp !== manifest.sceneFp) stale('the scene changed');

  // Geometry shared by several meshes must be copied before one of them gets its own attributes.
  const users = new Map<THREE.BufferGeometry, number>();
  for (const m of meshes) users.set(m.mesh.geometry, (users.get(m.mesh.geometry) ?? 0) + 1);
  const own = (mesh: THREE.Mesh) => {
    const g = mesh.geometry as THREE.BufferGeometry;
    if ((users.get(g) ?? 1) > 1) {
      users.set(g, users.get(g)! - 1);
      mesh.geometry = g.clone();
      users.set(mesh.geometry, 1);
    }
    return mesh.geometry as THREE.BufferGeometry;
  };

  // Entries by fingerprint, so a reordered scene still matches.
  const entries = new Map<string, BakeManifest['meshes']>();
  for (const e of manifest.meshes) {
    const l = entries.get(e.fp);
    if (l) l.push(e);
    else entries.set(e.fp, [e]);
  }
  const rects = new Map<string, PatchRect>(manifest.patches.map((r) => [r.key, r]));

  const aoMats = new Set<THREE.MeshStandardMaterial>();
  const occMats = new Set<THREE.MeshStandardMaterial>();
  let patchCount = 0;
  let meshCount = 0;
  let missing = 0;

  // Flat faces.
  const byMesh = new Map<MeshInfo, { patch: Patch; rect: PatchRect }[]>();
  for (const p of patches) {
    const rect = rects.get(p.key);
    if (!rect) {
      missing++;
      continue;
    }
    const l = byMesh.get(p.info);
    if (l) l.push({ patch: p, rect });
    else byMesh.set(p.info, [{ patch: p, rect }]);
  }
  for (const [info, list] of byMesh) {
    const geo = own(info.mesh);
    geo.setAttribute('uv1', buildUv1(info, list, manifest.atlas.w, manifest.atlas.h));
    for (const m of standardMaterials(info.mesh)) aoMats.add(m);
    patchCount += list.length;
  }
  missing += Math.max(0, manifest.patches.length - patchCount);

  // Per-vertex.
  for (const info of meshes) {
    if (!info.receiver) continue;
    const e = entries.get(info.fp)?.shift();
    if (!e) continue;
    const geo = own(info.mesh);
    geo.setAttribute('bakedOcc', new THREE.BufferAttribute(bin.slice(e.offset, e.offset + e.count), 1, true));
    for (const m of standardMaterials(info.mesh)) occMats.add(m);
    meshCount++;
  }
  // Data in the bake that found no match in this scene.
  for (const l of entries.values()) missing += l.length;
  if (missing > 0) stale(`${missing} item(s) no longer match`);

  if (patchCount === 0 && meshCount === 0) {
    atlas.dispose();
    return { patches: 0, meshes: 0, stale: missing };
  }

  // A material that now expects uv1 or bakedOcc needs them on every mesh that
  // uses it (a missing attribute reads whatever the GPU last had there).
  const zeroUv = new Map<number, THREE.BufferAttribute>();
  const zeroOcc = new Map<number, THREE.BufferAttribute>();
  for (const info of meshes) {
    const mats = standardMaterials(info.mesh);
    const geo = info.mesh.geometry as THREE.BufferGeometry;
    const n = geo.attributes.position.count;
    if (mats.some((m) => aoMats.has(m)) && !geo.attributes.uv1) {
      let a = zeroUv.get(n);
      if (!a) zeroUv.set(n, (a = new THREE.BufferAttribute(new Float32Array(n * 2), 2)));
      geo.setAttribute('uv1', a);
    }
    if (mats.some((m) => occMats.has(m)) && !geo.attributes.bakedOcc) {
      let a = zeroOcc.get(n);
      if (!a) zeroOcc.set(n, (a = new THREE.BufferAttribute(new Uint8Array(n), 1, true)));
      geo.setAttribute('bakedOcc', a);
    }
  }
  const intensity = options.intensity ?? 1;
  for (const m of aoMats) {
    m.aoMap = atlas;
    m.aoMapIntensity = intensity;
    m.needsUpdate = true;
  }
  for (const m of occMats) injectVertexOcclusion(m);

  // The hand-placed decals stand in for what the bake now provides.
  if (options.hideFakeShadows !== false && patchCount > 0) {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.MeshBasicMaterial | undefined;
      if (mesh.isMesh && m && m.isMeshBasicMaterial && m.transparent && m.alphaMap && !m.depthWrite && mesh.renderOrder === 1 && isVisibleInTree(mesh)) mesh.visible = false;
    });
  }
  return { patches: patchCount, meshes: meshCount, stale: missing };
}
