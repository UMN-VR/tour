# Handoff: correct tour photographs on a phone and bring the corrections back

Implement this proposal in the existing FOSS Earth editor and the UMN tour
tools. The outcome is a complete correction workflow: edit the published tour
on a phone, retain edits across reloads, export them, review a local import,
and regenerate the three tour manifests without re-encoding photographs.

Do the implementation and automated validation now. A real phone export is
not a prerequisite for writing or testing the importer. Use fixtures until a
real export exists; do not invent corrections to the actual placements. Live
deployment and the human correction pass remain separate steps.

Read the applicable `AGENTS.md` files in each repository before changing it.
Preserve other uncommitted work and the YouVisit backup. Follow the existing
package boundaries: globe/editor behavior belongs in FOSS Earth; mapping the
tour's entity ids to its placements belongs in the tour. Do not copy or
deep-import FOSS Earth implementations into the tour.

This handoff includes starting temporary local verification servers when
needed, and stopping servers started for this task. It does not authorize a
deployment. Finish with changed files, checks/results, exact correction-pass
commands, and checks that still need a physical phone.

## Existing implementation and constraints

The editor is `foss-earth/app/src/app/poseEditor/editor.ts`, mounted by
`app/src/app/sceneHost.ts`. Keep it; do not build a second editor in the tour.
It edits capture longitude/latitude, heading/pitch, marker `offsetM` for
ground-relative scenes, and capture height for capture-relative scenes. Roll
is read-only. See-through opacity and the red/blue arrows' own heading remain
session-only.

Today the mount is inside `import.meta.env.DEV`, so production removes the
dynamic import. `poseEditEnabled` also takes a dev-build boolean. Replace
that with the search string alone, using `wantsDev` from `@foss-earth/dev`:
exactly one `dev=1` enables the editor. Missing, empty, `dev=true`, and duplicate
`dev` parameters do not. Keep `import.meta.env.MODE !== "test"` at the mount.
The diagnostic Dev tab is already available on Pages and is a separate path.

`sceneWorld.setPoseEdit` changes placement and image orientation. The editor
also calls `viewer.reposition` with the placement and capture coordinates.
That second operation updates capture details and the active panorama's
frozen placement/presentation. Restoring an override without the editor must
perform both operations through the same coordinator. Moving only the orb
is insufficient.

The scene world keys live edits by entity id, not scene id. Its instance can
outlive a loaded scene. Clear the previous scene's live edits on transitions,
including when the editor is absent. Scene `generation` is a load-attempt
counter: a failed/pending replacement can change it while the old scene still
exists. Do not mistake that alone for a successfully replaced scene.

Local save is `POST /__foss-earth/pose`. Its Vite plugin is `apply: "serve"`
and accepts `*.scene.json` within the app's public directory. The tour's
`scene.json` files do not qualify. Keep this route and its restrictions for
FOSS Earth's local scenes. Do not add a server, login, or tour save route;
the browser edits only its own state. Hide the inapplicable Save action on
tour scenes and offer Export instead. Keep "Save place" for eligible local
files, including its existing tests and behavior.

| Published page | Scene document id |
| --- | --- |
| `/tour/twin-cities/` | `umn-twin-cities` |
| `/tour/minneapolis/` | `umn-minneapolis` |
| `/tour/st-paul/` | `umn-st-paul` |

An entity id such as `northrop-mall` is the `id` on a photograph's placements
entry, not the YouVisit number that keys `placements.json.panoramas`. Campus
scenes are subsets of Twin Cities: one photograph can occur in two scenes
but maps to one canonical placement.

Localhost and Pages have separate storage. Export brings phone work to the
laptop. A URL flag is not authentication: anybody can open the editor, but
nobody can change the published tour through it.

## Required behavior

### Production gate and loading

Open `https://umn-vr.github.io/tour/twin-cities/?dev=1`, or a campus page with
that flag. Existing Placement controls and the gizmo become available. Move
the dynamic import outside the Vite dev-build condition. Visitors without
the flag must not download the editor chunk or its CSS.

The small override reader/coordinator loads independently of the editor.
Saved overrides apply on reload and without the flag in the same browser.
An empty store leaves published values unchanged. Read storage when the
host initializes and immediately before guarded writes, not on frames or
every status event. All controls stay in
the existing photograph tab; do not add a floating panel.

