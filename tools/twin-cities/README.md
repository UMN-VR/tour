# Twin Cities campus tour: building the scene

The tour page, <https://umn-vr.github.io/tour/twin-cities/>, shows one
[FOSS Earth](https://github.com/foss-earth/foss-earth.github.io) scene. The scene is a manifest,
[`public/tour/twin-cities/scene.json`](../../public/tour/twin-cities/scene.json), and the
prepared images under `public/tour/twin-cities/media/`. It places the old YouVisit tour's 360°
photographs on the globe. FOSS Earth shows each one as an orb above the campus; entering an orb
opens the photograph, and its links lead to the next one. The format is FOSS Earth's
[`docs/scenes/format.md`](https://github.com/foss-earth/foss-earth.github.io/blob/main/docs/scenes/format.md).

Everything under `public/tour/twin-cities/` is generated. Edit
[`placements.json`](placements.json) or the build, then rebuild.

Only what this tour needs lives here. FOSS Earth owns the scene format, the viewer and the tools
that prepare and check any scene. This build runs those tools from the `foss-earth` package the
repository installs. [AGENTS.md](../../AGENTS.md) sets out the split.

## Rebuilding

A correction of places, after a phone export has been reviewed:

```sh
node tools/twin-cities/import-poses.mjs --input build/phone-poses.json
node tools/twin-cities/import-poses.mjs --input build/phone-poses.json --reference "Campus landmarks checked on the map" --write
npm run build:scene -- --poses-only
npm run campus-scenes
```

A photograph without a fixed height, or one whose position moved, gets a height before the
scenes are rebuilt (see [Heights](#heights-prepared-once-at-build-time)):

```sh
npm run prepare:heights
npm run build:scene -- --poses-only
npm run campus-scenes
npm run check:heights
```

`--poses-only` updates the sibling [`twin-cities/scene.json`](../../../twin-cities/scene.json) from [`placements.json`](placements.json). It keeps the photographs, preview sheets and entity membership, recomputes pose-dependent fields, and validates the manifest without reading media files. Unchanged placements leave that scene's revision as it is. Hotspot directions and opening views are recomputed from the YouVisit backup's image-local angles when a pose changes. The published directions are not inverted. If the backup is not on this machine, a pose change that would move a hotspot or an opening view stops instead of guessing.

The full `npm run build:scene` still prepares photographs. It calls `scripts/prepare-panorama.mjs`, `scripts/check-scene.mjs` and `scripts/lib/previewSheet.mjs` inside the installed `foss-earth` package. Those paths were removed in the FOSS Earth split, so that command does not complete here. The public replacements are `foss-earth-prepare-panorama` (`@foss-earth/image-viewer`), `foss-earth-check-scene` and `foss-earth-build-preview-sheets` (`@foss-earth/scenes`). Wiring those into the full media build is separate from the pose-only path above.

The historical full build, when those scripts were present, needed:

- **The YouVisit backup** in `.local/youvisit-backup/snapshot-*`. It exists only on the
  laptop that made it; see that folder's README.
- **`npm install`,** which links FOSS Earth; see the [README](../../README.md).

What the build does:

1. **Prepares each photograph** with FOSS Earth's `scripts/prepare-panorama.mjs`. The outputs,
   all JPEG at quality 80:
   - preview cubes of 64, 128 and 256 px faces, for the orbs;
   - tiled cubes for looking around, the tour's default: an equi-angular cube (`eac-tiles/`)
     and an ordinary one (`cube-tiles/`), each with faces of 1536 px, the photograph's own
     detail at the horizon, in 510 tiles of 192 px over four levels. Inside a panorama the
     viewer loads only the tiles the view needs. Their format is FOSS Earth's
     [tiled cube](https://github.com/foss-earth/foss-earth.github.io/blob/main/docs/scenes/format.md#tiled-cubes);
   - whole images 2048, 4096 and 6144 px wide, for "Whole image" in 360 image settings and for
     older viewers. 6144 px is YouVisit's full width.

   Times on the laptop that made it, three images at a time:
   - all 60 with whole images only took 61 s; with both tiled cubes, 7 min 50 s (2026-10-03);
   - later builds reuse any image already prepared from the same file with the same options,
     so an edit to `placements.json` rebuilds in seconds.
2. **Puts every photograph's 64 px preview cube into one image,** `media/previews-64.jpg`
   (445 KiB for all 60), with FOSS Earth's `scripts/lib/previewSheet.mjs`, and names each
   cube's place in it in the scene, as the scene format's extension for
   [sheets](https://github.com/foss-earth/foss-earth.github.io/blob/main/docs/scenes/format.md#preview-sheets).
   The map shows all its orbs after that one request; the 360 face files stay, and a viewer
   from before sheets skips the extension and loads them.
   `--preview-sheet ""` leaves it out.
3. **Writes `scene.json`.**
4. **Checks the result** with FOSS Earth's `scripts/check-scene.mjs`, the way the viewer will
   read it once published: the manifest is valid, and every image file exists with the size
   and byte count it declares. `npm test` repeats this check.

`node tools/twin-cities/build-scene.mjs --help` lists the options. YouVisit's own images are
6144 px wide at quality 75–80. Of the scene's 660.6 MiB in 62,460 files (2026-10-03), the
equi-angular tiles are 200.6 MiB, the cube tiles 198.0 MiB and the 6144 px images 151.4 MiB.
`--immersion-widths 2048,4096` leaves the
largest whole images out, and `--tiles ""` the tiles. These are separate image files
referenced by one manifest, not one download. Routine app deploys
leave this content alone; see [content delivery](../../docs/content-delivery.md) for the folder
layout, loading sequence and separate app/content release commands.

## Where each part comes from

| Part | Source |
| --- | --- |
| The photographs | The backup's `media/panoramas/<id>/6144.jpg`, the largest YouVisit serves |
| Stops, their order, and each stop's panoramas | The backup's `api/v1.2-stops.json` and `api/v2-stops-tours.json`: 23 stops, one group each, in tour order |
| Retired stops | The 4 main views of stops YouVisit's map still shows but its tour no longer visits, in the group "Earlier tour stops" |
| Descriptions | YouVisit's panorama descriptions, as plain text |
| Links with a direction | YouVisit's hotspots that open another panorama; the link points where the hotspot sat |
| Links without a direction | The rest of each stop, from its main view; a way back to the main view from the others; and Next and Previous stop between main views, as YouVisit's buttons did |
| Start views | Each panorama's `start_lon`, `start_lat` and `start_fov`, where someone set them |
| Ids, titles, positions, north | [`placements.json`](placements.json), by hand |

## placements.json

There is one entry per photograph, keyed by its YouVisit panorama id:

```json
"363723": {
  "id": "taylor-center",
  "title": "Taylor Center",
  "capture": {
    "longitudeDeg": -93.2333842, "latitudeDeg": 44.974516, "horizontalAccuracyMeters": 50, "source": "…",
    "height": { "meters": 230.295, "datum": "WGS84-ellipsoid", "uncertaintyMeters": 2.01, "source": "…" },
    "heightPreparation": { "provider": "google-photorealistic-3d-tiles", "sampledOn": "2026-10-16", "…": "…" }
  },
  "pose": { "headingDeg": 0, "pitchDeg": 0, "rollDeg": 0, "aligned": false, "provenance": "…" }
}
```

- **`id`** is the panorama's id in the scene, and the name of its media folder. Changing an
  id breaks links other people have saved, so leave ids alone once the tour is published.
- **`sameImage`** lists the other YouVisit panoramas that are the same photograph.
  - YouVisit often uploaded a photograph again under a new id, sometimes with different
    bytes. The build refuses byte-identical files that are not listed together.
  - Re-encoded copies can't be caught that way. They were found by comparing small
    thumbnails at every rotation and are listed by hand. There are four: Walter Library
    Lobby, RecWell Lobby, RecWell Indoor Track and Huntington Bank Stadium.
  - That leaves 60 distinct photographs among YouVisit's 79 panorama ids.
- **`capture`** is where the photograph was taken. `source` says where the position came
  from, and `horizontalAccuracyMeters` how far off it may be. `height` is the photograph's
  fixed height and `heightPreparation` how it was found; see
  [Heights](#heights-prepared-once-at-build-time).
- **`pose`** is which way the image faces. `headingDeg` is the compass bearing of the image's
  centre column. `aligned: false` means nobody has set it yet; it goes into the scene's
  `imagePose`, and the panorama's tab says whether north is set. `provenance` says how it was
  set.
- **`marker`** is optional and overrides where the orb floats. It uses the fields of the
  format's marker, such as `offsetM` for the height above the capture height.
- **`links`** optionally lists additional destination photograph ids. Use **Image links**
  in the editor and `import-links.mjs` to add them. Both builds derive their hotspot
  directions from the fixed capture locations and preserve the original tour links.

### Positions: approximate

YouVisit stored one hand-placed point per stop, not per photograph. Every position here is
therefore approximate, and each entry says which kind it is:

| Kind | Count | Accuracy given |
| --- | ---: | ---: |
| A stop's main view, at YouVisit's point for the stop | 24 | 65 m |
| At the stop's point, which lies on the building the photograph shows | 19 | 60 m |
| Moved to the centre of the building or place it names, from OpenStreetMap | 12 | 50–100 m |
| Not placed: somewhere in or near its stop | 5 | 150 m |

- **YouVisit's two positions for a stop disagree.** Its tour point and its map position differ
  by 14 m for a typical stop and 65 m at most.
- **A stop point can miss the photograph by more than that.** Northrop Mall's point is about
  80 m east of where the photograph appears to have been taken, judging by the directions to
  Northrop and down the mall.
- **YouVisit's map misplaced two retired stops.** McNeal Hall and St. Paul Mall sat 3.4 km
  west of the Saint Paul campus. They are now at McNeal Hall and the Saint Paul campus mall.
- **Building centres are from OpenStreetMap,** © OpenStreetMap contributors, ODbL 1.0, as of
  2026-09-28.

Panoramas that share a point have their orbs spread on a 15 m ring around it, so each can be
picked. The ring moves only the orb, not the recorded position.

### Heights: prepared once, at build time

Every photograph carries a fixed height in metres above the WGS84 ellipsoid, and its orb is
placed from it (`capture-relative`). The viewer never samples the map for these orbs, so map
detail arriving or changing never moves them. `npm run build` stops if a placement lacks a
height or a scene disagrees with `placements.json` (`npm run check:heights`).

`npm run prepare:heights` finds heights for photographs that have none, or whose position
moved since their height was prepared, and leaves the rest alone, so a repeat makes no
network requests. It uses FOSS Earth's `foss-earth-prepare-heights` (`@foss-earth/engine`):

- **Google Photorealistic 3D Tiles first.** The height is the top of the finest geometry
  Google serves on the vertical through the position: on campus, leaf tiles with a 2 m
  geometric error, which is recorded as the uncertainty. Google's coordinates are already
  WGS84, so there is no datum conversion. The key is `FOSS_EARTH_GOOGLE_KEY`, read from the
  environment or from `.env.local` here, in `~/gh/foss-earth/app` or in `~/gh/0sfs/fly`. It
  is sent as a header, never written anywhere, and no Google responses are kept.
- **USGS 3DEP with GEOID18 only when Google can't serve a point** (no key, refused, no
  coverage, or nothing finer than 4 m). The record says why. It is bare earth, with a 5 m
  allowance for treating NAD83(2011) as WGS84. `--retry-fallbacks` tries Google again for
  those; `--no-fallback` fails instead.
- **A height set by hand or in the placement editor is never replaced.** `import-poses.mjs`
  accepts an editor height change with `--reference` and records it as `provider: "editor"`;
  a height typed into `placements.json` should use `provider: "manual"`.

`--refresh` prepares every build-prepared height again. A failure writes nothing.

The positions are approximate, so a height is the surface at the recorded position, not a
measured camera height. Where the position is on a building, that surface is the roof: on
open ground the 2026-10-16 heights agree with USGS bare earth to about 1 m, while those on
buildings are 15–31 m above it. Correct a photograph's position or height in the placement
editor and import it.

### North: not set

No panorama has its north set yet. YouVisit re-encoded the images and dropped any orientation
the camera recorded, and its data has no compass headings. Until a heading is set, the photograph
turns with the wrong side toward north:

- **Outside:** an orb shows the wrong part of the photograph from a given side.
- **Inside:** the view is fine, but it doesn't line up with the map.

Links and start views are stored in the scene relative to north, so the build recomputes them
whenever a heading changes.

To set one:

1. Find two or three landmarks in the photograph whose positions are known, such as buildings
   or corners on OpenStreetMap, and read the image heading of each.
2. Solve for the capture position and the heading together. One landmark is not enough,
   because the stop points can be tens of metres off.
3. Write `headingDeg`, set `aligned: true`, and say how it was done in `provenance`.

## How YouVisit's directions were converted

[`youvisit.mjs`](youvisit.mjs) implements these rules, and
[`youvisit.test.mjs`](youvisit.test.mjs) checks them against the measurements. They were
measured against the backup's screenshots of YouVisit's viewer
(`.local/youvisit-backup/snapshot-*/viewer/`). Each screenshot's view was fitted to its
panorama image pixel by pixel.

- **Hotspots.** A hotspot's `coordinates` `{x, y}` are YouVisit's spherical angles `phi = x`
  and `theta = y`, taken from its viewer code.
  - Direction: azimuth `atan2(cos x, sin x · cos y)` and elevation `asin(sin x · sin y)`.
  - The azimuth is the image column, measured from the left edge as `u × 360°`.
  - All 35 hotspots visible in the screenshots landed within 0.61° of azimuth and 0.12° of
    elevation of where YouVisit drew them.
- **Start views.** A start view's `start_lon` is that same azimuth less 32.25°. 21 of the 23
  screenshots agree to ±0.25°. In the other two the view had already moved when the
  screenshot was taken.
  - `start_lat` is the elevation.
  - `start_fov` is the vertical field of view. When it is empty, YouVisit shows 100°.
- **Headings.** FOSS Earth's image heading is 0° at the image's centre column, so it is the
  azimuth less 180°. The scene then turns it by the photograph's `pose`.

## Viewing it

`npm run dev` opens the tour with this scene; see the [README](../../README.md). After a
rebuild, reload the page.
