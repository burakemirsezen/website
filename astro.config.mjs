import { defineConfig } from 'astro/config';
import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// src/pages/lab.astro (a stage for the listening room's models, see
// scripts/lab-shot.mjs) is dev-only. It must never be published, so the build
// removes it, and its own script and style chunks, from the output.
const dropLab = {
  name: 'drop-lab',
  hooks: {
    'astro:build:done': ({ dir }) => {
      rmSync(fileURLToPath(new URL('lab/', dir)), { recursive: true, force: true });
      rmSync(fileURLToPath(new URL('lab.html', dir)), { force: true });
      const assets = fileURLToPath(new URL('_astro/', dir));
      for (const f of readdirSync(assets)) if (/^lab\./.test(f)) rmSync(assets + f);
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

export default defineConfig({
  site: 'https://bsezen.com',
  server: { port: 4321 },
  integrations: [dropLab],
  // The dev toolbar overlays the page and gets in the way of screenshots.
  devToolbar: { enabled: false },
  vite: {
    plugins: [mockLive],
    build: {
      // Never inline scripts into the page: nginx sends a Content-Security-
      // Policy without 'unsafe-inline' for scripts, which would block them.
      assetsInlineLimit: 0,
    },
  },
});