### One state owner, with persistence as a backing store

Create one in-memory override store per host, shared by host and editor.
`poseStore.ts` has no globals, DOM or network: inject storage and time.
Separate pure parsing, validation, normalization, equality and export from
browser integration. The editor must not instantiate another store or reload
disk state from `remember()`.

Memory is the source for drafts, counts and exports, including when saving
fails. Catch failures obtaining `window.localStorage` and calling `getItem`,
`setItem` or `removeItem`; startup and editing must still work. Keep state
exportable and show a persistent status such as "Edits are in this session
only. Export before leaving." A failed Reset/Clear must not claim persistence
across reloads.

Update memory on every valid pose change. Coalesce disk writes to about
300 ms during a drag, with a maximum wait so continuous dragging also saves
periodically. Flush on pointer-up, pointer-cancel/lost capture, committed
number changes, Export/Download/Copy, scene transitions and normal disposal.
Best-effort flush on `pagehide` and visibility becoming hidden; this cannot
guarantee recovery after a process crash. Export uses the latest memory even
if persistence fails. Do not persist opacity or arrow heading.

Timers write the current snapshot, not old captured drafts. Reset, Clear and
transitions cancel obsolete drag/timer work. Old callbacks must not restore
a reset edit or mutate a new scene. Returning an edit to baseline removes it
unless the desired alignment still differs from the published value.

Treat missing storage as empty. For a nonempty malformed/future payload,
preserve the raw value, report the problem, and block automatic replacement
of that key. New session edits remain exportable. For a supported
payload with some invalid entries, retain valid entries and report skipped
records; preserve the original payload until explicitly replaced rather than
silently rewriting it with the invalid records removed. Disclose these
omissions during export.

In that condition, ordinary scene Clear changes only the in-memory scene and
reports that persistence remains blocked. A separate "Replace unreadable saved
data" action, confirmed on a second tap, may replace the whole key with the
current valid memory snapshot, keeping all valid scenes/session edits. Explain
that unreadable records will be discarded and offer Copy original saved text
before replacement. Never interpret ordinary scene Clear as permission to
erase other scenes or unreadable records. Reset retains the same limitation.

Support one authoring tab per origin initially. Observe `storage` events for
the key, and compare `getItem` with the last acknowledged raw payload immediately
before writing (including removals/replacements). If another tab changed it,
preserve local drafts and pause automatic
writes; show "Saved edits changed in another tab. Export this session before
reloading." The write guard catches changes whose storage event has not yet
arrived; it is not a transaction/lock for simultaneous authors. Do not claim
concurrent editing support. Use one tab for the correction
pass. No-flag viewers must not rewrite the key merely to prune matches;
pruning stays in memory until an editor persists a deliberate mutation.

### Scene application and editor lifecycle

Use one host coordinator (for example `poseOverrides.ts`) to apply/clear live
poses, capture baselines, handle placement-ready updates and reposition the
viewer. The editor submits mutations to it. Two independent subscribers must
not clear and replay each other's edits. Editor mount/dispose must not remove
committed shadows owned by the host.

Key saved scenes by `(sceneId, canonical sceneUrl)`, not revision. Resolve
against the app base URL; strip credentials, query and fragment from the
stored URL, accepting HTTP(S) only. Track the successful load URL outside the
editor gate, including example URLs and replacements. Establish load/URL
identity before applying overrides. The current wrapper sets URL after
`load` resolves, while status may arrive during load: resolve this race.
Ignore failed/superseded load callbacks and retain the old scene's edits when
a replacement fails. Flush/cancel gestures before an attempted replacement;
clear live ids only when the old scene is released or the new scene commits.

For each committed scene:

1. Clear only the previous scene's applied ids, even if the next scene has the
   same entity ids. Mark transition/reentrancy state before clearing/applying.
2. Capture immutable published baselines for supported panoramas before edits
   are applied. Use authored scene/status data, not repositioned viewer details.
   Reset uses the current published baseline.
3. Find overrides for this scene identity. Skip unknown/unsupported entities
   at apply time, but retain them for export with a warning. Do not assume an
   absent entity in this release means its saved correction is disposable.
4. Apply through both `setPoseEdit` and `viewer.reposition`, including capture
   details, when placement and panorama preparation are ready. Handle pending
   terrain without dropping overrides. Preserve active panorama presentation
   and synchronize the presented camera where the existing editor does.
