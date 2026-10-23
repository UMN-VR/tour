# UMN campus tours

The University of Minnesota's virtual campus tours, built on
[FOSS Earth](https://github.com/foss-earth/app): 360° photographs on a 3D globe.
GitHub Pages serves them from this repository's `gh-pages` branch at
<https://umn-vr.github.io/tour/>. The club's site, <https://umn-vr.github.io/>, is a separate repository.

| Page | What it is |
| --- | --- |
| [/tour/](https://umn-vr.github.io/tour/) | Choose a campus |
| [/tour/minneapolis/](https://umn-vr.github.io/tour/minneapolis/) | The Minneapolis campus: 48 panoramas |
| [/tour/st-paul/](https://umn-vr.github.io/tour/st-paul/) | The Saint Paul campus: 12 panoramas |
| [/tour/twin-cities/](https://umn-vr.github.io/tour/twin-cities/) | Both campuses: 60 panoramas, in 23 stops and 4 earlier ones |

Each campus page is FOSS Earth's app, offering that campus's scene and opening
it. FOSS Earth provides the globe and the panorama viewer; this repository
provides the pages. Each scene is its own repository:
[twin-cities](https://github.com/UMN-VR/twin-cities),
[minneapolis](https://github.com/UMN-VR/minneapolis) and
[st-paul](https://github.com/UMN-VR/st-paul). The photographs are published
once, under `/tour/twin-cities/media/`, and every scene points there.

## Running the tours locally

The tours link FOSS Earth and the scenes from checkouts beside this one:

```text
gh/
├── foss-earth/app/            (and the FOSS Earth libraries beside it; see its README)
├── Felipegalind0/gamepad-tools/
└── UMN-VR/
    ├── tour/                  this repository
    ├── twin-cities/
    ├── minneapolis/
    └── st-paul/
```

With FOSS Earth's app installed (`npm install` in `foss-earth/app`):

```sh
npm install
npm run dev
```

Open `https://localhost:8660/tour/`. It leads to the campus selector. Development
and preview default to port `8660` and stop if it is occupied; use
`-- --port <number>` to choose another port explicitly. Dev and preview share
that port, so override one to run both together. The sibling apps use `7470`
(0SFS) and `3600` (FOSS Earth). Restart an existing server to use the new
default; browser settings saved on an old port remain on that old origin.
Edits here and
in the linked FOSS Earth libraries hot reload: the `localSource()` Vite plugin
serves their checkout files and keeps them out of Vite's dependency cache,
including CSS imports from those packages.

The photographs come from the published site unless
`public/tour/twin-cities/media/` is present, or `TOUR_PUBLIC` names another
folder that contains `tour/twin-cities/media/`.

`npm run dev` listens on the network by default and prints a network URL and QR
code to `/tour/`. The server serves HTTPS with a self-signed certificate. The phone's browser warns
once per address; in Chrome, tap Advanced, then Proceed. After that the page is
secure, so it can use WebGPU, and with `FOSS_EARTH_ISOLATION=enforce` it can
share memory. A plain `http://` network address gets neither: it runs on WebGL
without shared memory. `FOSS_EARTH_DEV_HTTPS=off` keeps that http server.

For local-only development use `npm run dev -- --host localhost`. HTTPS setup
requires `openssl`; startup fails clearly if a certificate cannot be created.

Use `npm run llm-dev` for automated checks, or `npm run dev -- --no-qr`,
to omit QR art while keeping HTTPS and network links.
The `--` passes the flag through npm. Other Vite options still work, for example
`npm run llm-dev -- --port 9000`.

Normal `npm run dev` also reads `GOOGLE_3D_TILES_KEY` from the environment or
`.env.local` (this app first, then the linked FOSS Earth app). It appends
`?gkey=YOUR_GOOGLE_MAPS_API_KEY` to the printed startup URLs and the QR code.
Opening the link saves the key on that device and removes it from the address
bar. Use `npm run dev -- --no-gkey` to omit the key (`--no-key` also works).
`npm run llm-dev` omits both the key and QR output.

Manual `?gkey=YOUR_GOOGLE_MAPS_API_KEY` links save a key on the device and remove
it from the address bar. Existing `?key=` / `?googleKey=` links and saved keys
still work; `gkey` takes precedence. Existing `FOSS_EARTH_GOOGLE_KEY` environment
setups are accepted as a legacy fallback.

QR codes appear automatically in interactive terminals and are omitted from
captured output and CI logs. `FOSS_EARTH_DEV_QR=on npm run dev` forces a QR when
output is redirected; `--no-qr` takes precedence. Agents stop their temporary
servers after checking; to test a change yourself, run `npm run dev` in this
repo in your own terminal.

## How the photographs load

Inside a panorama the default is equi-angular cube tiles: the tiles the view
needs, at the detail its pixels need, drawn over the orb's preview. The build
also makes ordinary cube tiles and whole images for every photograph. The map
draws every orb from one preview sheet, one request, and loads a sharper
preview only for an orb drawn large enough to show it. A file is downloaded
once and kept in the browser under that photograph's revision. Scenes → Saved
images shows what is kept, what the visit took from it, and clears it. The
default limit is 256 MiB (`scene.panorama.savedMiB`, up to 4096). The app's own
files are kept by FOSS Earth's
[service worker](https://github.com/foss-earth/ui/blob/main/docs/app-files.md)
(Settings → App files). On a device with little graphics memory, the GPU holds
the view and the rest goes back to the disk: Scenes → Loading and memory, and
Tiled images.

Sizes, the on-disk layout, and what a visit requests are in
[docs/content-delivery.md](docs/content-delivery.md). The timing that chose
tiles over a whole image is FOSS Earth's
[progressive 360° prototype](https://github.com/foss-earth/research/blob/main/benchmarks/eac-progressive-prototype/REPORT.md):
at 2 Mbit/s the view was within 1 dB of finished in 1.3 s, where whole images
of about 5 MiB took 20 s and more. That measurement is desktop Chrome with
network emulation. The production tour has been timed headlessly on a desktop
connection, and has not been timed on a phone's own network.

Two controls, for showing the tour one way:

| What | Where | Choices |
| --- | --- | --- |
| **Renderer**, the GPU interface | The renderer button on the bar (it reads WebGPU, WebGL2 or WebGL) → Renderer | Auto-detect, WebGPU, WebGL2, WebGL. A change reloads the page. |
| **Representation**, how the photograph arrives | Inside a panorama: 360 image settings → Image | Equi-angular cube tiles (the default), cube tiles, whole image. A change applies at once: the new kind loads behind the one on screen, then crossfades in. |

**Tile outlines**, beside Representation, draws each tile's edges. The same
choices go in a link, as any FOSS Earth setting can:
`?renderer=webgl2`, `?set.scene.panorama.representation=cube-tiles` or `=whole`,
`?set.scene.panorama.tileOutlines=true`.

## When a page misbehaves

Which build a device is running, including a tab a phone kept from an earlier
day: [docs/which-version.md](docs/which-version.md). Filing what it reports:
[docs/bug-reporting.md](docs/bug-reporting.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | The tours with hot reload, FOSS Earth included |
| `npm run build` | Typechecks, then builds the four pages and the three `scene.json` files into `dist/`. The photographs stay where they are published |
| `npm run preview` | Serves `dist/` |
| `npm test` | The scenes' tests. When the photographs are on disk (`public/`, or `TOUR_PUBLIC`), the Twin Cities scene's declared files are checked too |
| `npm run ci` | Lint, tests and a production build |
| `npm run campus-scenes` | Rewrites the Minneapolis and Saint Paul scenes from the Twin Cities scene and each campus's `campus.json` |
| `npm run build:scene -- --poses-only` | Rewrites pose-derived fields in the Twin Cities scene from `placements.json`, without preparing photographs. Then run `npm run campus-scenes` |
| `npm run build:scene` | Full rebuild from the YouVisit backup. It still calls removed FOSS Earth script paths, so this command does not complete in the current checkout |

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `src/selector.js`, `src/selector.css` | The campus selector, a plain page with no app |
| `<campus>/index.html`, `src/tour/` | Each campus's page: FOSS Earth's app, offering that campus's scene |
| `tools/campus-scenes.mjs` | Makes each campus's scene from the Twin Cities one |
| `tools/twin-cities/` | The Twin Cities scene's build and its hand-edited placements |
| `docs/` | [which-version.md](docs/which-version.md), [bug-reporting.md](docs/bug-reporting.md), how the photographs are delivered ([content-delivery.md](docs/content-delivery.md)), and what is left to do ([roadmap.md](docs/roadmap.md)) |
| `public/`, `.local/` | Gitignored: the scene build's output, and the YouVisit backup it reads |

## Deploying

This repository publishes the tours on its own `gh-pages` branch. The
[club site](https://github.com/UMN-VR/UMN-VR.github.io) is a separate deploy and
does not publish the tour.

```sh
npm run deploy
```

A deploy first records the commit of each checkout the tour is built from,
FOSS Earth's and the campuses', in `deployed-from.json`. When one moved since
the last deploy, it commits that file and pushes this repository's branch, so
the build is a new version of the tour, and the history here says what each
deploy was built from. The record is FOSS Earth About's `recordBuildInputs`,
the same for every app's and site's deploy. It stops if this branch lacks
commits its remote has: pull, then deploy again. A checkout with changes not
committed, or with a commit on no remote branch, is named, and the deploy goes
on. Then it builds and publishes. `--dry-run` says what it would record,
commits and pushes nothing here, and builds and prepares the `gh-pages` commit
without publishing it.

The first time, when this repository has no `gh-pages` branch yet, copy the
photographs that are already published:

```sh
npm run deploy -- --bootstrap-from https://github.com/UMN-VR/UMN-VR.github.io.git
```

The deploy adds this build to `gh-pages` and keeps what is already there,
photographs and older app files included, so a page that is already open keeps
working. `--media <public folder>` adds `tour/twin-cities/media/` from that
folder to the same commit. Publish a scene an already-open app can read before
the app that requires the new scene. A browser that restores a tab shows the
page it has until that page updates itself or someone reloads it.

`npm run build` writes this repository's commit and FOSS Earth's into the page.
Uncommitted changes in the files the build is made from are marked `-dirty`,
in the page and in the `gh-pages` commit that publishes it.
Commit those first, here and in FOSS Earth, when the published version should
name a clean commit. A page that can ask the site reloads itself into a newer
published version at startup and about every ten minutes while it is shown,
unless someone has touched it.
[which-version.md](docs/which-version.md) is the rest of that behavior.

A scene changes only with its repository: commit the new `scene.json` in
[twin-cities](https://github.com/UMN-VR/twin-cities), run
`npm run campus-scenes` and commit the two campus scenes, then build and deploy.

### The scene build

Correcting a photograph's place does not prepare images again:

```sh
node tools/twin-cities/import-poses.mjs --input build/phone-poses.json
node tools/twin-cities/import-poses.mjs --input build/phone-poses.json --reference "Campus landmarks checked on the map" --write
npm run build:scene -- --poses-only
npm run campus-scenes
```

The first command is a dry run. `--write` updates `tools/twin-cities/placements.json` only. `--poses-only` reads that file and the sibling `twin-cities/scene.json`, updates capture, orientation, markers, hotspot directions, opening views and the north summary, and writes that same scene. It does not prepare photographs or change which photographs are in the scene. `campus-scenes` then regenerates Minneapolis and Saint Paul. Keep the phone export under gitignored `build/`.

With `?dev=1`, open **Scenes → Image links** to connect photographs. Choose From and To
(nearest destinations first), leave **Link both ways** checked for a return link,
then press **Add link**. The links work immediately and stay in this browser.
**Remove** removes that direction of a locally added link; **Reset this scene**
restores the scene's published links. Download links exports all locally added
connections as `umn-tour-links-YYYY-MM-DD.json`.

To incorporate downloaded connections into the tour:

```sh
node tools/twin-cities/import-links.mjs --input build/phone-links.json
node tools/twin-cities/import-links.mjs --input build/phone-links.json --write
npm run build:scene -- --poses-only
npm run campus-scenes
```

The importer adds destination ids to each source's `links` in `placements.json`.
Both scene build paths preserve the original YouVisit links and add these
connections. Hotspot directions come from the corrected capture coordinates and
heights, and are recalculated on rebuild. Coincident captures get list links.
To remove an incorporated connection, remove its destination id from placements
and rebuild. Downloads and local edits do not publish the tour.

`npm run build:scene` without `--poses-only` still runs `scripts/prepare-panorama.mjs`, `scripts/check-scene.mjs` and `scripts/lib/previewSheet.mjs` from the installed `foss-earth` package. Those files are no longer there. The replacements are `foss-earth-prepare-panorama` from `@foss-earth/image-viewer`, and `foss-earth-check-scene` and `foss-earth-build-preview-sheets` from `@foss-earth/scenes`. That full media pipeline is not what `--poses-only` runs. See [tools/twin-cities/README.md](tools/twin-cities/README.md).

## Project policies

- [Code of conduct](https://github.com/UMN-VR/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/UMN-VR/.github/blob/main/CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](https://github.com/UMN-VR/.github/blob/main/SECURITY.md)

The photographs and the panoramas' descriptions are © Regents of the University
of Minnesota; building positions credit © OpenStreetMap contributors (ODbL 1.0)
where the scenes say so. The project license does not relicense them.
