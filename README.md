# bsezen.com

Personal website: one static page built with [Astro](https://astro.build) and
served by nginx-unprivileged on port 8080.

This repository builds the container image. The cluster side (Deployment,
Service, IngressRoute) lives in the home-infra repository under
`tanka/environments/website/`, which references the image by tag.

## Edit

All text is in `src/data/site.ts`. Layout is `src/pages/index.astro`, styling
is `src/styles/global.css`. The page follows the visitor's light or dark
system setting.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

Astro 5 is used because Astro 7 needs Node 22.23.4 or newer.

### Photos and record audio

The portrait is `src/assets/portrait.jpg`. Gear photos and record covers are
optional: put the file in `src/assets`, import it in `src/pages/index.astro`,
and add it to the `photos` map there under its id (`guitar`, `amp`,
`interface`, `turntable`, `record-1` to `record-4`). Without a photo, a gear item shows as
text only and a record shows its title and artist on a coloured sleeve.

Record audio files are self-hosted and served under `/records/`:
- In production, audio files are mounted from an NFS share into `/usr/share/nginx/html/records` inside the container and served at `/records/<album-slug>/<NN>-<track-slug>.mp3`.
- For local development, place the files in `public/records/<album-slug>/<NN>-<track-slug>.mp3` (Astro serves files in `public/` at the root).
- Track metadata, durations, and LP sides (`side: 'A' | 'B'`) are defined in `src/data/site.ts`.

### Version stamp

The footer shows the commit the page was built from and the build date. CI
passes the commit into the image build as `COMMIT_SHA`. Set `person.source` in
`src/data/site.ts` to the repository URL once it is public, and the hash
becomes a link to that commit.

## Before it goes public

- `person.email` in `src/data/site.ts` is a placeholder (`hello@bsezen.com`).
  Set it to the real mailbox once it exists.
- Replace every `placeholder: true` text.
- No phone number and no CV PDF are published, on purpose.
- `src/assets/community-solutions.png` and `community-solutions-course.png` are
  signed-in views of exams.vis.ethz.ch (course list, and one course's exams
  with lecturer names). Check that VIS is fine with them being shown here.
- `src/assets/visit.png` is the bookings overview of the Visit staging site,
  with test data.
- The four `src/assets/gear-*.png` images are product shots from Yamaha Music
  London (guitar), BOSS (amp), Focusrite (interface) and Audio-Technica
  (turntable), with the white background cut out of the first two. They belong
  to those companies. Replace them with your own photos, or check that using
  them is fine.
- The four `src/assets/record-*.jpg` images are album covers from the Cover Art
  Archive. They belong to the labels and artists.
- The teaching points describe SPCA and DDCA from public course notes, not from
  the CV. Check them.
- The cluster section names the stack but no hostnames or addresses. Keep it
  that way.

## The listening room's baked lighting

The 3D room has ambient occlusion (contact shadows, darker corners) that is
computed once, offline, and only sampled at runtime. It is mood independent, so
one bake serves day and night. The files are in `src/assets/bake/` (about
0.6 MB): an atlas for the large flat faces (floor, walls, ceiling, rug) and one
byte per vertex for everything else. If they are missing, or a model no longer
matches them, the room simply looks as it did without them (the browser console
says once that a re-bake is due).

Re-bake after changing any model or its placement in `src/scripts/room/`:

```
npm run bake                  # needs Chrome or Edge and a real GPU; about a minute
git add src/assets/bake
```

`npm run bake` starts its own dev server on port 4329, runs `/bake` in headless
Chrome on the GPU, writes the files and stops again. It refuses to run on a
software renderer unless you pass `--allow-software`. Options:
`-- --spp 1024` (rays per sample, default 512), `--density 160` (atlas texels
per metre), `--dist 0.9` (occluder reach in metres), `--strength 1.4`,
`--min 0.3` (AO never darker than this). To use a visible browser instead,
run `npm run dev`, open `http://localhost:4321/bake` and press Bake.
`/lab/?model=room&bake=1` shows the room with the bake applied. The bake page
and its code are removed from the production build.

## Release and deploy

`.github/workflows/image.yaml` builds the image on every push. Pushing a tag
such as `v0.1.0` also publishes `ghcr.io/<owner>/website:0.1.0`.

The GHCR package must be public, or the `website` namespace in the cluster
needs an image pull secret. Then set the same tag in
`tanka/environments/website/main.jsonnet` in home-infra and merge; Argo CD
deploys it.

`bsezen.com` also needs a public hostname route in the Cloudflare tunnel
(pointing at Traefik, like the other hosts) and its DNS record. Both live in
Cloudflare.