5. Initialize drafts from the same memory state, leaving baselines published.
   In immersive mode select `scene.active` automatically, including direct
   entry, hotspot and history navigation. Active-photo changes cancel gestures
   and restore the previous photo's opacity/session gizmo state.

`setPoseEdit` synchronously triggers status callbacks. Guard against recursive
application. Do not replay saved values on ordinary status changes/frames,
which would overwrite active drags. Deduplicate actual placement/capture
values, not marker coordinates alone; heading/pitch can change without moving
the marker. Keep terrain updates and render-on-demand working. Dispose
subscriptions, timers and pointer captures.

A new committed generation refreshes baselines, not the memory store. HMR
should flush through normal disposal. A hard reload with unavailable storage
cannot recover session-only edits; communicate that limitation. Closing or
stopping the editor must not immediately reopen it merely because the same
immersive photo emits another status. Resume automatically only on a new
photo/navigation or an explicit edit action; define and test that state.

### Published baselines and conflicts

Capture immutable `authored` and `authoredRevision` when the first numeric or
alignment change creates an entry. Further edits retain them. Do not replace
them with new published values when someone nudges an old override.

If current published values differ from that snapshot, retain the absolute
override and mark it as based on an older placement. The importer rejects
that conflict. Reset discards it and starts fresh against the current file.
An unrelated photograph changing must not invalidate this one just because
the whole-scene revision changed.

Retire an override in memory when all desired numeric values and desired
alignment match the published values, and mode/read-only authored roll still
match. A changed roll changes the checked orientation; report it as a conflict
rather than silently pruning that record. A confirmation-only entry must remain
while the file still says north is unaligned. Entries in scenes not visited
remain exportable; the importer performs the definitive comparison.

Use consistent dirty/prune/import equality: normalize and round first; cyclic
distance for longitude/heading; epsilon `1e-8` degrees for longitude/latitude,
`1e-4` for heading/pitch/roll, and `1e-3` meters for offset/height. Null height
differs from zero. Marker mode and authored alignment are explicit conflict
context. Desired alignment is boolean; published null/absent alignment means
unconfirmed, not true. Keep roll read-only.

### Phone controls

Keep mouse right-click arming and short click/tap entering. Add touch/pen
long-press on an editable orb in overview: one primary pointer, about 500 ms,
movement below `input.mouse.dragThreshold`, default 4 CSS px when invalid or
missing. Pick the candidate at press time. Cancel on movement at/above the
threshold, a second pointer, cancellation, lost capture, scene change,
entry/exit or disposal. Drag/pinch/empty-space press must not arm anything.

A completed long-press consumes release so it cannot also enter. The scene
controller records presses on `pointerdown` and calls `enter()` from
`pointerup` without checking `defaultPrevented`. Thus `preventDefault()` alone
is insufficient. Provide a small documented cancellation/consumption mechanism
through the scenes public API, or equivalent tested coordination clearing the
controller's recorded press. Do not leave abandoned pointer ids. Keep mouse
navigation and camera input working; suppress native menus/callouts only for
the editor's handled interaction.

Put `touch-action: none` on interactive handle targets before contact, keeping
pointer events disabled elsewhere on the overlay. Changing it in
`pointerdown` does not affect that active gesture ([Pointer Events](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property)).
Use pointer capture, handle cancel/lost capture, and ignore a second pointer
rather than replacing the drag. Make handle/tab hits practical on a phone
(approximately 44 CSS px targets without invisible areas swallowing ordinary
view navigation). Number fields remain a precise alternative, accept zero,
and reject blank/non-finite text rather than converting blank to zero.

Inside a photo, the active photo is editable when the editor is enabled;
prior map arming is unnecessary. Keep the in-view gizmo and Placement at the
bottom of its tab, respecting the stop/close behavior described above.

### Alignment confirmation, Reset and Clear

Export explicit desired `imagePose.aligned`. Initialize it from published
`aligned === true`. Add "North checked" and "Checked against" in Placement.
Checking records a deliberate confirmation of the final orientation, with a
nonempty reference and UTC timestamp, even if numbers are unchanged. Unchecking
sets desired alignment false and removes that confirmation. This does not
establish a new horizontal accuracy.

