import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Dev only: turns the two full-resolution plate PNGs into what the site ships.
// Per mood: the full-res plate as WebP (q95) at the old name plus AVIF, and
// downscaled variants at 1280, 1920, 2560 (and 3840 when the source is at least
// that wide) in both formats, resized with lanczos3. Writes plate-meta.json
// with a `variants` map:
//   variants.day = [{ w, h, avif: 'plate-day-1280.avif', webp: 'plate-day-1280.webp' }, ...]
export async function encodePlates(dir, inputs, meta, state, moods = ['day', 'night']) {
  const { default: sharp } = await import('sharp');
  const re = new RegExp('^plate-(' + moods.join('|') + ')(-\\d+)?\\.(avif|webp)$');
  for (const f of readdirSync(dir)) if (re.test(f)) rmSync(dir + f, { force: true });
  const webp = (img) => img.webp({ quality: 95, smartSubsample: true, effort: 6 });
  const webpV = (img) => img.webp({ quality: 92, smartSubsample: true, effort: 6 });
  const avif = (img) => img.avif({ quality: 75, effort: 6, chromaSubsampling: '4:4:4' });
  let old = {};
  try {
    if (existsSync(dir + 'plate-meta.json')) old = JSON.parse(readFileSync(dir + 'plate-meta.json', 'utf8'));
  } catch {}
  const variants = { ...(old.variants ?? {}) };
  const written = {};
  for (const mood of moods) {
    const png = inputs[mood];
    const { width: sw, height: sh } = await sharp(png).metadata();
    const sizes = [1280, 1920, 2560, ...(sw >= 3840 ? [3840] : [])].filter((w) => w <= sw);
    state.label = `${mood}: encoding full-res WebP`;
    const full = await webp(sharp(png)).toBuffer();
    writeFileSync(dir + `plate-${mood}.webp`, full);
    state.label = `${mood}: encoding full-res AVIF`;
    writeFileSync(dir + `plate-${mood}.avif`, await avif(sharp(png)).toBuffer());
    written[mood] = full.length;
    variants[mood] = [];
    for (const w of sizes) {
      const h = Math.round((w * sh) / sw);
      const resized = () => sharp(png).resize({ width: w, height: h, kernel: 'lanczos3', fit: 'fill' });
      state.label = `${mood}: encoding ${w}px variants`;
      writeFileSync(dir + `plate-${mood}-${w}.webp`, await webpV(resized()).toBuffer());
      writeFileSync(dir + `plate-${mood}-${w}.avif`, await avif(resized()).toBuffer());
      variants[mood].push({ w, h, avif: `plate-${mood}-${w}.avif`, webp: `plate-${mood}-${w}.webp` });
    }
  }
  // A single-mood bake keeps the other mood's per-mood entries from the old meta.
  const bake = { ...(meta.bake ?? {}) };
  if (moods.length < 2 && old.bake) {
    for (const [k, v] of Object.entries(bake)) {
      const ov = old.bake[k];
      if (v && ov && typeof v === 'object' && !Array.isArray(v) && ('day' in v || 'night' in v)) {
        const merged = { ...ov };
        for (const m of moods) merged[m] = v[m];
        bake[k] = merged;
      }
    }
  }
  const out = { ...(moods.length < 2 ? { ...old, ...meta } : meta), bake, variants };
  writeFileSync(dir + 'plate-meta.json', JSON.stringify(out, null, 2));
  state.written = { ...written, meta: JSON.stringify(out).length };
  state.label = 'done';
  state.done = true;
}
