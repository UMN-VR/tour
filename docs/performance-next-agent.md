# Performance implementation handoff, 22 October 2026

The current request authorizes autonomous performance work and long testing,
but asks that very difficult implementations be specified for a stronger coding
agent. These are implementation briefs, not completed improvements. Start with
the [continuation report](performance-continuation.md) and remeasure the remaining
cost after its committed changes. Preserve other agents' uncommitted work.

## 1. Allocate imagery GPU storage for residency, within the existing ceiling

Owner: FOSS Earth engine, with Renderer and Images through their public ports.

The retained phone-viewport tour run allocated a 7776 × 7776 RGBA8 map imagery
atlas with its full mip chain: 307.5 MiB. Its page table was another 16 MiB.
Only 100 prepared page buffers appeared in that page's heap snapshot. That is
evidence to investigate over-allocation, not proof that exactly 100 slots were
resident or that the atlas could be shrunk without peak overlap.

Relevant code:

- `engine/src/terrain/imagery/imageryAtlasLayout.ts`, `planAtlasLayout`;
- `engine/src/babylon/imagery/imageryAtlas.ts`, managed allocation/retirement;
- `engine/src/babylon/imagery/createImageryRuntime.ts`, `atlasRequest`,
  `reallocate`, `publishManaged`, `retireUnusedManagedAtlases`;
- the existing transactional upload tickets and page-table ownership tests.

Separate the configured *logical maximum* from physically allocated capacity.
Do not lower the selector's page allowance because the first physical atlas is
small: that would coarsen imagery. Grow storage when admitted pages need it,
keeping every bound table and its texture/layout consistent until the complete
replacement is ready. Begin by recording actual used, pinned, staged and retired
slots and the minimum safe replacement headroom on the tour.

The migration must retain every sampled mip, gutter, texel and exact page-table
mapping. Reuse the existing ownership/admission model; a refused allocation
keeps the old atlas and waits for availability. It must neither spin nor
redecode/reupload every page on each request. Include both old and new native
storage in peak shared GPU reservations until retirement is acknowledged.
Consider grow-only storage first; shrinking introduces another policy and more
migrations. Keep WebGL1's power-of-two requirements and context restoration.

Acceptance:

1. Prove identical selected plans, loaded-detail feedback, page-table contents
   and sampled pixels across growth, source changes, cancellation, refusal,
   suspension, disposal, context loss and changes during an upload.
2. Fault-inject every allocation/upload/retirement boundary. No stale atlas
   binding, detached input, premature grant release or unbounded retry.
3. Measure physical GPU allocations and peak overlap for cold startup, a long
   drag, repeated stop changes, returning to the map and budget changes, on
   WebGPU, WebGL2 and a real WebGL1 context.
4. Demonstrate materially lower steady and peak GPU bytes without a separated
   frame-time, startup, transfer or quality regression. Do not infer power
   savings from allocation size alone.

## 2. Account for and bound retained elevation memory without coarsening it

Owner: engine's terrain loader, surface sampler and worker clients.

The page heap snapshot reported 553.3 MiB of `JSArrayBufferData`. Of that,
493 nodes were exactly 1 MiB, with SharedArrayBuffer/Float32Array retainers:
the size of a 512 × 512 elevation grid. A heap snapshot can represent shared
backing storage in ways that differ from physical process memory. Establish
unique backing-store ownership across the page and workers before quoting a
total or claiming a leak.

Investigate the interaction between the loader's 256-entry cache, the raster
mesh cache, adopted/decoded surface grids, grid neighbours, height-check work
and terrain mesh workers. `terrainHeightBatches` already weakly references its
source grids; do not replace that with a strong cache. Its sample cache has a
different purpose from the loader's elevation cache.

First publish counters for uniquely owned source bytes, shared source bytes,
live surfaces, cold reusable grids and in-flight snapshots. Then identify exact
duplicate copies or obsolete generations that no owner needs. Release those
through their lifecycle; do not rely on finalizers for correctness. If bounded
cold-cache eviction is the only remaining saving, make its transfer/CPU tradeoff
explicit and preserve the existing user limits. Never substitute coarser grids,
lower precision, different interpolation or rounded heights.

Acceptance: exact height/normal/query and selector parity, unchanged live
surfaces during eviction, no disposed generation resurrected by late replies,
bounded page and worker retention over repeated routes, and measured physical
memory reduction alongside network/decode counts. Include shared-memory off,
worker failure and main-thread fallback.

## 3. A coherent geometry snapshot for each rendered frame

Owner: engine/browser viewport contracts, UI shell, Renderer and image viewers.

The baseline drag charged 36.8 ms/s to `applyWorldViewport` at 4× CPU, including
forced style/layout. Earlier profiles also found reads after mid-frame HUD
writes. Removing one read can simply charge the same pending layout to the next
reader. A cache that listens only to ResizeObserver cannot guarantee correctness
under scrolling, transforms, font loading, tab movement or the on-screen keyboard.

