# UMN campus tours

The University of Minnesota's virtual campus tours, built on
[FOSS Earth](https://github.com/foss-earth/app): 360° photographs on a 3D globe.
They are published with the UMN VR club's site, https://umn-vr.github.io/:

| Page | What it is |
| --- | --- |
| [/tour/](https://umn-vr.github.io/tour/) | Choose a campus |
| [/tour/minneapolis/](https://umn-vr.github.io/tour/minneapolis/) | The Minneapolis campus: 48 panoramas |
| [/tour/st-paul/](https://umn-vr.github.io/tour/st-paul/) | The Saint Paul campus: 12 panoramas |
| [/tour/twin-cities/](https://umn-vr.github.io/tour/twin-cities/) | Both campuses: all 60 panoramas in 23 stops |

Each campus page is FOSS Earth's app as it is, offering that campus's scene and
opening it. FOSS Earth provides the globe and the panorama viewer; this
repository provides the pages. Each scene is its own repository:
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

Open the address Vite prints: it leads to the campus selector. App edits and
edits to linked FOSS Earth libraries hot reload: the `localSource()` Vite plugin
serves their checkout files directly and keeps them out of Vite's dependency
cache, including CSS imports from those packages. The photographs come from the
published site, so the tours need the network; to use a local copy, point
`TOUR_PUBLIC` at a folder holding `tour/twin-cities/media/` (the scene build's
output, `public/`, is used when it exists). For a phone on the same network, use
`npm run dev -- --host 0.0.0.0`.
An HTTP LAN URL uses the WebGL fallback; to exercise WebGPU, use a trusted
HTTPS development proxy or tunnel, since WebGPU requires a secure context.

## How the photographs load

Inside a panorama, each photograph arrives as tiles of an equi-angular cube: only the tiles the
view needs, at the detail its pixels need, drawn over the orb's preview, which is on screen
already. The view sharpens in a second or two on a 2 Mbit/s connection (measured on a desktop
with Chrome's network emulation; not yet on a phone), where a 5 MiB whole
image took 20 seconds or more, and a look back shows tiles already loaded. This is FOSS Earth's
[tiled cube](https://github.com/foss-earth/scenes),
measured in its [progressive 360° prototype](https://github.com/foss-earth/research/blob/main/benchmarks/eac-progressive-prototype/REPORT.md);
the build makes both kinds of tiles and the whole images for every photograph.

Each file is downloaded once. The viewer keeps what it downloads in the browser, under the
photograph's revision in the scene, and reads it from there on a reload, on a later visit and
when you look back at a part of a panorama: Scenes → Saved images shows what is kept (256 MB at
most), what the visit took from it, and clears it. The map shows all its orbs after one request,
from one image that holds every photograph's small preview, and loads a sharper preview only
for an orb drawn large enough to show it. FOSS Earth's
[scenes](https://github.com/foss-earth/scenes) describe both. The app's own files are kept too, by FOSS Earth's
[service worker](https://github.com/foss-earth/ui/blob/main/docs/app-files.md),
so a later visit downloads none of them however long after the last it comes (Settings → App
files). On a phone or another device with little graphics memory, the GPU holds the view and
gives the rest back to the disk: Scenes → Loading and memory and Tiled images set how much.

Two selectors, each a row of buttons:

| What | Where | Choices |
| --- | --- | --- |
| **Renderer**, the GPU interface | The renderer button on the bar at the bottom (it reads WebGPU, WebGL2 or WebGL) → Renderer tab | Auto-detect, WebGPU, WebGL2, WebGL. A change reloads the page. |
| **Representation**, how the photograph arrives | Inside a panorama: 360 image settings → Image | Equi-angular cube tiles (the default), cube tiles, whole image. A change applies at once: the new kind loads behind the one on screen, then crossfades in. |

**Tile outlines**, beside Representation, draws each tile's edges and tints it by its level as
it loads. The panorama's own tab says how many of the view's tiles are on screen and how much
has been downloaded; Scenes → Tiled images holds the tiles' memory, requests and uploads per
frame. Both choices can be put in a link, as any FOSS Earth setting can, for showing the tour
one way: `?renderer=webgl2`, `?set.scene.panorama.representation=cube-tiles` or `=whole`,
`?set.scene.panorama.tileOutlines=true`.

## When something goes wrong

**First, which version is it?** A phone that comes back to a tab may show its own copy of the
page from days before, with the app of that day: on 2026-10-04 an iPhone was still running the
tour of two days and four releases earlier, and it took the sections missing from its Settings
tab to tell.

- The log's first line, as the tour opens, says which version runs, such as "App built
  2026-10-04 20:23 UTC from a9e8e9d with FOSS Earth 930f725." The first commit is this
  repository's and the second FOSS Earth's. The About tab, under +, has them in full, with
  everything the tour is built from as a tree: this repository's commit, FOSS Earth's and
  gamepad-tools', each with its latest commits and links to its source, and every package's
  version. Its line for the site's latest deploy is the site's and not the page's. Until
  2026-10-07 About was the last section of the Settings tab.
- An app from before that line has none. Its Settings tab tells its age: three sections
  (Presets, Saved settings, About) is an app from before the evening of 2026-10-03; four, with
  App files, from that evening; five, with Diagnostics, from 2026-10-04; and an app from
  2026-10-07 on has an About tab under + and four Settings sections, About gone. Reload the tab, or
  close it and open the address in a new one, to get the published app.
- From the app with that line on, a page that is older than the published one reloads itself
  when it opens, and says so; once it has been touched it says a newer version is published,
  with a Reload button. Settings → App files has the same, and Ask now.
- What the site publishes is in its page's source:

  ```sh
  curl -s -A foss-earth-check/1.0 https://umn-vr.github.io/tour/minneapolis/ | grep -o '<meta name="foss-earth[^>]*>'
  ```

The tour says what it knows. Settings (the gear on the bar) → Diagnostics → **Copy report**
gives, as text, the version that ran, the browser, the renderer and its GPU, the settings that
were changed, and what the visit did: each photograph entered, each warning and error. If the
page stopped without being closed, as a phone's browser stops one that takes too much memory,
the next visit says so in its log, with the photograph it was in. If the tour does not stay
open long enough to reach Settings, add `?report` to its address
(<https://umn-vr.github.io/tour/twin-cities/?report>): the page shows the report and does not
start the map. Nothing is sent anywhere; the report is yours to paste where you report the
fault. FOSS Earth's
[diagnostics page](https://github.com/foss-earth/ui/blob/main/docs/diagnostics.md)
has the details, and how to attach a browser's inspector to a phone.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | The tours with hot reload, FOSS Earth included |
| `npm run build` | Typechecks and builds the four pages and the three scenes into `dist/` |
| `npm run preview` | Serves `dist/` |
| `npm test` | The scenes' tests; with the photographs local (`TOUR_PUBLIC`), every file each scene declares is checked too |
| `npm run ci` | Lint, tests and a production build |
| `npm run campus-scenes` | Rewrites the Minneapolis and Saint Paul scenes from the Twin Cities scene and each campus's `campus.json` |
| `npm run build:scene` | Rebuilds the Twin Cities scene and photographs from the YouVisit backup; see [tools/twin-cities/README.md](tools/twin-cities/README.md) |

## Layout

| Path | Contents |
| --- | --- |
| `tour/index.html`, `src/selector.css` | The campus selector, a plain page with no app |
| `tour/<campus>/index.html`, `src/tour/` | Each campus's page: FOSS Earth's app, offering that campus's scene |
| `tools/campus-scenes.mjs` | Makes each campus's scene from the Twin Cities one |
| `tools/twin-cities/` | The Twin Cities scene's build and its hand-edited placements |
| `docs/` | What is left to do ([roadmap.md](docs/roadmap.md)), and a prompt for each larger piece |
| `public/`, `.local/` | Gitignored: the scene build's output, and the YouVisit backup it reads |

## Deploying

The [club site](https://github.com/UMN-VR/UMN-VR.github.io) publishes the tours
with its landing page: build here (`npm run build`), then `npm run deploy` there.
The deploy adds this build to the `gh-pages` branch and keeps what is already
published, the photographs and older app files included, so a page that is
already open keeps working.

Commit first, here and in FOSS Earth: the build writes both commits into the
page and the app, with `-dirty` after one that had changes not committed, and
that is how a phone's version is told from another. After a release, a page of
the app before it reloads itself the next time it asks the site, within ten
minutes while it is shown, unless someone has touched it.

A scene changes only with its repository: commit the new `scene.json` in
[twin-cities](https://github.com/UMN-VR/twin-cities), run
`npm run campus-scenes` and commit the two campus scenes, then build and deploy.
New photographs are published before the scene that uses them (see the club
site's README). Publish first the side the other relies on, so the live pair
always works: new content an old app can read goes first, then the app. Avoid
content the deployed app cannot read: a browser that restores a tab shows the
page it has for as long as it keeps it.

The Twin Cities scene build still calls FOSS Earth's scripts from before FOSS
Earth was split into libraries; it needs moving to `@foss-earth/360`'s
`foss-earth-prepare-panorama` and `@foss-earth/scenes`' `foss-earth-check-scene`
and `foss-earth-build-preview-sheets` before the next rebuild.

## Project policies

- [Code of conduct](https://github.com/UMN-VR/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/UMN-VR/.github/blob/main/CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](https://github.com/UMN-VR/.github/blob/main/SECURITY.md)

The photographs and the panoramas' descriptions are © Regents of the University
of Minnesota; building positions credit © OpenStreetMap contributors (ODbL 1.0)
where the scenes say so. The project license does not relicense them.
