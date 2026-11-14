import { defineConfig } from 'astro/config';
import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// src/pages/lab.astro is a dev-only stage for the listening room's models
// (see scripts/lab-shot.mjs). It must never be published, so the build
// removes it from the output.
const dropLab = {
  name: 'drop-lab',
  hooks: {
    'astro:build:done': ({ dir }) => {
      rmSync(fileURLToPath(new URL('lab/', dir)), { recursive: true, force: true });
      rmSync(fileURLToPath(new URL('lab.html', dir)), { force: true });
      // ...and its own script and style chunks, which nothing else uses.
      const assets = fileURLToPath(new URL('_astro/', dir));
      for (const f of readdirSync(assets)) if (f.startsWith('lab.')) rmSync(assets + f);
    },
  },
};

export default defineConfig({
  site: 'https://bsezen.com',
  server: { port: 4321 },
  integrations: [dropLab],
  // The dev toolbar overlays the page and gets in the way of screenshots.
  devToolbar: { enabled: false },
  vite: {
    build: {
      // Never inline scripts into the page: nginx sends a Content-Security-
      // Policy without 'unsafe-inline' for scripts, which would block them.
      assetsInlineLimit: 0,
    },
  },
});
