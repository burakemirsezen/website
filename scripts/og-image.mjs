// Renders public/og.png, the 1200x630 picture shown when a link to the site
// is shared (LinkedIn, Slack, messengers). Run it after changing the name or
// the tagline below, then commit the PNG:
//
//   node scripts/og-image.mjs
//
// It needs Chrome or Edge. Set CHROME to the browser binary if it is not in
// one of the usual places.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const name = 'Burak Emir Sezen';
const tagline = 'Software engineer. MSc Computer Science at ETH Zurich.';
const domain = 'bsezen.com';

const out = resolve('public/og.png');

const require = createRequire(import.meta.url);
const font = require.resolve('@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2');
const fontData = readFileSync(font).toString('base64');

// Colours are the site's band tokens (see DESIGN.md).
const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Public Sans';
    src: url(data:font/woff2;base64,${fontData}) format('woff2');
    font-weight: 100 900;
  }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 84px 96px 76px;
    background: #211f1d;
    color: #f6f3ec;
    font-family: 'Public Sans', sans-serif;
  }
  .rule { width: 112px; height: 10px; background: #e8693a; }
  h1 {
    margin: 0;
    font-size: 116px;
    font-weight: 800;
    line-height: 0.94;
    letter-spacing: -0.04em;
  }
  p { margin: 28px 0 0; font-size: 34px; line-height: 1.35; color: #c2bbaf; }
  .domain { font-size: 28px; font-weight: 650; color: #f6f3ec; }
</style>
<div class="rule"></div>
<div>
  <h1>${name}</h1>
  <p>${tagline}</p>
</div>
<div class="domain">${domain}</div>
`;

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = candidates.find((path) => existsSync(path));
if (!chrome) {
  console.error('No Chrome or Edge found. Set CHROME to the browser binary.');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'og-'));
try {
  const page = join(dir, 'og.html');
  writeFileSync(page, html);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--window-size=1200,630',
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ]);
  console.log(`Wrote ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
