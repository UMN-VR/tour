# Twin Cities tour: roadmap

The new tour goes at <https://umn-vr.github.io/tour/twin-cities/>. It is built on FOSS Earth
from the backup of the old YouVisit tour, <https://www.youvisit.com/tour/60288/>.
[tools/twin-cities/README.md](../tools/twin-cities/README.md) explains how the scene is built.

Work that needs more than a few lines has a prompt in this folder, `*-prompt.md`, to start a
fresh conversation with. Work that FOSS Earth owns has its prompt there.

## Done

- **Backed up the YouVisit tour** (2026-09-27) into `.local/youvisit-backup/`, before it is
  taken down.
- **Put the 360° photographs into a FOSS Earth scene** (2026-09-27). The scene has:
  - 60 distinct photographs, from 79 YouVisit panorama ids;
  - 23 stops, plus 4 retired ones;
  - YouVisit's hotspot links, and its start views.
- **Made this repository an app on FOSS Earth, like 0SFS:** `npm run dev` runs the tour.
- **Each panorama opens as a tab, at full detail** (2026-09-27). FOSS Earth's part is in its
  `docs/proposals/panorama-scenes.md`, "After the second user trial". Here, the build publishes
  YouVisit's full 6144 px width too: 151 MiB more, 266 MiB in all. Not yet tried by hand.
- **Photographs load as tiles** (2026-10-03). Inside a panorama, each photograph arrives as
  tiles of an equi-angular cube, only those the view needs, over the orb's preview, so it
  sharpens in a second or two rather than after the whole image. 360 image settings →
  Representation switches between equi-angular tiles, ordinary cube tiles and the whole image,
  and the Renderer tab between WebGPU, WebGL2 and WebGL; see the [README](../README.md). FOSS
  Earth's [progressive 360° prototype](https://github.com/foss-earth/foss-earth.github.io/blob/main/benchmarks/eac-progressive-prototype/REPORT.md)
  measured the design, and its published package was tried by hand and reported working (the
  device was not recorded); the production version was checked
  headlessly on all three renderers. Deployed 2026-10-03, the app first and the content ten
  minutes later; on the live site, at a phone's viewport on a desktop connection, Northrop Mall's
  view was covered by its tiles in 0.5 to 1.1 s on WebGPU, WebGL2 and WebGL. Not yet tried by
  hand on a phone in production.

- **Each image is downloaded once, and the map loads what it shows** (deployed 2026-10-03,
  the app first and the content eleven minutes after it was live). Use of the deployed tour
  showed tiles loading again on a look back, every orb's previews downloading again on each
  visit, and the map asking for 720 files. FOSS Earth now keeps every image in the browser
  under its revision, holds all of a panorama's tiles on the GPU where the device has room,
  loads an orb's sharper preview only when the orb is drawn that large, loads
  a panorama's tiles while the camera flies in, and shows every orb from one 445 KiB image,
  which this build now makes. A first visit to the map asks for one image where it asked for
  720, and a reload for none; [content-delivery.md](content-delivery.md) has the measurements.
  A service worker keeps the app's own files, which GitHub Pages had sent again after ten
  minutes, and on a device with little memory the GPU holds the view and the disk the rest.
  On the live site the first visit asked for one image and showed all 60 orbs after 5.2 s, the
  app's first download included, and a reload asked for nothing.
  The north button not following the view inside a 360 image is reported in FOSS Earth's
  `bugs/north-button-in-panorama.md`.

- **Tried on two phones the same evening, which found two faults** (fixed in FOSS Earth; the
  content deployed that night, the app on 2026-10-04). Firefox on Android drew every orb
  black, and an iPhone still showing the day before's page refused the scene for its preview
  sheet. [content-delivery.md](content-delivery.md) has both, what each published app does
  with the rebuilt scene, and the live site in Firefox and in Safari's engine after the fix.
  Not yet tried again on either phone.

- **The tour says what went wrong** (deployed 2026-10-04). Settings → Diagnostics → Copy
  report, or `?report` in the address, gives the version, the renderer, the settings changed
  and what the visit did; a visit that stopped without being closed is reported by the next
  one. See [which-version.md](which-version.md).

## Next

1. **Review and prioritize low-end 360° performance before wider release.**
   The photographs are the reported main bottleneck; their loading now comes in tiles, which
   leaves drawing and the globe behind them. The
   [WebGL performance review](webgl-performance-review.md) records the findings, expected
   performance and UX tradeoffs, and links the shared FOSS Earth optimization catalogue.
   Implementation choices and device qualification remain open.
