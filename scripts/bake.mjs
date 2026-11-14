// Bakes the listening room's ambient occlusion on this machine's GPU, in the
// background, and writes src/assets/bake/. One command, no visible window:
//
//   npm run bake                      (default 512 rays per sample)
//   npm run bake -- --spp 1024
//   npm run bake -- --density 160 --dist 1.0 --strength 1.4 --min 0.3
//   npm run bake -- --allow-software --spp 8     (testing without a real GPU)
//
// It starts its own Astro dev server on port 4329 (the normal one on 4321 is
// left alone), opens /bake in headless Chrome or Edge with a throwaway
// profile, follows the progress, and stops both when done, on failure, on
// timeout and on Ctrl+C. Exit code 0 only if the files were written.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dev } from 'astro';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4329;

// ---- Arguments.
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const spp = Number(opt('spp', 512));
const timeoutMin = Number(opt('timeout', 45));
const allowSoftware = flag('allow-software');
const passthrough = ['density', 'dist', 'strength', 'min'].filter((k) => args.includes(`--${k}`)).map((k) => `${k}=${encodeURIComponent(opt(k))}`);

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|basic render driver/i;

const chromePath = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome or Edge found. Set the CHROME environment variable to its path.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let chrome;
let profile;
let cleaned = false;

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  killTree(chrome);
  if (server) await server.stop().catch(() => {});
  if (profile) {
    // Chrome may take a moment to release its files.
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(300);
      }
    }
  }
}

async function fail(message, code = 1) {
  console.error(message);
  await cleanup();
  process.exit(code);
}

process.on('SIGINT', () => fail('\nInterrupted.', 130));
process.on('SIGTERM', () => fail('\nTerminated.', 143));

// ---- Server.
console.log('Starting a dev server on port ' + PORT + ' ...');
try {
  server = await dev({
    root,
    logLevel: 'warn',
    server: { port: PORT, host: '127.0.0.1' },
    // Not the cache of the normal dev server: two Vite servers must not share one.
    vite: { cacheDir: join(root, 'node_modules', '.vite-bake') },
  });
} catch (e) {
  await fail('Could not start the dev server: ' + (e?.stack ?? e));
}
const base = `http://127.0.0.1:${server.address.port}`;

const state = async () => {
  try {
    return await (await fetch(base + '/__bake/state')).json();
  } catch {
    return null;
  }
};

// ---- Browser.
profile = mkdtempSync(join(tmpdir(), 'bake-'));
const gpuFlags = allowSoftware
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'];
const url = `${base}/bake?auto=1&spp=${spp}${passthrough.length ? '&' + passthrough.join('&') : ''}`;
chrome = spawn(
  chromePath,
  [
    '--headless=new',
    ...gpuFlags,
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1280,720',
    url,
  ],
  { stdio: 'ignore' },
);
chrome.on('exit', (code) => {
  if (!cleaned) fail(`The browser exited early (code ${code}).`);
});
console.log(`Baking with ${spp} rays per sample. Browser: ${chromePath}`);

// ---- Follow along.
const deadline = Date.now() + timeoutMin * 60_000;
let gpuShown = false;
let lastLine = '';
let lastShown = -1;
while (true) {
  if (Date.now() > deadline) await fail(`Timed out after ${timeoutMin} minutes.`);
  await sleep(1000);
  const s = await state();
  if (!s) continue;
  if (s.gpu && !gpuShown) {
    gpuShown = true;
    console.log('GPU: ' + s.gpu);
    if (SOFTWARE.test(s.gpu) && !allowSoftware) {
      await fail(
        `Refusing to bake on a software renderer (${s.gpu}). Headless Chrome did not get the GPU.\n` +
          'Check your graphics driver, or pass --allow-software to bake slowly anyway (use a low --spp).',
      );
    }
  }
  if (s.error) await fail('The bake failed in the browser:\n' + s.error);
  if (s.done) break;
  const pct = Math.floor((s.fraction ?? 0) * 100 / 5) * 5;
  const line = `${s.label}`;
  if (line !== lastLine || pct !== lastShown) {
    lastLine = line;
    lastShown = pct;
    console.log(`  ${s.label} ${Math.round((s.fraction ?? 0) * 100)}%`);
  }
}

const final = await state();
await cleanup();
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`Done. Wrote src/assets/bake/: atlas ${kb(final.written.atlas)}, vertices ${kb(final.written.vertex)}, manifest ${kb(final.written.manifest)}.`);
console.log('Commit them with:  git add src/assets/bake');
process.exit(0);
