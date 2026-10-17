# Image linking and placement corrections: handoff

Saved on 2026-10-15 (America/Chicago). The export filenames and timestamps use
2026-10-16 UTC. Work stopped at the user's explicit request. Do not continue
implementation from this thread; this document is for a new conversation.

## Request and latest direction

The user supplied placement-editor exports #3–#9 and a second layer export.
They wanted the corrections incorporated, two nearby photographs on the UMN
mall connected, and UI to create image links themselves. Scholars Walk should
use the indoor layer because Google's mesh encloses it, despite being outdoors
in real life.

**The latest UX instruction is that linking belongs in the existing Scenes
tab.** An initial implementation used a separate Image links tab. That wiring
has now been removed and replaced by a **Scenes → Image links** section. This
last relocation has not yet been validated. Do not recreate the separate tab.

## Repository boundaries and instructions

The checkout root `/Users/felg/gh/UMN-VR` is not itself a Git repository. Its
children are separate repositories. Relevant repositories are:

- `/Users/felg/gh/UMN-VR/tour`: tour UI composition, placements, importers, builds.
- `/Users/felg/gh/UMN-VR/twin-cities`, `minneapolis`, `st-paul`: generated scenes.
- `/Users/felg/gh/foss-earth/app`: generic editor integration and browser storage.
- `/Users/felg/gh/foss-earth/scenes`: live scene link API and panel sections.
- `/Users/felg/gh/foss-earth/sphere-image`: updating viewer navigation actions.
- `/Users/felg/gh/UMN-VR/app`: legacy placements mirror, written by import-layers.

Read each relevant AGENTS.md and the shared organization rules in
`UMN-VR/.github/AGENTS.md` and `foss-earth/.github/AGENTS.md` before resuming.
Generic globe features belong in FOSS Earth; tour data/builds belong in tour.
Do not edit generated scenes directly. Do not discard pre-existing edits.
Keep scratch artifacts in gitignored `build/`. Do not start servers or deploy
unless asked. No subagents were requested or used. No commits or real deploys
were made. The existing localhost:5173 server was left alone.

## Placement and layer data: completed

The exports overlap cumulatively. There are **nine distinct pose corrections**.
Three (Residence Life & Dining, Superblock, Superblock Outdoor Area) were already
present in placements at the start. Importing the latest #9 added these six:

- Folwell Hall
- Golden Gopher Spirit: Athletics
- Huntington Bank Stadium
- Northrop Auditorium
- Northrop Mall
- Washington Avenue Walking Bridge

Import commands already run:

```sh
node tools/twin-cities/import-poses.mjs --input 'umn-tour-poses-2026-10-16#9 .json' --reference 'User geolocation and orientation corrections from placement editor exports #3–#9' --write
node tools/twin-cities/import-layers.mjs --input 'umn-tour-layers-2026-10-16 #2.json' --write
```

The layer import moved `wall-of-discovery-scholars-walk` to `indoor-360`, updated
placements, regenerated scenes, and copied placements into the legacy UMN-VR/app
mirror. Earlier layer corrections were already present in tour placements.
The original user export files remain untouched and untracked in the tour root.
No orientations were promoted to checked north: exported `aligned: false` stays
false. Explicit editor heights retain editor provenance.

An ordinary first pose rebuild failed because the default YouVisit backup path
was absent. The original image-local hotspot/start data was found here:

```text
/Users/felg/gh-archive/UMN-VR/UMN-VR.github.io-archive/.local/youvisit-backup/snapshot-2026-09-27
```

Successful rebuild:

```sh
npm run build:scene -- --poses-only --backup /Users/felg/gh-archive/UMN-VR/UMN-VR.github.io-archive/.local/youvisit-backup/snapshot-2026-09-27
npm run campus-scenes
npm run check:heights
```

The backup was read only. Published directions were not inverted. Subsequent
rebuilds with unchanged poses need no backup. All 60 fixed heights pass the
check: 51 Google-prepared and nine editor-set.

Northrop Mall and Northrop Auditorium are the inferred pair, about 71 m apart
after correction. Both now list the other in their placement `links` array.
Both directions are generated into the Twin Cities and Minneapolis scenes.
The final Twin Cities revision after adding links is `16de80edd9d7`.

A read-only comparison verified all nine latest exported numeric poses against
placements, both reciprocal Mall links with hotspot directions, and Scholars
Walk's indoor membership in both consuming scenes.

