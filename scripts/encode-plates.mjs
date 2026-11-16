// Re-encodes the site's plate variants (WebP/AVIF at every size) from the 16-bit
// PNG masters in src/assets/bake/master/, without rendering anything.
//
//   npm run plates:encode
//
// Reads master/plate-day.png, master/plate-night.png and the existing
// plate-meta.json (camera, gear boxes, bake settings), then rewrites the
// variants and the `variants` map in plate-meta.json.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePlates } from './lib/encode-plates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'assets', 'bake').split('\\').join('/') + '/';
const inputs = {};
for (const mood of ['day', 'night']) {
  const p = `${dir}master/plate-${mood}.png`;
  if (!existsSync(p)) {
    console.error(`Missing ${p}. Run \`npm run bake:plates\` first.`);
    process.exit(1);
  }
  inputs[mood] = readFileSync(p);
}
const metaPath = `${dir}plate-meta.json`;
if (!existsSync(metaPath)) {
  console.error(`Missing ${metaPath}.`);
  process.exit(1);
}
const { variants: _old, ...meta } = JSON.parse(readFileSync(metaPath, 'utf8'));

let label = '';
const state = {
  set label(v) {
    label = v;
    console.log(v);
  },
  get label() {
    return label;
  },
  written: null,
  done: false,
};
const t0 = Date.now();
await encodePlates(dir, inputs, meta, state);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