Changes to heading/pitch or capture coordinates/height invalidate confirmation
and set desired alignment false; the check depended on that orientation and
capture point. Marker-offset-only changes, opacity and arrow heading preserve
alignment. Changing a numeric value back to baseline does not silently restore
a confirmation that was invalidated; the user can Reset or check again.
A numeric edit without confirmation is exportable with `aligned: false`.
An inherited published `aligned: true` may be preserved for an offset-only edit
without a new confirmation. Setting alignment true from an unconfirmed state
requires the human confirmation record. Never infer it from motion.

Reset removes numeric edits and alignment intent/confirmation, restores the
current published pose/capture in world and viewer, and persists the removal.
It works for confirmation-only entries too.

"Clear saved edits" shows the current scene identity's count and requires a
second tap. Confirmation expires after about five seconds and is cancelled
by another action/scene change. It clears that scene's memory, drafts and
applied edits, leaving other scenes intact. Use the explicit damaged-store
behavior above when the envelope cannot be preserved. Neither action retains
an unsaved stale drag.

### Export, Download and Copy

Put actions with Reset in Placement. With no photo selected, keep saved-edit
count/export/clear reachable in the existing photograph tab. Enable export
for any scene's numeric or alignment changes, including session-only entries.

All actions commit a valid focused number field, take the same normalized
memory snapshot, and attempt synchronous persistence. Serialize pretty JSON
with a final newline, sorting scene identities/entity ids for stable review.
Use `umn-tour-poses-YYYY-MM-DD.json` in the tour, with the export day in UTC.
Keep the generic editor's default prefix `foss-earth-poses`; expose a small
optional prefix through public app configuration and set it in the tour's
`src/tour/mountTour.ts`. Do not hardcode UMN names/ids in FOSS Earth's store or
editor. Include all valid scenes, not just the open campus; disclose
skipped/damaged records and retained unknown ids.