2. **Verify responsive loading on the deployed phone tour, and separate content hosting.**
   The first deployment exposed a long deployment and a blank/loading scene on the phone.
   On 2026-10-03 the page kept crashing on an iPhone XS Max (iOS 18.2.1, WebGPU turned on in
   Safari's feature flags), and on 2026-10-04 it stopped after five minutes: both times the
   phone was running the app of 2026-10-03 00:33 from Safari's copy of the page, so no app
   since has been tried there ([content-delivery.md](content-delivery.md), "The phones the
   day after"). Reload the tab on the phone and read the log's first line
   ([which-version.md](which-version.md)) to be sure which app it is, and then find out
   whether the current app still crashes, and whether `?renderer=webgl2` does. The report
   ([bug-reporting.md](bug-reporting.md)), or `?report` after a crash, says which renderer
   ran and where the page was. After the release that follows the one with FOSS Earth's version check, come back to
   the tab and see whether the page reloaded itself. Safari's engine
   runs the tour in a check on a Mac, with WebGL 2 only; nothing checks WebGPU in Safari or a
   phone's memory.
   On a phone as narrow as that one the log and the tab window do not both fit; FOSS Earth's
   TODO has the log becoming a tab there.
   Tiles are deployed but not yet tried on a phone: enter a panorama on the phone's own network
   and note how long until it looks sharp, as against "Whole image" in 360 image settings. The
   tiles are 22 to 37% larger than the prototype's, because of FOSS Earth's JPEG encoder (its
   panorama proposal, "Built"); encoding them as the prototype did would win that back.
   The content is now 661 MiB of the 1 GB Pages site limit.
   App-only releases now avoid copying scene media locally; Pages still builds the whole site.
   See [content-delivery.md](content-delivery.md) for the format, current commands and the
   remaining independent-content-origin boundary.
3. **Set north and correct the positions of all 60, and place the five that aren't placed.**
   Prompt: [placements-prompt.md](placements-prompt.md). By hand, 60 photographs is slow.
   FOSS Earth's TODO.md has the tools that would make it quick:
   - blending a 360 image with the map from its capture point;
   - moving an orb on the map with handles;
   - turning and nudging a photograph from inside it;
   - clicking the same point in the photograph and on the map to solve the heading and
     position.

   Their edits are exported as JSON keyed by scene entity id. The tour's part is a script in
   `tools/twin-cities/`, with a test, that merges such an export into `placements.json`:
   - map each entity id back to its YouVisit key;
   - write the position and `horizontalAccuracyMeters`;
   - set `aligned: true`;
   - write a `provenance` and `source` that say the tool, what it was checked against
     (Google 3D tiles, landmarks) and the date.

   Rebuild with `npm run build:scene` afterwards.
4. **Put the rest of the tour on the map:** photos, videos, narration and hotspot text. Prompt:
   [tour-media-prompt.md](tour-media-prompt.md).
5. **Add a Minneapolis and a Saint Paul scene beside the Twin Cities one.** The photographs sit
   in two clumps 3.1 km apart with none between: 48 around the Minneapolis campus, in 18 stops,
   and 12 on the Saint Paul campus, in 5. Keep the Twin Cities scene as it is, for anyone who
   wants one map of both campuses, and add a scene for each campus holding only its own
   photographs, so each loads and draws less: pages at `/tour/minneapolis/` and `/tour/st-paul/`
   beside `/tour/twin-cities/`. Still to settle:
   - The new scenes name the photographs already published and copy none: the content is
     661 MiB of the 1 GB Pages limit. FOSS Earth's `check-scene.mjs` reads media only from the
     manifest's own folder, so either the three manifests share a folder or that check learns
     to read a site.
   - Four Next and Previous stop links cross between the campuses (stops 12 and 13, 17 and 18),
     and a scene refuses a link to a photograph it does not hold.
   - "Earlier tour stops" has two photographs on each campus, and the Saint Paul stops are
     numbered 13 to 17.
   - The Commons Park and Stone Arch Bridge, stop 20's two photographs, are in Minneapolis but
     off the campus, 1.5 km and 1.1 km from the nearest photograph on it. The other 46 span
     1.6 km by 1.0 km.
6. **Make the hybrid map the tour's default:** Google 3D tiles on the campus and a free basemap
   around it. It waits on FOSS Earth's areas and hybrid map (its `TODO.md`). The areas are this
   tour's, one or more around each campus, drawn in FOSS Earth and kept here. The tour's page
   carries no Google key, so a visitor sees Google's tiles only with a key of their own;
   whose key goes in the page, if any, wants deciding first.

## Also open

- **Copy `.local/youvisit-backup/` to storage the U keeps,** such as University Google Drive
  or Box. For now it exists only on this laptop, and it is the only copy of the old tour.
- **Ask the U for the Welcome stop's narration script and audio.** YouVisit has the text only in
  Spanish, and that Spanish audio file is missing.
- **The accessible version of the new tour,** like YouVisit's
  <https://www.youvisit.com/tour/ada/umn/80239?tourid=tour3>. The backup has YouVisit's in all
  four languages, in `ada/`.
- **Update the UMN VR landing page** (`index.md`). It dates from when the club started.

## What the tour uses from the backup so far

The backup's own README, `.local/youvisit-backup/README.md`, lists everything in it and what
YouVisit's data is missing.

| In the backup | Count | In the tour |
| --- | ---: | --- |
| Panoramas, 6144 × 3072 | 79 ids, 60 distinct photographs | All 60, at 2048, 4096 and 6144 wide |
| Stops and their order, hotspots, start views | 23 stops, 4 retired | All |
| Descriptions | One per panorama | As plain text |
| Positions | One point per stop | Approximate; see [placements-prompt.md](placements-prompt.md) |
| Photos, as uploaded | 149 | Not yet |
| Narration | 105 files in four languages | Not yet |
| Videos YouVisit hosted | 3, with captions | Not yet |
| YouTube videos, on the U's channels | 45 | Not yet |
| Narration text, the route, labels, action buttons | In `api/` | Not yet |