Specify explicit host frame phases: complete geometry-affecting writes; acquire
the canvas/world/occluder geometry; prepare and draw against that immutable
snapshot; publish nonessential HUD writes after all reads. Demonstrate which
writes can change canvas or occluder geometry. Event-driven input outside a
frame still needs a current layout. Preserve camera aspect, world viewport
rounding, input hit tests, CSS transforms and headset multi-eye passes.

Acceptance: changing tab/window layouts, drag handles, orientation, DPR, zoom,
fonts, scrolling and keyboard appearance must produce the same geometry and
pixels as fresh reads. Measure total style/layout time for the whole frame,
not only the function whose read was removed. Keep render-on-demand asleep when
there is no visual change.

## 4. Batch the remaining visible panorama markers only if the profile warrants it

Owner: sphere-image and Renderer. First consume conservative off-screen culling.

The tour begins with 48 markers on Minneapolis. Batching must preserve the
analytic ray/sphere depth, pixel-sized silhouettes and outlines, hover scale,
opacity, expansion/reveal order, each photograph's content transform, picking,
probe outputs and WebGL1 fallback. The current independent cube textures and
transparent ordering mean that sharing quad geometry alone does not remove
material/texture submissions. A texture-array or preview-sheet batch needs a
precise sampling/seam contract and transactional source ownership.

Measure the remaining draw/observer cost after culling. Proceed only if it is
material. Require an independent CPU/shader reference, boundary and transition
pixels, all supported backends, and interleaved frame/GPU timing. Do not cull
markers merely because they are below the horizon: terrain may not cover them
while its tiles load.

## 5. Split backend code without delaying WebGPU startup

Owner: Renderer bootstrap and Vite integration, with the app's existing early
WebGPU support hint and app-file service worker.

A three-line prototype dynamically imports `recoverableWebGpuEngine` from the
GPU support/creation paths and makes the bootstrap's WebGPUEngine import
type-only. Its initial production module graph falls from 48 files / 3,236,257
raw bytes / 953,723 gzip bytes to 44 / 2,899,591 / 870,803. WebGL no longer
eagerly evaluates the WebGPU implementation. All 62 bootstrap tests and the full
Renderer implementation/installed-consumer checks pass, including missing-module
fallback before taking the canvas.

It is nevertheless rejected: three interleaved cold WebGPU visits under Fast
4G and 4× CPU reach the renderer at 1,478–1,525 ms before and 1,948–1,986 ms
after, and useful content at 3,411–3,698 ms before and 3,913–3,947 ms after.
Both ranges separate. The extra module-discovery boundary is on the critical
path. The prototype and its tests were removed, with patches retained in
Renderer `build/night/lazy-webgpu*.patch`; the compiled A/B arms and timing
profiles remain available. Do not reapply the simple import change as a win.

Design an early, backend-aware preload using the existing HTML adapter promise
and renderer preference/fallback rules. Derive hashed implementation and static
dependency URLs from the build graph, as the shader chunk integration already
does. Do not hardcode asset hashes or maintain another list of Babylon modules.
An explicit WebGL choice or current automatic WebGL fallback should not load
GPU code. A positive adapter hint for a GPU start should overlap its transfer
with the initial module graph, before bootstrap waits for it. Reuse the adapter
promise; do not issue extra adapter probes just to choose preloads.

Preserve cache/version coherence, app-file/offline coverage, bounded failed-chunk
fallback, saved backend choices and the public installed Renderer consumer. The
background app-file keeper may still fetch lazy code: report critical eager
code and eventual network bytes separately. A plain dynamic import with no
early preload has already failed the most important startup comparison.

Acceptance: interleaved cold/warm WebGPU, WebGL2 and WebGL1 startup under a shared
network/CPU model; missing adapter; saved fallback; failed preload/import;
offline and service-worker updates. Prove lower eager parse/code bytes and no
separated meaningful regression in GPU renderer/content startup. Retain actual
requested/selected backends and isolation/SAB in every receipt.

## 6. Defer optional panel implementations while keeping settings available

Owner: FOSS Earth app composition, UI lazy features and component owners.

The production entry graph still contains substantial application and settings
UI alongside necessary terrain/imagery code. The source map includes the native
execution panel and many panel factories. Source text size is only a search
hint: measure their retained minified bytes and initialization tasks before
choosing another boundary. Earlier Babylon import narrowing, lazy features and
provider loading already exist; do not repeat those completed migrations from
the older backlog's estimates.

Keep the small settings catalogue, URL/storage handling, validation and stable
host ports available at boot. Load optional panel DOM/control implementations
on actual tab intent, using the app's existing lazy-feature machinery. Restored
open tabs must still initialize normally, and callbacks must not depend on
registration performed by a panel that has never opened. Preserve focus,
keyboard commands, recovery, imports/exports, presets, source-linked diagnostics
and shared execution controls. Initializing a hidden tab merely to discover its
settings defeats this boundary.

Acceptance: exact initial module graphs for each backend, cold/warm critical
code bytes, parse/initialization task time, restored-tab startup, first-use
latency and failed-chunk recovery. Verify isolated service-worker updates and
the installed public app consumer. The background app-file keeper may fetch
lazy chunks for future use; distinguish that transfer from eager module
evaluation and never report it as eliminated network traffic.
