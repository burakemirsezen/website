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

## The listening room

The room in the Music section is a still image rendered offline in Blender
Cycles (one for day, one for night) with a small live layer on top: the record,
the tonearm and the hover outlines of the gear, drawn by three.js in
`src/scripts/room/plate-room.ts` from the gear models next to it. The images,
the light probe and shadow the live layer is lit with, and `plate-meta.json`
(camera, gear positions, light) are committed in `src/assets/bake/`.

The room itself is a Blender file, `bake-assets/master/room.blend` (git-ignored,
about 1.6 GB with every texture packed). Day and night are one scene; what
differs between them (lamp bulbs, the lit windows across the street, the sky)
is a small table stored in the file. Edit the file, then:

```
npm run room:backup           # before a big edit: copies it to the backup share
npm run room:check            # objects passing through each other, new since the baseline
npm run bake:plates -- --preset draft   # a quick look (about 3 minutes for both moods)
npm run bake:plates           # final, 3840x2160 (-- --preset ultra for the slow, cleanest one)
git add src/assets/bake
```

- `room:backup -- --list` lists the backups and `-- --restore <name>` brings
  one back. They are copied over SSH to the host and folder named in
  `bake-assets/backup.json` (local, not committed; see `scripts/room.mjs`).
- `room:check` compares against `scripts/blender/clip-baseline.json`, the
  intersections of the reviewed scene (most are parts of one object built to
  overlap). `-- --write-baseline` accepts the current state.
- The turntable, guitar, amp, interface and speakers are locked in the file:
  the live layer draws on top of them at the positions in the code, so a render
  stops if one has moved. Change a gear model in code, and it has to be
  replaced in the file to match.
- `npm run plates:encode` re-encodes the WebP/AVIF variants from the 16-bit
  masters without rendering. `/lab?model=room` shows the room as on the site;
  `/lab?model=guitar` (amp, interface, turntable, speaker) one model on its own.
  The lab page is removed from the production build.

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
