# Renders one mood of the listening room's plate from the master scene, plus the light
# probe / shadow catcher / sun visibility the live overlay consumes.
#
#   blender -b bake-assets/master/room.blend --factory-startup --python scripts/blender/render_master.py -- <args>
#
# The master .blend is the room: geometry, materials, the plate camera and the overlay gear,
# fully dressed (frozen once from the old code-built scene, 2026-11-16). Day and night differ only by a
# small table stored in the file (scene['plate_moods']): material values and images, object
# visibility, and the sun / sky inputs. Normally driven by `npm run bake:plates`.
#
#   --mood day|night --width <px> --height <px> --scale <x>
#   --out-png <file>    16-bit PNG master (AgX applied)
#   --out-exr <file>    float EXR (linear, scene referred)
#   --out-dir <dir>     where probe-<mood>.png/json and shadow-<mood>.png go
#   --result <file>     json handed back to bake-plates.mjs (light, camera, gear)
#   --samples <n> --bounces <n> --denoise 0|1 --ev <stops> --look <AgX look>
#   --sky <x> --sunsize <deg> --skyboost <x> --turbidity <x> --gain <x> --dof --fstop <n> --no-probe
#   --crop x0,y0,x1,y1 --crop-out <jpg>   debug: render only that region and stop
#   --cam-eye x,y,z --cam-tgt x,y,z       debug: override the camera (three coordinates)
#   --cam-list "ex,ey,ez>tx,ty,tz|..."    debug: extra full-frame cameras (with --crop)
#   --allow-gear-move                     skip the overlay gear position check
import bpy
import json
import math
import struct
import sys
import time
import zlib

import numpy as np
import os
from mathutils import Matrix, Vector

T0 = time.time()


def log(*a):
    print('[plate]', *a, flush=True)


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {
        'samples': 128, 'bounces': 12, 'scale': 1.0, 'denoise': 1, 'ev': 0.0, 'look': 'None',
        'sky': 1.0, 'sunsize': None, 'dof': False, 'fstop': 4.0, 'probe': True,
        'width': 1920, 'height': 1080, 'skyboost': None, 'turbidity': None, 'gain': None,
    }
    flags = {'dof': ('dof', True), 'no-probe': ('probe', False), 'allow-gear-move': ('allow_gear_move', True)}
    i = 0
    while i < len(argv):
        k = argv[i][2:]
        if k in flags:
            o[flags[k][0]] = flags[k][1]
        else:
            v = argv[i + 1]
            i += 1
            if k in ('samples', 'bounces', 'width', 'height', 'denoise'):
                v = int(float(v))
            elif k in ('scale', 'ev', 'gain', 'sky', 'sunsize', 'fstop', 'skyboost', 'turbidity'):
                v = float(v)
            o[k.replace('-', '_')] = v
        i += 1
    return o


A = parse()
EXR_DIR = os.path.dirname(A['out_exr'])
MOOD = A['mood']
NIGHT = MOOD == 'night'
# By day a sun disc a little wider than the real 0.53 deg (the sun with its aureole, filtered by the
# window) gives the patch on the rug a softer edge; the moon stays its true size.
if A['sunsize'] is None:
    A['sunsize'] = 0.53 if NIGHT else 1.1
GAIN = A['gain'] if A['gain'] is not None else (20.0 if not NIGHT else 1.0)
sc = bpy.context.scene
MOODS = json.loads(sc['plate_moods'])
MD = MOODS['moods'][MOOD]
log(f'master {bpy.data.filepath}: {len(bpy.data.objects)} objects, mood {MOOD}')


# three (x, y, z; y up) -> Blender (x, -z, y; z up), which is also what the glTF importer does
def t2b(v):
    return Vector((v[0], -v[2], v[1]))


def b2t(v):
    return (v[0], v[2], -v[1])


def subtree_objs(root):
    return [root] + list(root.children_recursive)


def is_dynamic(o):
    p = o
    while p is not None:
        if p.get('bakeDynamic') or (getattr(p, 'data', None) is not None and hasattr(p.data, 'get') and p.data.get('bakeDynamic')):
            return True
        p = p.parent
    return False


