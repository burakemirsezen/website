// Renders the listening room's still plates (day + night) from the master scene.
//
//   npm run bake:plates [-- <flags>]
//   npm run plates:encode           re-encode variants from the 16-bit masters
//
// The room is a Blender file, bake-assets/master/room.blend (git-ignored; or $ROOM_BLEND).
// Edits happen in that file; back it up first with `npm run room:backup`. For each mood:
//   1. Blender Cycles (GPU/HIP, OpenImageDenoise, AgX) opens the master, switches it to the
//      mood (scripts/blender/render_master.py), checks the overlay gear has not moved, and
//      renders a 16-bit PNG master into src/assets/bake/master/ (git-ignored);
//   2. the same session renders the live overlay's light probe (turntable parts hidden),
//      the shadow catcher and the sun visibility: probe-<mood>.png/.json, shadow-<mood>.png;
//   3. the masters are encoded (WebP + AVIF, 1280..3840) and plate-meta.json is written
//      (camera and gear from the master, bake settings), see lib/encode-plates.mjs.
//
// Flags:
//   --preset draft|final|ultra
//                         draft  1920x1080, 128 samples, 12 bounces: a quick look
//                         final  3840x2160, 2048 samples (adaptive), 16 bounces (default)
//                         ultra  3840x2160, 4096 samples, 16 bounces, tighter noise target
//   --mood day|night|both which moods (both); the other mood's files and meta are kept
//   --samples <n> --bounces <n> --scale <x> --denoise 0|1     override the preset
//   --width <px> --height <px>   output size (16:9; the camera is fixed)
//   --ev <stops>          exposure compensation in AgX (0), shared by both moods: the live
//                         overlay applies the same number via toneMappingExposure
//   --look <name>         AgX look (None); e.g. "Punchy"
//   --sky <x>             multiplier on the sun and sky (1)
//   --gain <x>            per-mood light gain, i.e. the exposure choice (day 20, night 1)
//   --skyboost <x>        sky vs sun (day 3)      --turbidity <t>   sky haze
//   --sunsize <deg>       sun disc diameter for soft shadows (day 1.1, night 0.53)
//   --dof / --fstop <n>   depth of field focused on the turntable (off; f/4)
//   --no-probe            skip the probe / shadow / sun passes
//   --allow-gear-move     render even if the overlay gear moved in the master
//   --blend <file>        another master (default bake-assets/master/room.blend or $ROOM_BLEND)
//   --blender <path>      blender.exe (default the 5.3 install, or $BLENDER)
//   --timeout <min>       limit per mood (240; ultra 1440)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PRESETS = {
  draft: { size: [1920, 1080], samples: 128, bounces: 12, scale: 1 },
  final: { size: [3840, 2160], samples: 2048, bounces: 16, scale: 1 },
  // Native 4K with a tighter noise target: supersampling 2x cost ~4x for no visible gain after OIDN.
  ultra: { size: [3840, 2160], samples: 4096, bounces: 16, scale: 1 },
};
const VALUE_FLAGS = ['samples', 'bounces', 'scale', 'denoise', 'width', 'height', 'ev', 'look', 'sky', 'gain', 'skyboost', 'turbidity', 'sunsize', 'fstop'];

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    'Usage: npm run bake:plates [-- --preset draft|final|ultra --mood day|night|both --samples <n> --bounces <n> --scale <x>\n' +
      '  --denoise 0|1 --width <px> --height <px> --ev <stops> --look <name> --sky <x> --gain <x> --skyboost <x> --turbidity <t>\n' +
      '  --sunsize <deg> --dof --fstop <n> --no-probe --allow-gear-move --blend <file> --blender <path> --timeout <min>]',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const o = { preset: 'final', mood: 'both', probe: true, dof: false, allowGearMove: false, q: {} };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) usage(`Missing value for ${flag}`);
      return argv[++i];
    };
    const name = flag.replace(/^--/, '');
    if (flag === '--no-probe') o.probe = false;
    else if (flag === '--dof') o.dof = true;
    else if (flag === '--allow-gear-move') o.allowGearMove = true;
    else if (flag === '--preset') {
      o.preset = value();
      if (!PRESETS[o.preset]) usage(`Unknown preset: ${o.preset}`);
    } else if (flag === '--mood') {
      o.mood = value();
      if (!['day', 'night', 'both'].includes(o.mood)) usage(`Invalid --mood: ${o.mood}`);
    } else if (flag === '--blend') o.blend = value();
    else if (flag === '--blender') o.blender = value();
    else if (flag === '--timeout') o.timeout = Number(value());
    else if (VALUE_FLAGS.includes(name)) o.q[name] = value();
    else if (flag === '--help' || flag === '-h') usage();
    else usage(`Unknown flag: ${flag}`);
  }
  const p = PRESETS[o.preset];
  o.width = Math.round(Number(o.q.width ?? p.size[0]));
  o.height = Math.round(Number(o.q.height ?? p.size[1]));
  o.samples = Number(o.q.samples ?? p.samples);
  o.bounces = Number(o.q.bounces ?? p.bounces);
  o.scale = Number(o.q.scale ?? p.scale);
  o.ev = Number(o.q.ev ?? 0);
  o.timeout ??= o.preset === 'ultra' ? 1440 : 240;
  for (const [k, v] of Object.entries({ width: o.width, height: o.height, samples: o.samples, bounces: o.bounces, scale: o.scale, timeout: o.timeout })) {
    if (!Number.isFinite(v) || v <= 0) usage(`Invalid ${k}: ${v}`);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const moods = opts.mood === 'both' ? ['day', 'night'] : [opts.mood];
const blend = resolve(opts.blend ?? process.env.ROOM_BLEND ?? join(root, 'bake-assets', 'master', 'room.blend'));
const blenderExe = [opts.blender, process.env.BLENDER, 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe'].filter(Boolean).find((p) => existsSync(p));
if (!existsSync(blend)) {
  console.error(`No master scene at ${blend}. Restore it from the backup (npm run room:backup -- --list) or pass --blend.`);
  process.exit(1);
}
if (!blenderExe) {
  console.error('Blender not found. Pass --blender <path> or set BLENDER.');
  process.exit(1);
}

const work = join(root, 'bake-assets', 'render');
const outDir = join(root, 'src', 'assets', 'bake');
mkdirSync(work, { recursive: true });
mkdirSync(join(outDir, 'master'), { recursive: true });
const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 60000).toFixed(1)}m]`;

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch {}
}

let running;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    killTree(running);
    process.exit(130);
  });
}

function runBlender(mood) {
  const py = join(root, 'scripts', 'blender', 'render_master.py');
  const args = ['-b', blend, '--factory-startup', '--python', py, '--',
    '--mood', mood,
    '--width', String(opts.width), '--height', String(opts.height),
    '--out-png', join(outDir, 'master', `plate-${mood}.png`),
    '--out-exr', join(work, `${mood}.exr`),
    '--out-dir', outDir,
    '--result', join(work, `${mood}.result.json`),
    '--samples', String(opts.samples), '--bounces', String(opts.bounces), '--scale', String(opts.scale),
  ];
  for (const k of ['denoise', 'ev', 'look', 'sky', 'gain', 'skyboost', 'turbidity', 'sunsize', 'fstop']) {
    if (opts.q[k] !== undefined) args.push(`--${k}`, String(opts.q[k]));
  }
  if (opts.dof) args.push('--dof');
  if (!opts.probe) args.push('--no-probe');
  if (opts.allowGearMove) args.push('--allow-gear-move');
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(blenderExe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    running = proc;
    const killer = setTimeout(() => {
      killTree(proc);
      rejectP(new Error(`Blender timed out after ${opts.timeout} min`));
    }, opts.timeout * 60_000);
    let lastSample = 0;
    let buf = '';
    let pyFailed = false;
    const onData = (d) => {
      buf += String(d);
      let nl;
      while ((nl = buf.search(/[\r\n]/)) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        if (line.startsWith('[plate]')) {
          console.log(`${stamp()} ${line.slice(8)}`);
          if (/ERROR/.test(line)) pyFailed = true;
        } else if (/Traceback|Error:|error:/.test(line) && !/CUEW|Error opening the library/.test(line)) {
          if (/Traceback/.test(line)) pyFailed = true;
          console.error(line);
        } else if (pyFailed && /^\s|^\w*Error/.test(line)) console.error(line);
        else if (/Sample \d+\/\d+/.test(line) && Date.now() - lastSample > 15000) {
          lastSample = Date.now();
          console.log(`${stamp()}   ${line.match(/Sample \d+\/\d+/)[0]}`);
        }
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => {
      clearTimeout(killer);
      running = undefined;
      code === 0 && !pyFailed ? resolveP() : rejectP(new Error(`Blender failed for ${mood} (exit ${code})`));
    });
  });
}

console.log(`Rendering ${opts.width}x${opts.height} room plates (${moods.join(' + ')}, ${opts.preset} preset) from ${blend}: ${opts.samples} samples, ${opts.bounces} bounces, scale ${opts.scale}x`);
const results = {};
try {
  for (const mood of moods) {
    console.log(`${stamp()} ${mood}: Blender render...`);
    await runBlender(mood);
    results[mood] = JSON.parse(readFileSync(join(work, `${mood}.result.json`), 'utf8'));
  }
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}

// ---- encode variants + plate-meta.json
const first = results[moods[0]];
const meta = {
  bake: {
    method: 'blender',
    engine: first.engine,
    samples: opts.samples,
    tonemap: 'agx',
    look: first.look,
    ev: first.ev,
    exposure: Math.pow(2, first.ev),
    wb: { day: 6500, night: 6500 },
    wbGain: Object.fromEntries(moods.map((m) => [m, [1, 1, 1]])),
    bloom: 0,
    halation: 0,
    vignette: 0,
    grain: 0,
    scale: opts.scale,
    dof: opts.dof,
    light: Object.fromEntries(moods.map((m) => [m, results[m].light])),
  },
  width: first.width,
  height: first.height,
  eye: first.camera.eye,
  target: first.camera.target,
  fov: first.camera.fov,
  dayHour: first.dayHour,
  gear: first.gear,
};
// One mood only: keep the other mood's light from the existing meta.
if (moods.length === 1) {
  try {
    const old = JSON.parse(readFileSync(join(outDir, 'plate-meta.json'), 'utf8'));
    meta.bake.light = { ...(old.bake?.light ?? {}), ...meta.bake.light };
    meta.bake.wbGain = { ...(old.bake?.wbGain ?? {}), ...meta.bake.wbGain };
  } catch {}
}
const { encodePlates } = await import('./lib/encode-plates.mjs');
const inputs = Object.fromEntries(moods.map((m) => [m, readFileSync(join(outDir, 'master', `plate-${m}.png`))]));
const state = { label: '' };
let lastLabel = '';
const pump = setInterval(() => {
  if (state.label && state.label !== lastLabel) {
    lastLabel = state.label;
    console.log(`${stamp()} ${state.label}`);
  }
}, 2000);
await encodePlates(outDir.split('\\').join('/') + '/', inputs, meta, state, moods);
clearInterval(pump);

console.log('\nPlate bake complete:');
const files = moods.flatMap((m) => [`master/plate-${m}.png`, `plate-${m}.webp`, `plate-${m}.avif`, `probe-${m}.png`, `probe-${m}.json`, `shadow-${m}.png`]);
try {
  const mm = JSON.parse(readFileSync(join(outDir, 'plate-meta.json'), 'utf8'));
  for (const m of moods) for (const v of mm.variants?.[m] ?? []) files.push(v.avif, v.webp);
} catch {}
files.push('plate-meta.json');
for (const name of files) {
  const full = join(outDir, name);
  if (existsSync(full)) console.log(`  src/assets/bake/${name} (${(statSync(full).size / 1024).toFixed(1)} KB)`);
}
console.log(`Total ${((Date.now() - t0) / 60000).toFixed(1)} min`);