## Implementation currently on disk

### FOSS Earth app

New `src/app/linkEditor/` files:

- `linkOverrides.ts`: additive per-scene-URL links, localStorage, JSON export,
  bidirectional additions, removal/reset, geographic distance/bearing/pitch,
  validation of stored records, session fallback, concurrent-write protection.
- `editor.ts`: From/To selectors, nearest destinations first with distances,
  Link both ways checkbox (default on), Add link, current links with follow and
  Remove, Download links, Copy JSON, Reset this scene.
- `link-editor.css`: wrapping controls and content-sized selectors.
- `linkOverrides.test.ts`: persistence/reload, scene isolation, invalid links,
  storage failures, UI add/remove/follow, date-line geometry.

Storage key: `foss-earth.link-overrides.v1`.
Export format: `foss-earth-link-overrides`, version 1.
Each scene has `sceneId`, canonical `sceneUrl`, and edits containing `entityId`,
`title`, `authoredRevision`, `updatedAt`, and `links` with target/label/optional
direction. Additions preserve authored tour links. Saving is local, not publish.

`src/app/sceneHost.ts` creates link overrides on ordinary visits too, so saved
links still work without editing enabled. Controls use the same gate as layer
arrangement: local development or exactly one `dev=1`, excluding test mode.
The current integration passes the editor to `createScenesPanel` as a
contribution `{ section: "links", title: "Image links", ... }`.
`createGlobeApp.ts` forwards optional `linkExportPrefix`. The tour sets it to
`umn-tour-links` in `mountTour.ts` and its startup test expectation.

The separate-tab changes were removed from `GlobeOverlay.tsx`,
`WindowOverlay.tsx`, and `GlobeAppHandle`. GlobeOverlay no longer has a diff;
WindowOverlay still has unrelated edits that predated this task.

### FOSS Earth scenes and sphere-image

Scenes adds `SceneHandle.setAdditionalLinks(entityId, links)` and an optional
viewer `updateActions` port. The implementation validates local targets,
prevents self-links/duplicates, preserves authored links, updates viewer actions
without reloading media, and uses effective links for status/follow/hotspots.
Additional links reset on scene replacement. Runtime-generated link ids are
`editor-link-<target>`.

`scenes/src/panel.ts` was just changed to accept contribution section `links`,
rendered **after Content and before Orbs/other contributed settings**, collapsed
by default. This is the final unvalidated change made for the user's UX request.

Sphere-image adds optional `ImageViewer.updateActions`. It snapshots only the
actions, emits a viewer update, and requests a frame, retaining current media
and the active visit. `snapshotActions` is shared with initial input validation.

Coverage was added in `scenes/tests/sceneHandle.test.ts` and
`sphere-image/tests/viewer.test.ts` for live updates, navigation, invalid targets,
removal, authored-link preservation, immutable metadata, and no media reloads.

### Tour import/build path

- New `tools/twin-cities/import-links.mjs`: dry run by default, `--write` imports
  additive destination ids into source placement `links`; rejects invalid,
  duplicate, self, unknown, or cross-campus targets atomically; idempotent.
- New `scene-links.mjs`: derives added hotspot bearings/pitches from fixed
  capture coordinates/heights. Original links remain; coincident captures get
  list-only links. Generated ids are `image-link-<target>`.
- `scene-pose.mjs` and the full `build-scene.mjs` both apply placement links.
  Removing a destination id from placements removes its generated link on rebuild.
- New `import-links.test.mjs` covers import and rebuild behavior.
- Tour README and build README document editor/export/import. FOSS Earth app
  README now says **Scenes → Image links**, reflecting the latest user request.

Workflow for future exports:

```sh
node tools/twin-cities/import-links.mjs --input build/phone-links.json
node tools/twin-cities/import-links.mjs --input build/phone-links.json --write
npm run build:scene -- --poses-only
npm run campus-scenes
```

The full historical media build already had unrelated missing legacy FOSS Earth
script paths; the working pose-only path was used. Do not expand scope into that
pipeline merely because this document mentions it.

## Completion (2026-10-15, second session)

The Scenes → Image links relocation was validated and the review notes below
were resolved. No separate Image links tab remains anywhere in app, scenes or tour.

- Composition: `scenes/tests/panel.test.ts` checks that a host's `links`
  contribution sits straight after Content, collapsed, ahead of image settings,
  and that duplicate sections are rejected. That check now runs before the panel
  adds window listeners or panel storage, so a rejected panel leaves nothing behind.