# ------------------------------------------------------------------ mood
n_set = 0
for e in MD['inputs']:
    m = bpy.data.materials.get(e['mat'])
    nd = m.node_tree.nodes.get(e['node']) if m and m.node_tree else None
    if nd is None:
        log(f'WARNING: mood input {e["mat"]}/{e["node"]} not found')
        continue
    sock = nd.inputs[e['input']]
    v = e['value']
    sock.default_value = v if not isinstance(v, list) else v[: len(sock.default_value)]
    n_set += 1
for e in MD['images']:
    m = bpy.data.materials.get(e['mat'])
    nd = m.node_tree.nodes.get(e['node']) if m and m.node_tree else None
    img = bpy.data.images.get(e['image'])
    if nd is None or img is None:
        log(f'WARNING: mood image {e["mat"]}/{e["node"]} -> {e["image"]} not found')
        continue
    nd.image = img
    n_set += 1
for e in MD['objects']:
    o = bpy.data.objects.get(e['obj'])
    if o is None:
        log(f'WARNING: mood object {e["obj"]} not found')
        continue
    o.hide_render = e['hide_render']
    n_set += 1
log(f'mood {MOOD}: {n_set} values set')

dyn_objs = [o for o in bpy.data.objects if is_dynamic(o)]
log(f'{len(dyn_objs)} dynamic objects (hidden from the plate)')

# ------------------------------------------------------------------ overlay gear check
# The live overlay draws the turntable's disc and arm and the gear's hover shells at the
# positions in the code; the plate must show the gear exactly there.


def world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    return lo, hi


moved = []
for key, ref in MOODS['gearBounds'].items():
    objs = [o for o in bpy.data.objects if o.get('gear') == key]
    lo, hi = world_bbox(objs)
    err = max(max(abs(a - b) for a, b in zip(lo, ref['min'])), max(abs(a - b) for a, b in zip(hi, ref['max'])))
    if err > 0.001:
        moved.append(f'{key} ({err * 1000:.1f} mm, {len(objs)} objects)')
if moved:
    msg = 'overlay gear moved in the master: ' + ', '.join(moved)
    if not A.get('allow_gear_move'):
        raise SystemExit(f'[plate] ERROR: {msg}. Put it back, or pass --allow-gear-move if the code moved it too.')
    log('WARNING: ' + msg)
else:
    log(f'overlay gear in place ({len(MOODS["gearBounds"])} groups)')

# The camera stands outside the room's front wall (the realtime renderer culls its back face;
# Cycles does not). Anything lying wholly in the front wall's plane is invisible to the camera.
FRONT_Y = -1.7
cut_objs = []
for o in bpy.data.objects:
    if o.type != 'MESH' or is_dynamic(o):
        continue
    if max((o.matrix_world @ Vector(c)).y for c in o.bound_box) < FRONT_Y:
        o.visible_camera = False
        cut_objs.append(o)
log(f'{len(cut_objs)} front-wall objects hidden from the camera')

# ------------------------------------------------------------------ camera
cam_ob = bpy.data.objects['plate-cam']
cam = cam_ob.data
sc.camera = cam_ob
if 'cam_eye' in A:
    eye = t2b([float(c) for c in A['cam_eye'].split(',')])
    tgt = t2b([float(c) for c in A['cam_tgt'].split(',')])
    cam_ob.location = eye
    cam_ob.rotation_euler = (tgt - eye).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
cam_fov = math.degrees(cam.angle_y if cam.sensor_fit == 'VERTICAL' else cam.angle)
cam_eye_t = b2t(cam_ob.matrix_world.translation)
fwd = cam_ob.matrix_world.to_quaternion() @ Vector((0, 0, -1))
aim = MOODS.get('camera', {}).get('targetDistance', 3.77)
cam_tgt_t = b2t(cam_ob.matrix_world.translation + fwd * aim)
if A['dof']:
    cam.dof.use_dof = True
    cam.dof.focus_distance = (cam_ob.matrix_world.translation - t2b((0.06, 0.95, -1.5))).length
    cam.dof.aperture_fstop = A['fstop']
    cam.lens = 35
    cam.sensor_height = 2 * 35 * math.tan(math.radians(cam_fov) / 2)
    cam.sensor_width = cam.sensor_height * 16 / 9