Export may prefer `navigator.share({ files: [file] })` when `canShare` accepts
that exact JSON File. Build it and call share directly from the user's click;
do not await unrelated work. Sharing requires transient activation ([Web Share](https://www.w3.org/TR/web-share/)).
Report cancellation separately and keep edits; do not trigger another action
after cancellation. Resolved share means OS handoff, not verified disk storage.

Always provide independent Download and Copy JSON, even where sharing works.
Download uses a blob URL revoked after the browser can consume it. Say
"Download requested", not "File saved". If clipboard access fails, show
selectable JSON in the tab. Export never clears edits. State the action's
result and remind the user to keep the exported file as a backup.

### Preview limits

The photo rotates and its capture/orb moves live; see-through uses the map
already loaded. Live hotspot directions/opening view stay published; show a
brief hint that they update after import/rebuild. Do not add a second live
hotspot solver in this phase.

Marker east/north are display offsets, including the builder's 15 m ring for
photos sharing a point. They are not capture coordinates. Show capture
longitude/latitude clearly and a brief hint when display offsets are nonzero.
The ring stays published during editing and recomputes at rebuild. Verify
rebuilt output as well as the live preview before a content release.

## Storage and export contract (version 1)

Storage key: `foss-earth.pose-overrides.v1`. Storage has `format`, `version`
and `scenes`; export adds `exportedAt`. No existing implementation of this
proposed format is assumed; establish the final contract and fixtures now.
Unknown future versions must not be treated as writable empty stores.

```json
{
  "format": "foss-earth-pose-overrides",
  "version": 1,
  "exportedAt": "2026-10-14T22:30:00.000Z",
  "scenes": [
    {
      "sceneId": "umn-twin-cities",
      "sceneUrl": "https://umn-vr.github.io/tour/twin-cities/scene.json",
      "edits": [
        {
          "entityId": "northrop-mall",
          "title": "Northrop Mall",
          "mode": "ground-relative",
          "authoredRevision": "the revision loaded when this edit began",
          "updatedAt": "2026-10-14T22:28:00.000Z",
          "capture": {
            "longitudeDeg": -93.2351,
            "latitudeDeg": 44.9764,
            "heightMeters": null
          },
          "imagePose": { "headingDeg": 182.5, "pitchDeg": -1.2, "aligned": true },
          "marker": { "offsetM": 25 },
          "authored": {
            "mode": "ground-relative",
            "longitudeDeg": -93.234272,
            "latitudeDeg": 44.9762821,
            "heightMeters": null,
            "headingDeg": 0,
            "pitchDeg": 0,
            "rollDeg": 0,
            "offsetM": 25,
            "aligned": false
          },
          "verification": {
            "orientation": {
              "checkedAt": "2026-10-14T22:28:00.000Z",
              "checkedAgainst": "Northrop and Coffman landmarks on the map"
            }
          }
        }
      ]
    }
  ]
}
```

The `verification` wrapper and its `orientation` member are required;
`orientation` is null without a new confirmation attached to the final pose.
Desired `aligned: true` requires a valid confirmation or inherited alignment:
`authored.aligned === true` with unchanged heading/pitch/capture coordinates/
height/mode/roll; an offset-only change may inherit it. `authored.aligned`
is boolean/null matching the source and is never a desired value. Treat false
and null alignment as semantically unconfirmed for comparison; unlike height,
that null does not carry a distinct numeric meaning.
`authoredRevision` is per edit because edits can begin on different releases.
`updatedAt` changes on numeric/alignment changes, not reload/export.

Validate desired/authored shape at storage and import boundaries: nonempty
ids/revision, HTTP(S) URL, valid ISO timestamps, permitted mode, required
numeric fields/nullability, boolean desired alignment, and nonempty reference
for confirmation. Do not coerce strings to numbers or null to zero. Reject
duplicate scene identities and duplicate entity ids in one identity rather
than taking last-wins.
Unknown fields must not be copied into placements or treated as file paths.

Round longitude/latitude to 8 decimal places, heading/pitch/roll to 4, and
offset/height to 3. Normalize longitude to `[-180, 180)` and heading to
`[0, 360)` after rounding too: rounding can produce 180/360. Latitude/pitch
are in `[-90, 90]`; reject out-of-range serialized values and all non-finite
values. Authored roll follows the scene range `(-180, 180]`; canonicalize a
valid value rounding to -180 as +180 and compare roll cyclically. Match
`writePose` offset bounds `[-100000, 1000000]` meters. Capture
height is finite/null. Interactive changes can retain existing wraps/clamps;
external readers must not silently repair invalid ranges.

Store mode and do not apply an override when the scene's mode changed.
Generic capture-relative scenes retain the height the editor edits and the
scene's height datum; this format does not change datum/mode. Current tour
markers are ground-relative with null capture height. The tour importer
rejects other modes/non-null heights until the builder supports them.

Not desired/exported: roll, marker east/north/radius, horizontal accuracy,
capture source, pose provenance, links and initial view. Roll appears only
in authored conflict context. Desired alignment is the explicit exception
because a human must be able to confirm a numerically unchanged orientation.

## Tour importer: implement alongside the editor

Add `tools/twin-cities/import-poses.mjs` with a pure planner and fixture tests.
Default to dry run; `--write` explicitly mutates placements. Suggested CLI:

```sh
node tools/twin-cities/import-poses.mjs --input build/phone-poses.json
node tools/twin-cities/import-poses.mjs --input build/phone-poses.json --reference "Campus landmarks checked on the map" --write
```

Allow `--placements <path>` for fixture/offline copies; default to
`tools/twin-cities/placements.json`. `--reference` supplies evidence for numeric
corrections and is required to write those changes. Alignment-only confirmation
uses recorded `checkedAgainst`/`checkedAt`. If alignment is cleared without new
confirmation, provenance says it was cleared, not checked. Use the edit's
`updatedAt` date for numeric corrections, not the later import date. Do not
manufacture evidence or accuracy estimates.

1. Validate the entire export before mutation. Allow only the three known
   scene document ids. URL/title are provenance, not authority: never fetch
   the URL or choose a file from it. Each entity must belong to that campus
   and resolve uniquely by placements entry `id`, not the YouVisit key.
   Detect duplicate ids in placements too.
2. Group edits by canonical placement id. Collapse duplicates only when
   normalized desired values/alignment, authored baselines and confirmation
   presence and checked-against reference agree. Ignore confirmation timestamps
   for equality. Timestamps/revisions may differ; retain source information
   in the report. Reject differing numbers/confirmation evidence, including
   different checked-against references; never silently pick by order,
   scene priority or latest time. For otherwise identical accepted duplicates,
   use the earliest confirmation date and latest `updatedAt` edit date in the
   report/provenance, deterministically. These dates identify the recorded
   edit/confirmation, not an independently verified measurement time.
3. Compute current effective baseline with builder defaults (`ground-relative`,
   `offsetM: 25`, null height when marker overrides are absent). Use the builder's
   alignment default `placement.pose.aligned === true`; compare false/null as
   unconfirmed. Include roll. Check mode and read-only authored roll before
   accepting an already-applied result; a changed roll is a conflict. If the
   complete desired result is published, report "already applied" without
   rewriting metadata, regardless of old authored
   values. This makes import idempotent.
4. Otherwise compare current with immutable authored using the equality rules.
   Report each conflicting field with authored/current/proposed values. A
   whole-scene revision difference alone is not a conflict.
5. Write capture longitude/latitude, pose heading/pitch/explicit aligned, and
   `marker.offsetM`. Preserve roll/existing marker fields. Confirmation-only
   edits set alignment even at zero heading; unconfirmed orientation changes
   clear it. Offset-only changes preserve inherited alignment.
6. Update `capture.source` only for capture-coordinate changes and
   `pose.provenance` for orientation/alignment changes. Name the FOSS Earth
   placement editor, actual reference and relevant date. Preserve useful
   history without leaving "Not placed"/"Not aligned" as the current claim.
   Offset-only changes are display placement: report them without claiming
   capture movement. Keep `horizontalAccuracyMeters`, flagging it for review
   when coordinates change; do not invent a new precision.
7. Print per-entity before/after summaries and accepted/already-applied/invalid/
   conflicting counts. Any invalid/unknown/conflicting input exits nonzero
   and writes nothing, including valid entries. No force/partial-import mode
   is needed. Dry run never writes; it may report missing write-time reference
   as a requirement without hiding the proposed changes.
8. A clean `--write` serializes the full result and atomically replaces the
   requested file through a temporary sibling. Refuse if it changed since
   planning. Preserve unrelated fields/entities/ids/titles/`sameImage`.
   Import must not rebuild or deploy as a side effect.

## Rebuild the manifests the tour actually consumes

This is required. Current `npm run build:scene` checks/calls removed
`scripts/prepare-panorama.mjs`, `scripts/check-scene.mjs` and
`scripts/lib/previewSheet.mjs` under the old FOSS Earth package. The tour
README records that breakage after the package split. It also writes
`tour/public/tour/twin-cities/scene.json`, while Vite packages sibling
`../twin-cities/scene.json` and `campus-scenes.mjs` reads that sibling. Simply
running the old command will not publish corrections.

Add a supported pose-only path, such as:

```sh
npm run build:scene -- --poses-only
npm run campus-scenes
```

Provide fixture/copy overrides such as `--placements <path>`, `--scene <path>`
and `--output <path>` for the pose-only mode. Document defaults: canonical
placements, canonical sibling scene input, and that same sibling as output.
Tests/qualification using a placements copy must not rewrite real scenes.

Refactor shared construction rules for captures, pose, marker grouping,
hotspot directions and initial views so this path and the full builder agree.
The pose-only path can read the YouVisit backup for original image-local
hotspot/start angles. Do not invert rounded published world directions or
create a second heading convention.

Read canonical `../twin-cities/scene.json` and placements. Reuse asset/preview
sheet descriptors, media URLs and content revisions exactly. Do not prepare
images, hash original panorama pixels, regenerate sheets, remove media, or
check for removed preparation scripts on this path. Require unchanged entity/
asset membership; refuse membership changes requiring a full content build.
Preserve unrelated content/extensions/descriptions/groups/links. Recompute
pose-dependent outputs, north/provenance summaries and a deterministic revision.
With unchanged placements, preserve the canonical manifest's semantic content
and revision. Reuse the existing revision calculation; do not manufacture a
new content release merely because a different builder mode ran.

Validate through public FOSS Earth APIs, then atomically write canonical
`../twin-cities/scene.json`. If maintaining a public-folder mirror, document
that explicitly; it cannot be the only updated file. `campus-scenes` then
regenerates Minneapolis/Saint Paul. Production must contain those exact inputs.

Use public package exports/CLIs for tool wiring touched here. Replacements
include `foss-earth-prepare-panorama` from `@foss-earth/image-viewer`, and
`foss-earth-check-scene`/`foss-earth-build-preview-sheets` from
`@foss-earth/scenes`. Full-media pipeline migration is not a prerequisite;
state honestly if that legacy path remains broken and document the tested
pose-only commands. Preserve published photographs.

## Files and implementation order

Paths are relative to each repository. Introduce small helpers where they
avoid duplication, keeping storage/gesture logic out of one giant editor.

| Repository/file | Responsibility |
| --- | --- |
| FOSS Earth app: `src/app/poseEditor/poseGate.ts`, tests | Production URL gate |
| App: `src/app/poseEditor/poseStore.ts`, tests | Validation, normalization, state/persistence, immutable baselines, export |
| App: `src/app/poseEditor/poseOverrides.ts`, tests (suggested) | Scene lifecycle, applying/clearing, viewer synchronization |
| App: `src/app/sceneHost.ts` | Shared coordinator, load identity, editor mount |
| App: `src/app/poseEditor/editor.ts`, CSS/tests | Existing UI, confirmation, export, gestures |
| FOSS Earth scenes: controller/public ports/tests if needed | Consume pointer press without unintended entry |
| FOSS Earth docs: `docs/ui-layout.md` | Placement, persistence/export vs local save |
| Tour: `tools/twin-cities/import-poses.mjs`, tests/fixtures | Strict dry-run/atomic import |
| Tour: `tools/twin-cities/build-scene.mjs`, helpers/tests | Pose-only rebuild into sibling scene repository |
| App public options and tour: `src/tour/mountTour.ts`, tests | Optional export filename prefix, preserving package boundaries |
| Tour: README, `tools/twin-cities/README.md`, `docs/roadmap.md` | Tested workflow and remaining manual steps |

Implement contract/store/import fixtures first, then host integration,
UI/gestures, pose-only regeneration and production checks. Do not edit
generated scenes by hand. Without real edits, rebuild fixtures or unchanged
placements and inspect any generated diff before retaining it. Check semantic
identity and deterministic output; do not replace today's content with a
different reconstruction without understanding the difference.

## Automated acceptance checks

Test the relevant layers: pure store tests cannot prove touch handling or
production chunk loading. Follow each changed repository's required checks.
In the tour run typecheck, related tests, lint and final `npm run ci` once.
Run app `npm run ci` and scenes checks if changed. Report pre-existing failures
with evidence, never as passes.

### Store/state

- Gate accepts exactly one `dev=1` independent of DEV; rejects absent/empty/
  `dev=true`/duplicates.
- Round trip, separate scene identities, multi-scene export and stable sorting.
  Wrong format/version, corrupt/partially invalid stores preserve raw data
  and report their condition.
- Validate desired/authored fields and confirmations; reject non-finite,
  invalid ranges/types/missing fields and duplicate ids. Test heading
  359.99999 rounding to zero, longitude near 180, null vs zero height.
- Storage acquisition/read/write/remove failures leave memory exportable;
  failed removal reports session-only Reset/Clear. Another tab's mutation
  pauses writes and preserves drafts.
- Continuous-drag saves and completion/cancel/export flushes; pending work
  never resurrects Reset/Clear or writes a different scene. Failed-persistence
  edits survive committed generation changes in the same host.
- First authored snapshot/revision survive deploy then nudge; unrelated entity
  changes do not conflict. Zero-heading confirmation exports and retires only
  when published alignment matches; invalidated confirmation never revives.

### Host/editor/pointers

- Restore with/without flag, delayed terrain/preparation, direct immersive
  entry and replacement. Assert world pose, viewer capture details,
  orientation and active presentation, not just orb position.
- Reset/Clear restore world and viewer. Same ids across scenes get only their
  own overrides. Unload/failed/superseded loads retain or clear the right live
  state without discarding memory. Status re-entry cannot loop or replay stale
  drafts over a drag.
- Tap/hotspot/history select the immersive photo; restore previous opacity.
  Stop/close does not immediately reopen; committed shadows remain applied.
- Long-press arms without entering, tap enters, mouse right-click arms.
  Movement/second pointer/cancel/disposal cancel arming. Controller has no
  leftover recorded press after consumption. Camera drag/pinch still works.
- Handle capture/cancel/lost capture terminate cleanly; second finger cannot
  hijack a drag. A browser touch test exercises controller and actual handle
  CSS, not only an isolated timer.
- Blank numeric input is rejected; focused valid input reaches export.
  Heading/pitch/capture changes invalidate alignment; marker offset/opacity/
  arrow heading preserve it.
- Share success/cancel/unavailable/failure preserves edits. Download/Copy
  remain available; failed clipboard access presents selectable JSON.

### Import/regeneration

- Campus memberships map to canonical ids. Unknown scenes/ids, duplicate
  placement ids, unsupported mode/height, malformed export cause no write.
  Identical cross-scene duplicates collapse; contradictory ones fail.
- Field-level baseline conflicts, effective marker defaults, null semantics,
  wrapping and complete-result idempotency. Revision alone never conflicts.
- Coordinate/orientation/offset-only/confirmation-only changes write intended
  fields/alignment; preserve roll, accuracy, unrelated fields and entities.
  Numeric write-time reference is enforced and evidence never invented.
- Dry run/conflict leave input byte-for-byte unchanged; atomic write refuses
  intervening changes. Tests use fixture paths, not real placements.
- Pose-only rebuild uses shared transformations for heading and pitch in
  hotspots/start views; recomputes marker grouping and revision. Stable
  unchanged input; identical asset/sheet descriptors/URLs/content revisions;
  no media work or removed-tool dependency.
- Rebuilt manifests validate; `node tools/campus-scenes.mjs --check` passes.
  `dist/<campus>/scene.json` equals its canonical sibling input.

## Production and phone qualification

Build the tour, then preview built output. Dev mode does not prove production
retains the editor. In a fresh browser profile verify no-flag visits do not
fetch editor JS/CSS and `?dev=1` does. Test the production artifact, not only
the gate. Use the tour's existing linked-source package setup.

In a single tab:

1. Edit a Twin Cities photo's capture, heading, pitch and offset. Confirm north
   against a real reference, reload and verify values.
2. Remove the flag, reload and enter it. Verify corrected position/orientation,
   capture details and panorama presentation.
3. Restore flag, export and inspect latest values, immutable authored baseline,
   offset/alignment/reference. Cancel a share, then Download/Copy without loss.
4. Edit a different Minneapolis photo in the same tab; export both scenes.
   Exercise duplicate-conflict rejection on fixtures rather than accidentally
   creating contradictory real corrections.
5. Keep the export, then Reset/reload and test scene Clear preserves the other
   scene. Verify published values return.
6. Dry-run import against a placements copy, inspect, then write that copy and
   rebuild fixture/copy manifests. Verify altitude, alignment, arrows/start view.

On a physical phone also check long-press/tap/pinch separation, touch handles,
tab/keyboard fit, hotspot entry and an actual file brought to the laptop.
Desktop phone viewport/WebKit is not a physical phone test. Record device,
browser, renderer, app version and results. Follow `docs/which-version.md`
to avoid testing a restored old app.

A phone on the local network can use documented HTTP dev serving with WebGL;
WebGPU and secure-context APIs need trusted HTTPS. Use the README's HTTPS
proxy/tunnel guidance or Pages after a separately authorized deployment.
Do not deploy just to close this checklist or claim unperformed checks passed.

## Human correction and publication sequence

For the fastest consistent pass, edit all 60 from Twin Cities in one tab.
Export periodically and before leaving. Campus pages remain supported, but
corrections to the same photograph in two scenes must agree. Use more than
one landmark to establish position/north: an approximate point can mimic a
heading error.

After a real export exists:

1. Keep it under gitignored `build/`, run import dry run and resolve conflicts.
2. Clean `--write` with actual reference; review placements and retained accuracy.
3. Pose-only build, then campus-scenes; inspect/validate all three scene diffs
   and run required checks.
4. Preview in a clean browser without overrides, verifying regenerated content
   including hotspots/start views.
5. Commit tools/placements/generated manifests in their owning repositories.
   On a separate publish instruction, use documented deploy commands. The tour
   consumes FOSS Earth directly and needs its own deploy even if the FOSS Earth
   site was already deployed. Pose-only changes need no media upload.
6. Load the new scenes on the editing phone; matching overrides retire. Export
   or Reset mismatches so the phone's shadow cannot hide a faulty import.
   Confirm the public result in a fresh browser as well.

Done means the editor, importer and pose-only rebuild are implemented and
validated, with unperformed phone/deployment steps identified. The actual
photographs become publicly corrected after the human pass and an authorized
content release.
