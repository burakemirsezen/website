// DEV ONLY: screenshots the room lab page with headless Chrome (software
// WebGL), for checking models while building them. Delete before shipping.
//
//   node scripts/lab-shot.mjs "model=guitar&yaw=30" out.png [width] [height]
//
// Needs the dev server on http://localhost:4321.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [query = 'model=guitar', out = 'lab.png', width = '1200', height = '800'] = process.argv.slice(2);
const chrome = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((p) => existsSync(p));
const profile = mkdtempSync(join(tmpdir(), 'lab-'));
try {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--virtual-time-budget=8000',
      `--screenshot=${resolve(out)}`,
      `http://localhost:4321/lab?${query}`,
    ],
    { stdio: 'ignore' },
  );
  console.log(`Wrote ${resolve(out)}`);
} finally {
  rmSync(profile, { recursive: true, force: true });
}
