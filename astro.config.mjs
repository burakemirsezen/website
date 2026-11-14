import { defineConfig } from 'astro/config';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// src/pages/lab.astro (a stage for the listening room's models, see
// scripts/lab-shot.mjs) and src/pages/bake.astro (the lighting bake, see
// scripts/bake.mjs) are dev-only. They must never be published, so the build
// removes them from the output.
const dropLab = {
  name: 'drop-lab',
  hooks: {
    'astro:build:done': ({ dir }) => {
      rmSync(fileURLToPath(new URL('lab/', dir)), { recursive: true, force: true });
      rmSync(fileURLToPath(new URL('lab.html', dir)), { force: true });
      rmSync(fileURLToPath(new URL('bake/', dir)), { recursive: true, force: true });
      rmSync(fileURLToPath(new URL('bake.html', dir)), { force: true });
      // ...and their own script and style chunks, which nothing else uses.
      // (The bake's GPU code lives in files named bakegpu*.)
      const assets = fileURLToPath(new URL('_astro/', dir));
      for (const f of readdirSync(assets)) if (/^(lab|bake|bakegpu[^.]*)\./.test(f)) rmSync(assets + f);
    },
  },
};

// Dev only: the live endpoints exist in nginx.conf, not in `astro dev`. This
// answers the same two URLs with plausible, changing values so the cluster
// section can be worked on. `apply: 'serve'` keeps it out of every build.
const mockLive = {
  name: 'mock-live-endpoints',
  apply: 'serve',
  configureServer(server) {
    let served = 1200;
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== '/live.json' && path !== '/live/nginx') return next();
      served += 1 + Math.floor(Math.random() * 3);
      res.setHeader('Cache-Control', 'no-store');
      if (path === '/live.json') {
        res.setHeader('Content-Type', 'application/json');
        const wait = 8 + Math.random() * 30;
        return setTimeout(() => res.end(JSON.stringify({ pod: 'website-dev-mock-x2k8p', time: Date.now() / 1000 })), wait);
      }
      res.setHeader('Content-Type', 'text/plain');
      const active = 1 + Math.floor(Math.random() * 4);
      res.end(`Active connections: ${active} 
server accepts handled requests
 ${served - 40} ${served - 40} ${served} 
Reading: 0 Writing: 1 Waiting: ${active - 1} 
`);
    });
  },
};

// Dev only: receives the lighting bake from /bake (see scripts/bake.mjs) and
// writes it to src/assets/bake/. Also keeps the bake's progress, which the
// script polls at /__bake/state.
const bakeWrite = {
  name: 'bake-write',
  apply: 'serve',
  configureServer(server) {
    const state = { gpu: null, label: 'idle', fraction: 0, done: false, error: null, written: null };
    const body = (req) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
    server.middlewares.use(async (req, res, next) => {
      const path = (req.url ?? '').split('?')[0];
      if (!path.startsWith('/__bake')) return next();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      try {
        if (req.method === 'GET' && path === '/__bake/state') return res.end(JSON.stringify(state));
        if (req.method !== 'POST') return next();
        const data = JSON.parse(await body(req));
        if (path === '/__bake/progress') {
          Object.assign(state, data);
          return res.end('{}');
        }
        if (path === '/__bake') {
          const { default: sharp } = await import('sharp');
          const dir = server.config.root.split('\\').join('/').replace(/\/?$/, '/') + 'src/assets/bake/';
          mkdirSync(dir, { recursive: true });
          const { manifest, atlas, vertex } = data;
          const raw = Buffer.from(atlas, 'base64');
          const webp = await sharp(raw, { raw: { width: manifest.atlas.w, height: manifest.atlas.h, channels: 1 } })
            .webp({ quality: 95, nearLossless: true, effort: 6 })
            .toBuffer();
          const bin = Buffer.from(vertex, 'base64');
          writeFileSync(dir + manifest.atlas.file, webp);
          writeFileSync(dir + manifest.vertex.file, bin);
          writeFileSync(dir + 'ao-manifest.json', JSON.stringify(manifest));
          state.written = { atlas: webp.length, vertex: bin.length, manifest: JSON.stringify(manifest).length };
          state.done = true;
          return res.end(JSON.stringify(state.written));
        }
        return next();
      } catch (e) {
        state.error = String(e);
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: String(e) }));
      }
    });
  },
};

export default defineConfig({
  site: 'https://bsezen.com',
  server: { port: 4321 },
  integrations: [dropLab],
  // The dev toolbar overlays the page and gets in the way of screenshots.
  devToolbar: { enabled: false },
  vite: {
    plugins: [mockLive, bakeWrite],
    build: {
      // Never inline scripts into the page: nginx sends a Content-Security-
      // Policy without 'unsafe-inline' for scripts, which would block them.
      assetsInlineLimit: 0,
    },
  },
});
