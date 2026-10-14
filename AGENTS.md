# Agent instructions

Follow the shared rules for every UMN-VR repository in
[UMN-VR/.github/AGENTS.md](https://github.com/UMN-VR/.github/blob/main/AGENTS.md)
(in a local checkout of the organization: `../.github/AGENTS.md`).

[README.md](README.md) explains the pages, the commands and how the tours are
published. [docs/which-version.md](docs/which-version.md) is how to tell which
build a device is running, [docs/bug-reporting.md](docs/bug-reporting.md) how a
fault is filed, and [docs/roadmap.md](docs/roadmap.md) what is left to do. In this
repository also:

- **Tour-only work goes here; globe features go in FOSS Earth.** A feature a
  globe with no tour in it would want belongs in
  [FOSS Earth](https://github.com/foss-earth/app), even when the tour is its only
  user today. Use FOSS Earth through its exports; never copy or deep-import it.
- **Don't edit generated scenes.** The Twin Cities scene comes from
  `npm run build:scene` (edit `tools/twin-cities/placements.json` or the build),
  and the campus scenes from `npm run campus-scenes` (edit a campus's
  `campus.json`).
- **Never delete from `.local/youvisit-backup/`.** It is the only copy of the
  YouVisit tour.
- **The camera has mass and momentum, draw only what changed, and dropdowns fit
  their text:** any camera move, frame or dropdown the tour adds follows FOSS
  Earth's [camera motion](https://github.com/foss-earth/docs/blob/main/docs/camera-motion.md),
  [render on demand](https://github.com/foss-earth/docs/blob/main/docs/render-on-demand.md)
  and [UI layout](https://github.com/foss-earth/docs/blob/main/docs/ui-layout.md) rules.
- **After an edit:** run `npm run typecheck`, `npm run test:changed -- <changed files>`
  and `npm run lint`; for finished work, `npm run ci` once.
- **Don't start servers or deploy unless asked.** When asked to publish the
  tour, run `cd ~/gh/UMN-VR/tour && npm run deploy`. That commits and pushes
  `deployed-from.json` here when FOSS Earth or a campus moved, then builds and
  pushes this repository's `gh-pages` branch to https://umn-vr.github.io/tour/ and keeps the
  photographs already there. The club homepage is a separate repository.
