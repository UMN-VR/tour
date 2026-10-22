# Optimization backlog

The performance work the tour owns: its photographs, how they are prepared and
published, its build, and the defaults it chooses. Drawing, loading and the globe
are FOSS Earth's, and are ranked in its
[Optimization backlog](https://github.com/foss-earth/docs/blob/main/docs/optimization-backlog.md),
with the method used here. IDs from there (X1, T12, S1 and so on) are used here
unchanged. The [WebGL performance review](webgl-performance-review.md) has the
background and the decisions still open.

The ranking was written 16 October 2026; its estimates are historical. The
[22 October continuation](performance-continuation.md) records confirmed work:
three equivalent-output panorama paths now use tour host defaults, with
19–24% less measured render CPU inside a photograph on the desktop phone proxy.
The simpler WebGL shader remains opt-in because its pixels differ. Shared
off-screen marker culling also cuts submissions about 51%, with about 5% less
main-thread time/frame on WebGPU. Physical-phone qualification remains open.
The [advanced implementation handoff](performance-next-agent.md) specifies the
remaining difficult candidates.

## Ranking

| Rank | ID | Item | Gain (estimate) | Effort | Tier |
| ---: | --- | --- | --- | :-: | :-: |
| 1 | U1 | Physical-phone qualification of the three default panorama work-saving paths (X1); keep the simpler shader opt-in | Measured on the M5 proxy: render CPU −19 to −24% inside a stop | S | 1 |
| 2 | U2 | Encode tiles as the prototype did | Tile bytes −18 to −27% | M | 1 |
| 3 | U3 | Leave editing tools out of the visitors' build | Startup download and parse of a 5.4 MB chunk | M | 2 |
| 4 | U4 | Keep Google tiles to the campus and its approaches (T12) | Downloads and memory outside the campus | S, after T12 | 2 |
| 5 | U5 | Write the overview's height into the scene (S5) | First view up to 3 s sooner on desktop | S | 2 |
| 6 | U6 | Content-hashed media paths and a long cache lifetime | Repeat visits download almost nothing | M | 2 |
| 7 | U7 | Native-size source JPEGs where no change is needed (PR28) | 28.8 MB less at full size; no extra lossy pass | S–M | 2 |
| 8 | U8 | A smaller phone tier of tiles and previews | Decode, upload and memory on phones | M | 3 |
| 9 | U9 | HTML tour before graphics start (PR64) | First useful content; a path when WebGL fails | M | 3 |
| 10 | U10 | GPU-compressed tile variants once FOSS Earth reads them (X6) | Photo GPU memory ÷4 to ÷8 | M, after X6 | 3 |
| 11 | U11 | Panorama-first entry, globe on request (PR65) | Globe startup skipped for photo-first visitors | L | 4 |

## Catalogue

| ID | Item | Status | Owner | Gain (estimate) | Effort | Tier |
| --- | --- | --- | --- | --- | :-: | :-: |
| U1 | Bookkeeping, opaque immersion and skipping hidden globe candidates use tour defaults after exact pixels on WebGPU, WebGL2 and WebGL1 and interleaved timing. Preserve visitor overrides. The simpler shader stays opt-in; see the [continuation](performance-continuation.md). | Three paths enabled; physical-phone qualification open | tour; renderer for the default | Render CPU −19 to −24% inside a photograph on an M5 phone proxy; phone GPU unknown | S | 1 |
| U2 | The tiles are 22 to 37% larger than the prototype's because of FOSS Earth's JPEG encoder ([roadmap](roadmap.md)). Match the prototype's encoding in the shared preparation tool, then rebuild. | Open | images (FOSS Earth), then tour rebuild | Tile bytes −18 to −27% | M | 1 |
| U3 | The tour mounts the whole app. The placement and layer editors, the developer tab and other tools a visitor never opens can be left out of the published build or loaded on demand (S1, S2). | Open | tour composition, app | Startup download, parse and memory | M | 2 |
| U4 | Ask the globe to load Google tiles only within the campus and the views of it the tour uses (T12) | Open, needs T12 | tour scene, engine | Downloads and memory outside the campus | S | 2 |
| U5 | Store the overview's height in the scene instead of finding it at startup (S5, measured in engine's notes: overview 3 s sooner on desktop, settle 9% sooner on the phone proxy) | Open, needs decision | tour scene | First view | S | 2 |
| U6 | Media under content-hashed paths, so they never change and a service worker can keep them, within an allowance the visitor can see ([content delivery](content-delivery.md); PR30) | Open | tour, scenes | Repeat visits | M | 2 |
| U7 | Pass the 60 validated 6144 px source JPEGs through unchanged where no rotation or resize is needed ([review](webgl-performance-review.md#current-tour-content-and-startup)) | Open | images (FOSS Earth), then tour rebuild | 28,774,081 bytes less; no GPU change | S–M | 2 |
| U8 | A smaller set of tiles and previews for phones, chosen by FOSS Earth's representation selection (X5), as krpano serves separate phone image sets | Open | tour content, sphere-image | Decode, upload, GPU memory on phones | M | 3 |
| U9 | Stops, titles, descriptions and thumbnails as HTML before the globe starts (PR64; already on the [roadmap](roadmap.md)) | Open | tour | First useful content | M | 3 |
| U10 | KTX2 or Basis tile variants with JPEG fallback, once FOSS Earth can read them (X6) | Open, needs X6 | tour content | Photo GPU memory ÷4 to ÷8 | M | 3 |
| U11 | Open a stop straight into the photograph and start the globe when asked (PR65) | Open, needs decision | tour, app | Globe startup skipped | L | 4 |
| U12 | Publish only the representations the viewer still uses. Each stop carries equi-angular tiles, ordinary cube tiles and three whole images; the site holds 661 MiB of its 1 GB limit. | Open, needs decision | tour | Publication size and deploy time, not visitor speed | S | 3 |
| U13 | Try WebP and AVIF tiles against JPEG for bytes and decode time on old phones (PR29) | Open | images, tour content | Bytes; decode may be slower | M | 3 |
