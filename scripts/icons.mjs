// Builds the two raster icons from public/favicon.svg, following the
// three-file setup (SVG, ICO, Apple touch icon). Run after changing the SVG,
// then commit the results:
//
//   node scripts/icons.mjs
//
// - public/favicon.ico: 32x32, for browsers and tools that ignore SVG icons.
// - public/apple-touch-icon.png: 180x180, square and full-bleed (iOS rounds
//   the corners itself), for home screens and share sheets.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const svg = readFileSync(resolve('public/favicon.svg'), 'utf8');

// favicon.ico: an ICO container holding one 32x32 PNG, which every current
// browser reads.
const png32 = await sharp(Buffer.from(svg)).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); // width
entry.writeUInt8(32, 1); // height
entry.writeUInt8(0, 2); // no palette
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png32.length, 8); // image size
entry.writeUInt32LE(6 + 16, 12); // image offset
writeFileSync(resolve('public/favicon.ico'), Buffer.concat([header, entry, png32]));

// Apple touch icon: same mark, but the rounded corners are removed so the
// charcoal fills the square.
const square = svg.replace(/\s*rx="[^"]*"/, '');
await sharp(Buffer.from(square), { density: 600 })
  .resize(180, 180)
  .flatten({ background: '#211f1d' })
  .png()
  .toFile(resolve('public/apple-touch-icon.png'));

console.log('Wrote public/favicon.ico and public/apple-touch-icon.png');