else:
    cam.dof.use_dof = False

sun = MD['sun']

# a fresh sun and world per render (the master holds none)
for o in [o for o in bpy.data.objects if o.type == 'LIGHT' and o.data.type == 'SUN']:
    bpy.data.objects.remove(o)

# ------------------------------------------------------------------ lights / world
sun_dir = t2b(sun['toLight']).normalized()
irr = [c * A['sky'] * GAIN for c in sun['irradiance']]
SUN_REF = 125.0  # irradiance (Blender units) of the Nishita sun disc at sun_intensity 1, measured
SKY_BOOST = A['skyboost'] if A['skyboost'] is not None else (3.0 if not NIGHT else 1.0)

ld = bpy.data.lights.new('sun', 'SUN')
ld.angle = math.radians(A['sunsize'])
mx = max(irr) if max(irr) > 0 else 1.0
ld.color = [c / mx for c in irr]
ld.energy = mx
ld.use_shadow = True
sun_ob = bpy.data.objects.new('sun', ld)
sc.collection.objects.link(sun_ob)
sun_ob.rotation_euler = sun_dir.to_track_quat('Z', 'Y').to_euler()

world = bpy.data.worlds.new('world')
world.use_nodes = True
sc.world = world
wn = world.node_tree.nodes
wl = world.node_tree.links
for n in list(wn):
    if n.type != 'OUTPUT_WORLD':
        wn.remove(n)
bg = wn.new('ShaderNodeBackground')
wl.new(bg.outputs[0], wn['World Output'].inputs['Surface'])
sky = wn.new('ShaderNodeTexSky')
sky.sky_type = 'MULTIPLE_SCATTERING'
sky.sun_disc = False
if A['turbidity'] is not None:
    sky.aerosol_density = max(0.0, (A['turbidity'] - 1.7) / 10.0)
if NIGHT:
    # blue hour: the sun just below the horizon along the same bearing as the window
    sky_dir = Vector((sun_dir.x, sun_dir.y, 0)).normalized()
    sky.sun_elevation = math.radians(-7.0)
    sky.sun_rotation = math.atan2(sky_dir.x, sky_dir.y)
    bg.inputs['Strength'].default_value = 0.05 * A['sky'] * GAIN
else:
    sky.sun_elevation = math.asin(max(-1.0, min(1.0, sun_dir.z)))
    sky.sun_rotation = math.atan2(sun_dir.x, sun_dir.y)
    bg.inputs['Strength'].default_value = (mx / SUN_REF) * SKY_BOOST  # mx already includes GAIN
wl.new(sky.outputs[0], bg.inputs['Color'])
if 'debug_world' in A:
    bg.inputs['Strength'].default_value = float(A['debug_world'])
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    for l in list(wl):
        if l.to_node == bg:
            wl.remove(l)
log(f'sun toLight(blender)={tuple(round(c, 3) for c in sun_dir)} irradiance={tuple(round(c, 3) for c in irr)} world strength={bg.inputs["Strength"].default_value:.4f}')

# ------------------------------------------------------------------ render settings
cy = sc.cycles
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
gpu_ok = False
for kind in ('HIP', 'OPTIX', 'CUDA', 'METAL', 'ONEAPI'):
    try:
        prefs.compute_device_type = kind
        if kind == 'HIP' and hasattr(prefs, 'use_hiprt'):
            prefs.use_hiprt = True  # hardware ray tracing on RDNA2+/3
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type != 'CPU']
        if devs:
            for d in prefs.devices:
                d.use = d.type != 'CPU'
            gpu_ok = True
            log(f'compute device {kind}: {[d.name for d in devs]}')
            break
    except Exception:
        continue