- Setup failure: `sceneHost.ts` also registers the link editor's `destroy` in
  `cleanup` (it is idempotent), so a throwing `createScenesPanel` cannot leak its
  subscriptions.
- Persistence: on load, saved additions the scene now authors are pruned and the
  pruned document is persisted. They are no longer offered for Remove or exported.
- Geometry: live directions are recomputed from the loaded scene's captures when
  applied, so a saved direction cannot outlive a republished pose. No
  pose-editor capture accessor was added: exports carry only destination ids and
  the tour build recomputes directions from placements, so an unpublished pose
  edit affects only the in-session hotspot preview. Adding one would need new
  API on the pre-existing uncommitted pose-editor work.
- Final `npm run ci` passed in scenes (157 tests), foss-earth/app (322 tests plus
  browser assertions), sphere-image (180) and tour (75 passed, one skipped; 60
  heights). Logs are in each repository's `build/ci-image-links.log`. The editor
  was still not checked visually in a browser; no server was started.
- Item 6 is unchanged: the legacy UMN-VR/app mirror lacks the two Mall link
  arrays; tour placements are authoritative.

The sections below record the state at the first handoff.

## Validation status

**Before moving controls into Scenes**, complete `npm run ci` passed in:

- tour: 75 tests passed, one skipped; lint, height checks, typecheck and build pass.
- foss-earth/app: 320 tests plus 12 browser-assertion tests; lint/typecheck/build
  and thumbnail chunk checks pass.
- foss-earth/scenes: 156 tests; lint/typecheck/build/public-consumer checks pass.
- foss-earth/sphere-image: 180 tests; lint/typecheck/build/consumer checks pass.

The browser assertions are test-runner assertions, not a new interactive visual
test. CUA reported no available browser surfaces, so the editor was not visually
checked. A pre-existing dev server listens at localhost:5173. Do not start one
without permission. No test/build processes remain pending from this thread.

**The final relocation into Scenes has not been tested.** It changed scenes'
panel contribution union/order, app sceneHost composition, removed separate-tab
wiring, and updated docs. Recheck those changes and test section composition.
Do not claim the final UI placement has already passed CI.

## Resume priorities and review notes

1. Confirm the latest Scenes integration is sound and add/adjust meaningful
   panel composition coverage for its links section. Verify that no separate
   Image links tab remains.
2. Run focused checks, then appropriate final CI for the changed composition and
   consuming tour. Full earlier passes are recorded above; sphere-image has not
   changed since its successful final CI.
3. Review the new link persistence behavior before calling it finished. Saved
   additions that later become authored links currently remain in storage; the
   live scene deduplicates them, but the UI may still offer Remove for a locally
   stored duplicate that is now authored. Pruning only known published additions
   on load, with coverage, is a possible fix. It was considered but not done.
4. Live link geometry and sorting currently read scene status captures. Placement
   editing may update viewer metadata before scene status reflects it. Consider
   whether an injected current-capture accessor is needed, with practical coverage;
   no such accessor was implemented. Imported canonical positions are correct.
5. The editor cleanup currently belongs to the panel contribution. Review cleanup
   if `createScenesPanel` throws during setup; the earlier independent cleanup
   registration was removed while moving the editor into the panel. Do not lose
   subscriptions on an exceptional setup path.
6. The legacy UMN-VR/app placements mirror was last synchronized by import-layers
   before adding the two Mall link arrays; tour placements are authoritative.

Do not repeat imports blindly or delete the export files. Preserve all existing
uncommitted work. There were extensive unrelated changes when this task began:

- tour: `import-layers.mjs`, `import-poses.mjs`, `import-poses.test.mjs`, placements,
  and all user exports. The three Superblock-area corrections and earlier layer
  assignments were already applied.
- foss-earth/app: openingView, pose editor/math/store/overrides/file code and
  tests, sceneHost, sceneWorld and tests, WindowOverlay and its new test,
  poseEditSession and its new test. This task added only targeted sceneHost
  integration alongside those edits, plus the new link editor and related options.
- sphere-image: settings, viewer, and viewer tests were already modified. Our
  additions share viewer.ts and viewer.test.ts; do not revert their earlier work.
- scenes was clean before this task.

Nothing has been committed or published. The user asked to stop all task work
and retain this handoff, so implementation must wait for the new conversation.
