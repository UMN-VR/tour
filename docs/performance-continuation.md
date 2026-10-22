# Performance continuation, 22 October 2026

This resumes the shared performance handoff for the UMN tour. The user
authorized long local tests, autonomous implementation, commits only after
confirmation, and specifications for especially difficult remaining work.
Nothing in this session is published. Other tasks' working changes are kept.

## Confirmed changes

### Pending raster queries

Engine commit `1589628` adds `hasPendingTiles()` for callers that only need a
boolean. Complete diagnostics count replacements in the pass over selected
tiles instead of scanning the entire cache a second time.

All 1,355 engine tests, typecheck and lint pass. Existing lifecycle checkpoints
also compare the predicate with the diagnostic count. Six interleaved isolated
microbenchmark pairs over a 16-tile runtime agree with the shipped diagnostic
answers at pending, settled and elevation-replacement checkpoints:

| Median query, ns | Shipped counts | New counts | Predicate |
| --- | ---: | ---: | ---: |
| Pending | 86 | 76 | 5 |
| Settled | 95 | 90 | 76 |
| Elevation replacement | 137 | 87 | 8 |

The replacement count and pending predicate separate. The settled-count
difference is within noise. These are query costs, not a frame-rate claim.
Evidence: engine `build/night/diagnostics-bench.json` and test logs.

### Conservative marker culling

Sphere-image commits `438b7e7` and `f58967a` reject only a marker whose shader
quad lies wholly outside a side clip plane or behind the eye. Expansion,
screen-size bounds, display scale, outlines and delayed camera uniforms are
included. Headset passes retain the previous eligibility. No terrain/horizon
assumption or quality reduction is used.

Three interleaved A B B A A B runs of one production build, bypassing culling
for A, using a 412 × 915 viewport at DPR 2.625, 4× CPU and 12-second phone
drags on an Apple M5 / Chrome 155.0.8059.85:

| Median | Bypass | Culling | Result |
| --- | ---: | ---: | --- |
| WebGPU marker draws/rendered frame | 48.0 | 23.3 | About 51% fewer |
| WebGPU main-thread ms/frame | 10.78 | 10.26 | About 5% less, separated |
| WebGPU fps | 57.6 | 57.5 | Within noise |
| WebGL2 marker draws/rendered frame | 48.0 | 23.3 | About 51% fewer |
| WebGL2 main-thread ms/frame | 10.07 | 9.74 | Within noise |
| WebGL2 fps | 57.6 | 57.5 | Within noise |

Main-thread ms/frame is approximate, derived from rounded summary values.
WebGPU's individual ranges are 10.76–10.92 against 9.90–10.43 ms/frame.
The WebGL2 ranges overlap. These proxies do not qualify a physical phone.

Nine fixed-clock screenshot states match byte for byte on WebGPU, WebGL2 and
an actual WebGL1 context: map, three entry moments, immersion, three exit
moments and map again. The comparison requires repeated identical frames in
each arm, with live performance text/CSS animations suppressed equally.
30,000 seeded shader-corner cases and 1,000 delayed rolling/zooming camera
cases pass. Five broken variants are detected. All 282 sphere-image tests,
typecheck, lint, build and public consumer typecheck pass.

Evidence: research `build/night/culling-results.{md,json}`,
`build/night/pixels-culling-*-cold/`, the `profile-tour-phone-night-cull-*`
profiles, and sphere-image `build/night/mutants.json`.

## Panorama work-saving paths

The all-experiments switch is not suitable as a strict equivalent-output
default: WebGL2 changes up to 4,508 of 2,598,964 screenshot pixels by up to two
8-bit channel values, and WebGL1 up to 4,513 by two. These are repeatable
differences with steady images. The simpler shader remains opt-in.

With that shader off, the bookkeeping, opaque-immersion and hidden-globe
candidate paths match all nine screenshot states exactly on WebGL2 and
WebGL1. On WebGPU the all-experiments test matches all nine states, and the
shader experiment does not alter that backend's shader path.

Separate timing runs enter a ready photograph before measurement and drag
inside the photograph's part of the viewport, below the open information tab.
Setup/entry is excluded from the timing counters. Both arms use the same
production build and no shader change, three runs per arm in A B B A A B order:

| Panorama render CPU, ms/s | Baseline runs | Three paths enabled | Median change |
| --- | --- | --- | --- |
| WebGPU | 65.4, 60.5, 64.6 | 53.2, 49.3, 48.7 | 64.6 → 49.3, −24% |
| WebGL2 | 54.7, 52.7, 60.2 | 48.3, 42.8, 44.4 | 54.7 → 44.4, −19% |

Both render sections separate. Whole-frame timings overlap and fps remains
near the display limit; no whole-frame or power saving is claimed. Probes
confirm immersion, requested flags, actual backend and isolation before and
after each stretch. Evidence: research `build/night/panorama-ab.log`, the
`profile-tour-phone-night-panorama-*` profiles and
`build/night/pixels-subset-webgl*/`.

The tour enables these three paths through host defaults, preserving saved
choices and URL overrides. It does not enable the all-experiments or
simpler-shader switches. Full tour CI, explicit typecheck and changed tests
pass: 77 tests pass and one media-on-disk test is skipped. No scene or media
content changed.

## Memory investigation

The baseline allocated about 432.5 MiB through WebGPU. A 7776 × 7776 RGBA8
imagery atlas with mips accounted for 307.5 MiB, its page table 16 MiB, and
the two 1081 × 2401 multisampled color/depth targets about 79.2 MiB combined.
The accounting tool's broad "render target" category includes sampled
textures with render-attachment usage; it is not evidence that the atlas is
an unnecessary off-screen pass.

The page heap snapshot reports 615.1 MiB, including 553.3 MiB of native
ArrayBuffer data. There are 493 native nodes of exactly 1 MiB with shared
elevation-grid retainers. That is not a unique physical-memory count across
workers. Evidence: research's `profile-tour-phone-night-baseline` snapshot,
GPU report and `build/night/heap-owners.jsonl`.

Dynamic physical atlas capacity, unique elevation backing-store accounting,
coherent frame geometry, marker batching and optional panel initialization
need deeper work. Their contracts and acceptance tests are specified in
[the implementation handoff](performance-next-agent.md). No lower-quality
terrain, texture or framebuffer default was introduced to reduce these totals.

## Other candidates examined

- Lossless JPEG Huffman optimization with the installed libjpeg-turbo 3.2.0
  preserved decoded RGBA exactly but saved only 1.04% of the published preview
  sheet and 1.91% of one 256-pixel preview face. This small sample does not
  justify a new preparation dependency and a content-revision migration.
- A dynamic WebGPU implementation import removes 336,666 raw bytes / 82,920
  gzip bytes and four files from the initial module graph, but delays WebGPU
  renderer startup by about 0.46 seconds and useful content by about 0.41
  seconds in separated cold-start pairs. Its source/tests were removed.
  Backend-aware early preloading is specified in the implementation handoff.
- Older backlog estimates predate completed lazy features, provider loading
  and Babylon import narrowing. They are not current measurements.

## Qualification limits

These are local builds using the current linked checkouts, including other
tasks' edits, rather than a claim about the deployed site. All compared
visits retain cross-origin isolation and shared memory. A phone viewport and
CPU throttle are not a physical phone, thermal, battery or VR qualification.
The older pixel harness's warm overview wait timed out; the qualified matrix
uses a cold visit that explicitly reaches overview/previews and compares
steady frames. Raw profiles and screenshots remain ignored under `build/`.
