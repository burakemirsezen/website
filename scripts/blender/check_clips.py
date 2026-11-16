# Finds objects in the master that pass through each other.
#
#   blender -b bake-assets/master/room.blend --python scripts/blender/check_clips.py -- [--baseline <json>] [--write-baseline]
#
# Every pair of visible meshes whose bounds overlap is tested triangle against triangle
# (BVH overlap). Many contacts are fine by construction (a book standing on a shelf shares a
# face with it, a frame rail is let into its frame), so the pairs found when the master was
# frozen and reviewed are the baseline; a run reports only pairs that are new, or that
# intersect much more than they did (more crossing triangles). Exits 1 when it finds any.
import bpy
import json
import sys
import time
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BASE = argv[argv.index('--baseline') + 1] if '--baseline' in argv else bpy.path.abspath('//clip-baseline.json')
WRITE = '--write-baseline' in argv
T0 = time.time()


def log(*a):
    print('[clips]', *a, flush=True)


SKIP_PREFIX = ('window-glass', 'outside-', 'plate-cam', 'probe-cam', 'shadow-cam')


def is_dynamic(o):
    p = o
    while p is not None:
        if p.get('bakeDynamic'):
            return True
        p = p.parent
    return False


dg = bpy.context.evaluated_depsgraph_get()
objs = []
for o in bpy.data.objects:
    if o.type != 'MESH' or o.hide_render or o.name.startswith(SKIP_PREFIX) or is_dynamic(o):
        continue
    if not (o.visible_camera or o.visible_diffuse or o.visible_shadow):
        continue
    objs.append(o)

boxes = {}
for o in objs:
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    boxes[o.name] = (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))


def overlap(a, b, pad=0.0):
    (la, ha), (lb, hb) = boxes[a], boxes[b]
    return all(la[i] - pad <= hb[i] and lb[i] - pad <= ha[i] for i in range(3))


# Sweep along x to find the candidate pairs.
names = sorted(boxes, key=lambda n: boxes[n][0].x)
pairs = []
for i, a in enumerate(names):
    for b in names[i + 1:]:
        if boxes[b][0].x > boxes[a][1].x:
            break
        if overlap(a, b):
            pairs.append((a, b))
log(f'{len(objs)} meshes, {len(pairs)} pairs with touching bounds')

trees = {}


def tree(name):
    if name not in trees:
        o = bpy.data.objects[name]
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        verts = [mw @ v.co for v in me.vertices]
        polys = [tuple(p.vertices) for p in me.polygons]
        trees[name] = BVHTree.FromPolygons(verts, polys, epsilon=0.0) if polys else None
        ev.to_mesh_clear()
    return trees[name]


found = {}
for a, b in pairs:
    ta, tb = tree(a), tree(b)
    if ta is None or tb is None:
        continue
    hits = ta.overlap(tb)
    if hits:
        found[f'{a} | {b}'] = len(hits)
log(f'{len(found)} intersecting pairs ({time.time() - T0:.0f}s)')

if WRITE:
    json.dump(found, open(BASE, 'w'), indent=1, sort_keys=True)
    log(f'baseline written: {BASE}')
    sys.exit(0)

try:
    base = json.load(open(BASE))
except FileNotFoundError:
    base = {}
    log(f'no baseline at {BASE}: every intersection is reported')
new = {k: v for k, v in found.items() if k not in base}
worse = {k: (base[k], v) for k, v in found.items() if k in base and v > max(base[k] * 1.5, base[k] + 20)}
def where(pair):
    # Centre of the two bounds' overlap, in the site's (three) coordinates: x right, y up, z toward the camera.
    a, b = pair.split(' | ')
    (la, ha), (lb, hb) = boxes[a], boxes[b]
    c = [(max(la[i], lb[i]) + min(ha[i], hb[i])) / 2 for i in range(3)]
    return f'at x {c[0]:.2f} y {c[2]:.2f} z {-c[1]:.2f}'


for k, v in sorted(new.items(), key=lambda kv: -kv[1]):
    log(f'NEW   {k}: {v} crossing triangles, {where(k)}')
for k, (b0, v) in worse.items():
    log(f'WORSE {k}: {b0} -> {v} crossing triangles')
if new or worse:
    log(f'{len(new)} new, {len(worse)} worse')
    sys.exit(1)
log('no new intersections')