cy.device = 'GPU' if gpu_ok else 'CPU'
if not gpu_ok:
    log('WARNING: no GPU found, rendering on the CPU')

hi_q = A['samples'] >= 1024
cy.samples = A['samples']
cy.use_adaptive_sampling = True
cy.adaptive_threshold = (0.001 if A['samples'] >= 4096 else 0.002) if hi_q else 0.01
cy.adaptive_min_samples = 64
cy.use_denoising = bool(A['denoise'])
for k, v in (('denoiser', 'OPENIMAGEDENOISE'), ('denoising_input_passes', 'RGB_ALBEDO_NORMAL'), ('denoising_prefilter', 'ACCURATE'), ('denoising_use_gpu', True)):
    try:
        setattr(cy, k, v)
    except Exception as e:
        log(f'(cycles.{k} not set: {e})')
cy.max_bounces = A['bounces']
cy.diffuse_bounces = A['bounces']
cy.glossy_bounces = max(4, A['bounces'] // 2)
cy.transmission_bounces = max(8, A['bounces'])
cy.transparent_max_bounces = max(16, A['bounces'])
cy.volume_bounces = 2
cy.sample_clamp_direct = 0
cy.sample_clamp_indirect = 8.0
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 0.2
try:
    cy.use_light_tree = True
except Exception:
    pass
# 16 GB of VRAM holds a whole 4K frame: one tile avoids per-tile overhead.
cy.use_auto_tile = True
cy.tile_size = 8192
sc.render.use_persistent_data = True
sc.render.filter_size = 1.5
sc.render.film_transparent = False

sc.view_settings.view_transform = 'AgX'
looks = [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items]
look = A['look']
if look not in looks:
    cand = [l for l in looks if l.endswith(look) or l.split(' - ')[-1] == look]
    look = cand[0] if cand else 'None'
sc.view_settings.look = look
sc.view_settings.exposure = A['ev']
sc.view_settings.gamma = 1.0
sc.display_settings.display_device = 'sRGB'
sc.sequencer_colorspace_settings.name = 'sRGB'
log(f'AgX look "{look}" ev {A["ev"]} (looks: {looks})')

W, H = A['width'], A['height']
RW, RH = int(round(W * A['scale'])), int(round(H * A['scale']))
sc.render.resolution_x = RW
sc.render.resolution_y = RH
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'
sc.render.image_settings.color_mode = 'RGB'
try:
    sc.render.image_settings.exr_codec = 'ZIP'
except Exception:
    pass



_last_stat = [0.0]


def _stats_handler(*args):
    now = time.time()
    if now - _last_stat[0] < 10:
        return
    text = next((a for a in args if isinstance(a, str)), '')
    if 'Sample' not in text:
        return
    _last_stat[0] = now
    print(f'[plate]   {text}', flush=True)


bpy.app.handlers.render_stats.append(_stats_handler)


def load_exr(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Linear Rec.709'
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[..., :3].copy()  # row 0 = bottom


def render_to(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return load_exr(path)


# ------------------------------------------------------------------ the plate
set_visible = lambda vis: [setattr(o, 'hide_render', not vis) or setattr(o, 'hide_viewport', not vis) for o in dyn_objs]
set_visible(False)
if 'crop' in A:
    x0, y0, x1, y1 = [float(c) for c in A['crop'].split(',')]
    sc.render.use_border = True
    sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = x0 / W, x1 / W
    sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / H, 1 - y0 / H
log(f'rendering plate {RW}x{RH}, {A["samples"]} samples')
tr = time.time()
plate = render_to(A['out_exr'])
log(f'plate rendered in {time.time() - tr:.0f}s')
if 'crop' in A:
    ch, cw = plate.shape[:2]
    pimg = bpy.data.images.new('crop', cw, ch, alpha=False, float_buffer=True)
    pimg.colorspace_settings.name = 'Linear Rec.709'
    rgba = np.ones((ch, cw, 4), dtype=np.float32)
    rgba[..., :3] = plate
    pimg.pixels.foreach_set(rgba.ravel())
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 93
    sc.render.image_settings.color_mode = 'RGB'
    pimg.save_render(A['crop_out'], scene=sc)
    log(f'crop {cw}x{ch} saved {A["crop_out"]}; total {time.time() - T0:.0f}s')

    def save_jpg(arr, path):
        h_, w_ = arr.shape[:2]
        im_ = bpy.data.images.new('dbg', w_, h_, alpha=False, float_buffer=True)
        im_.colorspace_settings.name = 'Linear Rec.709'
        rg = np.ones((h_, w_, 4), dtype=np.float32)
        rg[..., :3] = arr
        im_.pixels.foreach_set(rg.ravel())
        sc.render.image_settings.file_format = 'JPEG'
        sc.render.image_settings.quality = 93
        im_.save_render(path, scene=sc)
        sc.render.image_settings.file_format = 'OPEN_EXR'
        sc.render.image_settings.color_depth = '32'
    # debug cameras (three coordinates): --cam-list "ex,ey,ez>tx,ty,tz|..." -> <crop-out>-camN.jpg, full frame
    if 'cam_list' in A:
        sc.render.use_border = False
        sc.render.use_crop_to_border = False
        sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
        sc.cycles.samples = 160
        sc.render.image_settings.file_format = 'OPEN_EXR'
        sc.render.image_settings.color_depth = '32'
        for ci, spec in enumerate(A['cam_list'].split('|')):
            e_, t_ = spec.split('>')
            e_ = t2b([float(c) for c in e_.split(',')])
            t_ = t2b([float(c) for c in t_.split(',')])
            cam_ob.location = e_
            cam_ob.rotation_euler = (t_ - e_).to_track_quat('-Z', 'Y').to_euler()
            bpy.context.view_layer.update()
            arr = render_to(EXR_DIR + f'/dbg-cam{ci}.exr')
            save_jpg(arr, A['crop_out'].replace('.jpg', f'-cam{ci}.jpg'))
            log(f'debug camera {ci} saved')
    sys.exit(0)

if A['scale'] > 1.0 + 1e-6:
    # box filter down to the output size (scale is an integer in practice; otherwise area resample)
    s = A['scale']
    if abs(s - round(s)) < 1e-6:
        k = int(round(s))
        plate = plate[: H * k, : W * k].reshape(H, k, W, k, 3).mean(axis=(1, 3))
    else:
        ys = (np.arange(H) * (RH / H)).astype(int)
        xs = (np.arange(W) * (RW / W)).astype(int)
        plate = plate[ys][:, xs]
        log('non-integer scale: nearest resample')

# AgX + sRGB through Blender's own colour management, 16-bit PNG
img = bpy.data.images.new('master', W, H, alpha=False, float_buffer=True)
img.colorspace_settings.name = 'Linear Rec.709'
rgba = np.ones((H, W, 4), dtype=np.float32)
rgba[..., :3] = plate
img.pixels.foreach_set(rgba.ravel())
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '16'
sc.render.image_settings.color_mode = 'RGB'
img.save_render(A['out_png'], scene=sc)
log(f'master {A["out_png"]}')
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'

# ------------------------------------------------------------------ probe, shadow, sun visibility
lum = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def write_png(path, rgb8):
    h, w, c = rgb8.shape
    raw = b''.join(b'\x00' + rgb8[y].tobytes() for y in range(h))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ct = {1: 0, 3: 2, 4: 6}[c]
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ct, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


LOG_RANGE = 20


def encode_probe_png(rgb, peak_max):
    """rgb: (h, w, 3) linear, row 0 = bottom (nadir). Mirrors encodeProbePng in plate-probe-codec.ts."""
    h, w, _ = rgb.shape
    rgb = np.maximum(rgb, 0)
    mx = rgb.max(axis=2)
    floor = peak_max * 2.0 ** -LOG_RANGE
    with np.errstate(divide='ignore', invalid='ignore'):
        m16 = np.where(mx > floor, np.rint(65535 * np.clip((np.log2(np.maximum(mx, 1e-30) / peak_max) + LOG_RANGE) / LOG_RANGE, 0, 1)), 0)
    peak = peak_max * 2.0 ** (m16 / 65535 * LOG_RANGE - LOG_RANGE)
    inv = np.where(mx > floor, 1.0 / peak, 0.0)
    mant = np.minimum(255, np.rint(rgb * inv[..., None] * 255)).astype(np.uint8)
    out = np.zeros((h * 2, w, 3), dtype=np.uint8)
    out[:h] = mant[::-1]  # file row 0 = zenith
    m16i = m16.astype(np.int64)
    low = np.zeros((h, w, 3), dtype=np.uint8)
    low[..., 0] = m16i >> 8
    low[..., 1] = m16i & 255
    out[h:] = low[::-1]
    return out


def reduce_probe(src):
    """2x2 reduction; the brightest of four is dropped when it is a lone spike (the same reduction as the codec in plate-probe-codec.ts expects)."""
    H2, W2, _ = src.shape
    h, w = H2 // 2, W2 // 2
    blocks = src.reshape(h, 2, w, 2, 3).transpose(0, 2, 1, 3, 4).reshape(h, w, 4, 3)
    L = lum(blocks)
    order = np.argsort(L, axis=2)
    hi = order[..., 3]
    second = order[..., 2]
    Lhi = np.take_along_axis(L, hi[..., None], 2)[..., 0]
    Ls = np.take_along_axis(L, second[..., None], 2)[..., 0]
    spike = Lhi > 4 * Ls + 0.5
    for q in range(4):
        repl = spike & (hi == q)
        if repl.any():
            sec = np.take_along_axis(blocks, second[..., None, None].repeat(3, 3), 2)[..., 0, :]
            blocks[:, :, q, :] = np.where(repl[..., None], sec, blocks[:, :, q, :])
    return blocks.mean(axis=2)


def box_blur(a, r):
    def one(x, axis):
        pad = [(0, 0)] * x.ndim
        pad[axis] = (r, r)
        xp = np.pad(x, pad, mode='edge')
        c = np.cumsum(xp, axis=axis, dtype=np.float64)
        zero = np.zeros_like(np.take(c, [0], axis=axis))
        c = np.concatenate([zero, c], axis=axis)
        n = x.shape[axis]
        hi = np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, range(0, n), axis=axis)
        return (hi - lo) / (2 * r + 1)

    return one(one(a, 0), 1)


def darkness_map(without, with_parts):
    a = box_blur(np.minimum(np.nan_to_num(lum(without)), 16), 2)
    b = box_blur(np.minimum(np.nan_to_num(lum(with_parts)), 16), 2)
    ratio = (b + 1e-4) / (a + 1e-4)
    d = 1 - np.clip(ratio, 0, 1)
    d = np.maximum(0, (d - 0.02) / 0.98)
    return np.rint(np.minimum(d, 1) * 255).astype(np.uint8)


def world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    return lo, hi


def find_turntable():
    tops = [o for o in dyn_objs if o.parent is None or not is_dynamic(o.parent)]
    cands = []
    for o in tops:
        lo, hi = world_bbox(subtree_objs(o))
        if lo.x > hi.x:
            continue
        size = hi - lo  # blender z = three y
        c = (lo + hi) / 2
        if c.z > 1.0 or size.z > 0.2:
            continue
        cands.append((size.z / max(size.x, size.y, 1e-6), o))
    if not cands:
        return None
    cands.sort(key=lambda x: x[0])
    spin = cands[0][1]
    arm = cands[1][1] if len(cands) > 1 else None
    group = spin.parent if spin.parent is not None else spin
    return spin, arm, group


def sun_visibility(origin, to_sun, soft_deg, n=64):
    """Fraction of the (soft) sun disc that reaches `origin`, glass and the picture let it through."""
    if to_sun.z <= 0.02:
        return 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    ignore = set()
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        if o.name.startswith(('window-glass', 'outside-picture', 'outside-geo')):
            ignore.add(o.name)
            continue
        mats = [s.material for s in o.material_slots if s.material]
        if mats and all(m.use_nodes and any(nd.type == 'BSDF_PRINCIPLED' and nd.inputs['Transmission Weight'].default_value > 0 for nd in m.node_tree.nodes) for m in mats):
            ignore.add(o.name)
    a = to_sun.cross(Vector((0, 0, 1)) if abs(to_sun.z) < 0.9 else Vector((1, 0, 0))).normalized()
    b = to_sun.cross(a).normalized()
    rad = math.tan(math.radians(max(soft_deg, 0.2)))
    lit = 0
    for i in range(n):
        r = math.sqrt((i + 0.5) / n) * rad
        th = i * 2.399963229728653
        d = (to_sun + a * (math.cos(th) * r) + b * (math.sin(th) * r)).normalized()
        o0 = origin.copy()
        blocked = False
        for _ in range(8):
            hit, loc, nrm, idx, ob, mw = sc.ray_cast(dg, o0, d, distance=60.0)
            if not hit:
                break
            if ob.name in ignore or ob.name.split('.')[0] in ignore:
                o0 = loc + d * 1e-4
                continue
            blocked = True
            break
        if not blocked:
            lit += 1
    return lit / n


result = {
    'mood': MOOD, 'width': W, 'height': H, 'ev': A['ev'], 'look': look, 'engine': 'cycles ' + bpy.app.version_string,
    'light': {'toLight': list(sun['toLight']), 'irradiance': irr, 'source': 'blender-' + ('moon' if NIGHT else 'sun')},
}

if A['probe'] and 'out_dir' in A:
    tt = find_turntable()
    if tt is None:
        log('WARNING: turntable not found, skipping probe')
    else:
        spin, arm, group = tt
        centre_b = spin.matrix_world.translation.copy()
        seat = Vector(b2t(centre_b))  # three coordinates
        PROBE_LIFT = 0.035
        probe_pos_t = Vector((seat.x, seat.y + PROBE_LIFT, seat.z))
        probe_pos_b = t2b(probe_pos_t)
        log(f'turntable: spin={spin.name} arm={arm.name if arm else None} seat(three)={tuple(round(c, 3) for c in seat)}')

        # the probe sits inside the room: the front wall is a wall again
        for o in cut_objs:
            o.visible_camera = True

        # ---- probe (dynamic parts hidden): equirect at the platter, 1024x512 -> 512x256
        pano = bpy.data.cameras.new('probe-cam')
        pano.type = 'PANO'
        try:
            pano.panorama_type = 'EQUIRECTANGULAR'
        except Exception:
            pano.cycles.panorama_type = 'EQUIRECTANGULAR'
        pano.clip_start = 0.01
        pano_ob = bpy.data.objects.new('probe-cam', pano)
        sc.collection.objects.link(pano_ob)
        pano_ob.location = probe_pos_b
        pano_ob.rotation_mode = 'QUATERNION'
        pano_ob.rotation_quaternion = Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0))).to_quaternion()
        sc.camera = pano_ob
        PW, PH = 512, 256
        sc.render.resolution_x = PW * 2
        sc.render.resolution_y = PH * 2
        psamples = max(256, min(A['samples'], 1024))
        cy.samples = psamples
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.01
        cy.use_denoising = True
        tr = time.time()
        log(f'probe: {PW * 2}x{PH * 2}, {psamples} samples')
        raw = render_to(EXR_DIR + f'/{MOOD}-probe.exr')
        probe = reduce_probe(raw)
        probe = np.minimum(np.nan_to_num(probe), 4096.0)
        peak = float(probe.max())
        peak_max = max(1, math.ceil(peak))
        write_png(A['out_dir'] + f'/probe-{MOOD}.png', encode_probe_png(probe, peak_max))
        log(f'probe done in {time.time() - tr:.0f}s, peak {peak:.2f}')

        # ---- sun reaching the platter
        vis = sun_visibility(probe_pos_b, sun_dir, 0.5)
        sy = 0.2126 * irr[0] + 0.7152 * irr[1] + 0.0722 * irr[2]
        col = [c / sy if sy > 0 else 1.0 for c in irr]
        hexc = '#' + ''.join('%02x' % int(round(max(0, min(1, c)) * 255)) for c in col)
        sun_json = {'dir': list(sun['toLight']), 'color': hexc, 'intensity': sy, 'vis': vis}
        log(f'sun visibility at the platter: {vis:.2f}')

        # ---- shadow catcher: top-down ortho over the turntable, with and without the disc and arm
        lo, hi = world_bbox(subtree_objs(group))
        c_b = (lo + hi) / 2
        size = hi - lo
        half = max(size.x, size.y) / 2 + 0.015
        plane_y_t = seat.y - 0.0008
        ortho = bpy.data.cameras.new('shadow-cam')
        ortho.type = 'ORTHO'
        ortho.ortho_scale = half * 2
        ortho.clip_start = 0.01
        ortho.clip_end = 1.6
        o_ob = bpy.data.objects.new('shadow-cam', ortho)
        sc.collection.objects.link(o_ob)
        o_ob.location = Vector((c_b.x, c_b.y, plane_y_t + 0.8))
        o_ob.rotation_euler = (0, 0, 0)  # looks down -Z; image up = +Y_b = -z_three, right = +x
        sc.camera = o_ob
        SN = 512
        sc.render.resolution_x = SN
        sc.render.resolution_y = SN
        cy.samples = 768
        cy.use_adaptive_sampling = False
        cy.use_denoising = False  # keeps with / without noise identical where nothing changed
        try:
            cy.seed = 7
            cy.use_animated_seed = False
        except Exception:
            pass
        tr = time.time()
        log('shadow: empty pass')
        without = render_to(EXR_DIR + f'/{MOOD}-shadow0.exr')

        # disc and arm back in, as neutral grey
        grey = bpy.data.materials.new('grey')
        grey.use_nodes = True
        grey.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.6, 0.6, 1)
        grey.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
        for part in [spin, arm]:
            if part is None:
                continue
            for o in subtree_objs(part):
                o.hide_render = False
                o.hide_viewport = False
                if o.type == 'MESH':
                    o.data.materials.clear()
                    o.data.materials.append(grey)
                    for slot in o.material_slots:
                        slot.link = 'DATA'
                        slot.material = grey
        log('shadow: disc + arm pass')
        with_parts = render_to(EXR_DIR + f'/{MOOD}-shadow1.exr')
        dark = darkness_map(without, with_parts)  # row 0 = bottom
        dark = dark[::-1]
        write_png(A['out_dir'] + f'/shadow-{MOOD}.png', np.repeat(dark[..., None], 3, axis=2))
        log(f'shadow done in {time.time() - tr:.0f}s')

        # three-space bounds: image top = z0, left = x0
        cx, cz = c_b.x, -c_b.y
        probe_json = {
            'version': 1, 'mood': MOOD, 'file': f'probe-{MOOD}.png', 'encoding': 'logpeak-rgb-png', 'width': PW, 'height': PH,
            'max': peak_max, 'position': [probe_pos_t.x, probe_pos_t.y, probe_pos_t.z], 'exposure': 2.0 ** A['ev'],
            'wbGain': [1, 1, 1], 'sun': sun_json,
            'shadow': {'file': f'shadow-{MOOD}.png', 'bounds': {'x0': cx - half, 'x1': cx + half, 'z0': cz - half, 'z1': cz + half},
                       'y': plane_y_t, 'size': SN},
            'spp': psamples,
        }
        with open(A['out_dir'] + f'/probe-{MOOD}.json', 'w') as f:
            json.dump(probe_json, f, indent=1)
        result['sunVisibility'] = vis

# What plate-meta.json needs besides the light: the camera as rendered, the overlay's gear
# targets (fixed by the code; checked above) and the hour the day plate shows.
result['camera'] = {'eye': [round(c, 5) for c in cam_eye_t], 'target': [round(c, 5) for c in cam_tgt_t], 'fov': round(cam_fov, 4)}
result['gear'] = MOODS['gear']
result['dayHour'] = MOODS.get('dayHour')
json.dump(result, open(A['result'], 'w'), indent=1)
