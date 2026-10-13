# Tour content and releases

The scene already has the folder-and-pointers layout needed for demand loading. The large
deployment is the sum of separate photographs; it is not a single 661 MiB scene download. A
first visit to the map downloads the manifest and one 445 KiB image; a later visit, only the
manifest.

## On disk and over HTTP

```text
public/tour/twin-cities/
├── scene.json                         # metadata, positions, links and image URLs
└── media/
    ├── previews-64.jpg                # every photograph's 64 px preview cube in one image
    ├── northrop-mall/
    │   ├── preview-64/{px,nx,py,ny,pz,nz}.jpg
    │   ├── preview-128/{px,nx,py,ny,pz,nz}.jpg
    │   ├── preview-256/{px,nx,py,ny,pz,nz}.jpg
    │   ├── eac-tiles/<face>/<level>/<x>/<y>.jpg   # equi-angular cube, 510 tiles of 194 px
    │   ├── cube-tiles/<face>/<level>/<x>/<y>.jpg  # ordinary cube, the same tiles
    │   ├── immersion-2048.jpg
    │   ├── immersion-4096.jpg
    │   ├── immersion-6144.jpg
    │   ├── asset.fragment.json        # preparation output used by the build
    │   └── prepared.json              # provenance and build reuse settings
    └── ...59 more panorama folders
```

The scene format belongs to FOSS Earth:
[`docs/scenes/format.md`](https://github.com/foss-earth/foss-earth.github.io/blob/main/docs/scenes/format.md).
The tour's build and sources are described in [tools/twin-cities/README.md](../tools/twin-cities/README.md).

`scene.json` is ordinary JSON with `format: "foss-earth-scene"` and `version: 1`. Its main parts
are `assets` (available image representations and their URLs), `entities` (panorama locations,
poses, titles and links), and `groups` (stops in tour order). `initialPanorama` identifies the
first stop; the tour's startup view uses `overview` for campus map framing. An entity names its image with `assetId`.
Each asset lists interchangeable representations, with their projection, dimensions and
`encodedBytes`. A cube preview points to six separate JPEG faces; a tiled cube to its tiles'
folder, with each level's bytes; a whole immersion image to one equirectangular JPEG. Media URLs
resolve relative to the manifest URL.

Measured from the generated scene on 2026-09-28, and its tiles on 2026-10-03:

| Content | Size | When needed |
| --- | ---: | --- |
| Manifest: 60 panoramas, 24 groups, 134 links | 308,480 bytes (301 KiB) | First; enough to know every stop and its position |
| The preview sheet: all 64 px cube previews in one image | 0.43 MiB | Second, in one request: every orb on the map |
| All 64 px cube previews, as 360 files | 0.64 MiB | Only by a viewer that reads no sheet, or when the sheet fails |
| All 128 px cube previews | 1.71 MiB | Each only when its orb is drawn larger than 64 px |
| All 256 px cube previews | 5.45 MiB | Each only when its orb is drawn larger than 128 px, or its panorama is entered |
| All 2048 px immersion images | 24.37 MiB | Individual panoramas as they are opened |
| All 4096 px immersion images | 78.41 MiB | Individual higher detail upgrades |
| All 6144 px immersion images | 151.42 MiB | Individual full detail upgrades |
| All equi-angular tiles | 200.62 MiB in 30,600 files | The view's tiles of the panorama entered, at the level it needs: the default |
| All cube tiles | 197.98 MiB in 30,600 files | The same, when cube tiles are chosen |
| Whole generated content folder | 661.0 MiB in 62,461 files (263 MiB before the tiles) | Publishing content; never a prerequisite for showing the map |

The smallest preview tier for all 60 images is less than half a MiB in its sheet. Splitting this
manifest into 60 metadata requests would add overhead without addressing the image loading
problem. Keep the small index together; fetch image representations independently, with
bounded concurrency.

## Runtime delivery

Loading and rendering belong to FOSS Earth. The implemented sequence is:

1. Fetch and validate the manifest, then register all stops immediately. Prepare the campus
   overview's terrain independently of image downloads; ground-relative markers become
   positioned as the displayed terrain becomes available at each location.
2. Fetch the preview sheet, one image with every panorama's 64 px cube, and show every orb
   from it. If it fails, each orb loads its own six files, sixteen requests at a time, and one
   slow panorama does not hold the scene back.
3. Sharpen only what is drawn larger than it is sharp: an orb on screen with more pixels across
   it than its preview has texels loads the 128 or 256 px preview its size asks for, the
   largest orb first. At the overview no orb is, so nothing more is fetched.
4. On entry, ask for the panorama's 256 px preview and, while the camera flies in, for the
   tiles of the view it opens on, so the view is sharp as the flight ends. Tiles draw over the
   preview, at the level the view's pixels need, the largest share of the view first: on a
   phone that is the finest level, 1536 px faces, for 30 to 40 tiles. A whole image, when
   chosen in 360 image settings, loads within the image detail and memory budgets and replaces
   the preview once usable. Nothing passes through an intermediate size first.
5. Keep every file downloaded, in the browser's IndexedDB under its photograph's revision in
   the scene, and read it from there before the network is asked: on a reload, a later visit,
   and a look back. Where the device has room, the atlas on the GPU has a slot for all 510
   tiles of a panorama, so inside one nothing is dropped and loaded again; on a device with
   less it holds the view and its margin, and a look back reads the rest from the disk.
   Scenes → Saved images holds the limit (256 MiB) and clears it; Scenes → Loading and memory
   and Tiled images hold what stays on the GPU.
6. Cancel obsolete requests on scene replacement or leaving a panorama. Report response bytes
   and failures through the scene's progress events and the app's log.

**What a visit downloads.** FOSS Earth's `scripts/validation/scene-revisit.mjs` counted the
image requests of this tour's build in headless Chrome, a laptop's window, with every response
held 100 ms and no HTTP cache (2026-10-03):

| Visit | Image requests | Bytes | Every orb shown after |
| --- | ---: | ---: | ---: |
| First, as deployed earlier on 2026-10-03 | 720 | 6.2 MiB | 10.5 to 10.8 s; the last image after 20 s |
| First, now | 1 | 0.43 MiB | 1.5 s |
| Reload, or a later visit | 0 | 0 | 1.2 to 1.3 s |

About 1.2 s of each is the app starting. Inside Northrop Mall, four views a quarter turn
apart asked for 98, 64, 64 and 36 files; looking at the first again asked for none and loaded
none; and on the later visit all five asked the network for nothing and were complete in 0.5 to
0.75 s. The fly-in could not be timed here, since the check serves no map and the tour's orbs
stand on its ground; on FOSS Earth's own example a view was complete 1.3 s after the click, as
the flight ends, where it had taken 1.6 s. With the atlas at a phone's 196 tiles, the first view
again also asked for nothing: its tiles came back from the disk, complete in 0.9 s. None of
this has run on a phone.

The app's own files are kept too, by FOSS Earth's service worker (its
[docs/app-files.md](../../../foss-earth/ui/docs/app-files.md)): FOSS Earth's
`scripts/validation/app-files.mjs` found that this build's first visit kept all 63 files it
loaded, and that a reload and a later visit asked the network for none of them.

**Why the viewer keeps files itself.** GitHub Pages lets every file go stale after ten minutes
(`Cache-Control: max-age=600`). Measured on the live tour the same day, a visit 11 minutes
after the first asked for all 720 preview files again, and Pages sent 306 of them whole, 2.8 MiB,
instead of answering "unchanged". It did the same for the app's own files: 1.55 of 1.72 MiB
came again. The viewer keeps the scene's images itself, and its service worker the app's files,
so neither depends on the host's ten minutes.

This is progressive delivery through separate image requests. A whole JPEG still has to finish
before its decoded texture is usable; tiles are each usable as they arrive, so the view
sharpens a tile at a time. FOSS Earth's
[progressive 360° prototype](https://github.com/foss-earth/foss-earth.github.io/blob/main/benchmarks/eac-progressive-prototype/REPORT.md)
measured the difference over throttled HTTP at 2 Mbit/s on three of these panoramas: the view
was within 1 dB of finished after 1.3 s and 258 KiB with tiles, while two of the three whole
images were not sharp in 10 s. The tour's tiles come from FOSS Earth's own JPEG encoder and are
22 to 37% larger than the prototype's for the same photographs, so expect about that much
longer. Here a finest-level equi-angular tile averages 6.5 KB, so a
phone's view of 35 to 40 tiles is about 250 KB, against 4.7 MiB for the photograph's 6144 px
image. Each tile is a separate small file, so a content release publishes tens of thousands of
files, and the content is now about two thirds of GitHub Pages' 1 GB site limit: a cost of the
Pages branch, not of loading, and a reason for the separate content origin below.

Panoramas render through WebGPU, WebGL 2 or capable WebGL 1 contexts. WebGL 1 requires
`EXT_frag_depth`, `OES_standard_derivatives` and high-precision fragment shaders for the same
orb depth and edge behavior. `EXT_shader_texture_lod` is optional; without it, the longitude
seam may sample a softer mip. A missing required capability produces a specific diagnostic.
Both WebGL paths submit image row strips within the configured upload allowance. WebGL 2 can
generate mipmaps for the 6144 × 3072 images and tracks outstanding uploads with GPU fences.
WebGL 1 uses bilinear filtering without mipmaps for that non-power-of-two size; 2048 and 4096
images can use mipmaps. It caps per-frame submissions by both upload limits because WebGL 1
does not expose GPU fences. These are capability and implementation differences, not a claim
that a particular phone or backend has been performance-qualified.

## Development and current releases

The `deploy:app`, `deploy:content` and `deploy:full` commands below are the club-site
publisher this repository no longer uses. Publishing now is `npm run deploy` on this
repository's own `gh-pages` branch; the [README](../README.md#deploying) has the current
commands. The dates and measurements in this section are the record of the releases that
used the old publisher.

Use `npm run dev` for iteration, or `npm run dev -- --host 0.0.0.0` for a phone on the same
network. The HTTP network address Vite prints can use WebGL; WebGPU needs a secure context,
so exercising that backend on a phone requires a trusted HTTPS development proxy or tunnel.
Vite reads `public/` directly and hot reloads app edits. Neither command deploys or
re-encodes photographs. Run `npm run build:scene` only when the scene inputs change; unchanged
prepared images are reused.

The release commands separate the two independently changing inputs:

| Command | Input | Effect on `gh-pages` |
| --- | --- | --- |
| `npm run deploy` or `npm run deploy:app` | `dist-app/`, built without copying `public/` | Adds current app and landing-page files; keeps content and older hashed bundles |
| `npm run deploy:content` | `public/`, checked against its manifest | Adds current scene and media; keeps the app and older content |
| `npm run deploy:full` | Complete `dist/` | Replaces the branch contents with the complete build |

On 2026-09-28, an app-only build contained 85 files and 7.02 MiB, compared with the content
folder's 1,381 files and 262.78 MiB. The app's main JavaScript bundle is still substantial
(about 1.48 MB compressed in that build); separating deployments does not reduce that startup
download.

The app-only helper rejects output containing scene files or photographs. Both content and
full releases run FOSS Earth's `check-scene.mjs` before publishing. `--dry-run` prints the file
count and byte size and performs checks without publishing:

```sh
npm run build:app
node tools/deploy.mjs app --dry-run
node tools/deploy.mjs content --dry-run
```

Additive releases deliberately retain old bundles and files so cached pages still work. They
are not a garbage collector: an occasional full refresh removes files absent from the current
build, and should be planned when old sessions no longer need them. No release rewrites Git
history. `gh-pages` reuses its local cache under `node_modules/.cache/gh-pages`; a cold cache
must clone the published branch. Git transfers changed objects on later pushes, so the large
branch does not prove that unchanged photographs were uploaded on every release.

**The tiled release, 2026-10-03.** The app went first (85 files, 7 MiB; Pages built it in about
a minute), and the content ten minutes later, once GitHub Pages' cached copies of the old app
had expired (`Cache-Control: max-age=600`). The content release took 11 minutes: about 6 to copy
and commit 62,581 files in the `gh-pages` cache and 4.5 to push them. Pages then built the site
in 2 min 14 s, well inside its 10-minute limit. The cache under `node_modules/.cache/gh-pages`
is now 1.6 GB: keep it, or the next release clones the published branch again. Pushing `main`
with the tiles took 4.5 minutes as well; the `gh-pages` push uploads the same files again,
since its cache cannot see `main`'s objects.

**The loading-once release, 2026-10-03.** The app went first (86 files with its service worker;
Pages built it in 2 minutes), and the content at 20:51, eleven minutes after the app was live,
since an older app refuses a scene with a preview sheet. With the cache kept, the content
release took 2 min 12 s for the same 62,582 files, of which only the sheet and the manifest had
changed, and Pages built it in 2.5 minutes. On the live site, headlessly at a laptop's window,
the first visit asked for one image, 446 KiB, and showed all 60 orbs 5.2 s after the page
opened, the app's first download included; a reload asked for none. The app was published again
at 21:00 with a fix: a panorama left was given up on the GPU at once, because its atlas is larger
than the tile memory that lays it out. It was published once more at 21:09, so that a visitor
back after a deploy keeps the files the deploy changed on that first visit, not only on the
next: from a browser holding the 21:00 version's worker, that visit downloaded those 5 files,
1.48 MiB, and took the other 58 from the worker, and a reload and a later visit downloaded
nothing of the app (FOSS Earth's
[docs/app-files.md](../../../foss-earth/ui/docs/app-files.md)).

**Two phones that evening, and the sheet's move.** The release was tried on two phones within
the hour. Firefox on an Android phone drew every orb black: FOSS Earth cut the faces out of
the sheet in a way Firefox's WebGL does not upload, and now cuts them through a canvas. An
iPhone showed "`$.sheets`: is not a property of this record" and no tour: Safari was still
showing the day before's page from its cache, whose app knew no sheets, so the eleven minutes
between the app and the content had not been enough. The page had also kept crashing on that
iPhone (an iPhone XS Max, iOS 18.2.1, WebGPU turned on in Safari's feature flags); that is not
reproduced, and which version of the app was running is not known.

The scene is rebuilt with the sheet as the format's extension `foss-earth.preview-sheets`,
which an app that does not know it skips: revision `4b89d4e2af09`, the sheet's file unchanged.
With each published bundle in headless Chrome, served this build's images:

| App | The scene as published at 20:51 | The rebuilt scene |
| --- | --- | --- |
| The day before's (`twinCities-R4LARsSE.js`), the iPhone's | refused: `$.sheets` and 60 more | 60 orbs, from their face files |
| The evening's (`twinCities-C9TYTT-e.js`) | 60 orbs after one request; black in Firefox | 60 orbs, from their 360 face files |
| This build | refused: `$.sheets` and 60 more | 60 orbs after one request |

So the content went out first, which put right both phones' faults for every app already
published, and the app after it, since the new app refuses the scene as published before. An
app from before the tiled release of 2026-10-03 still refuses the scene, for its tiled cubes.

- **The content, 2026-10-03, 22:34 to 22:37** (2 min 29 s; Pages built it by 22:39). With the
  evening's app still live, Firefox drew the orbs' photographs, from their face files.
- **The app, 2026-10-04, 12:33** (15 s to publish 86 files; live at 12:36), with FOSS Earth's
  fix for Firefox, the sheet read as an extension, and its diagnostics. On the live site,
  headlessly at a phone's viewport: Firefox 157 and WebKit 26, Safari's engine, each showed
  all 60 orbs with their photographs after the one request for the sheet, and a reload asked
  for no image and none of the app's files; WebKit inside Northrop Mall showed all 28 tiles in
  view. A visitor holding the evening's service worker took the 6 files the deploy changed,
  1.50 MiB, once.

**What the tour can now say of a fault.** Neither phone could say which version ran or what
the page was doing. The app now keeps a trail of each visit and gives a report to copy, in
Settings → Diagnostics or with `?report` in the address; [which-version.md](which-version.md)
and [bug-reporting.md](bug-reporting.md) say how.
FOSS Earth's check kills the page as a phone's browser does: on the live tour, the visit after
it said "The last visit stopped without being closed, 11 s after it opened or later; it was
at: scene umn-twin-cities, revision 4b89d4e2af09, inside the 360 image northrop-mall". The
iPhone's crashes are still not reproduced: the WebKit these checks run has no WebGPU and a
Mac's memory. The next report from that phone is what will say.

**The phones the day after, and which app they ran.** Tried on the afternoon of 2026-10-04,
both phones showed the tour, and the iPhone's page stopped after five minutes. Its Settings
tab had three sections, Presets, Saved settings and About, so no report could be found. That
is how the app it ran was told:

| Published | Built (UTC) | Bundle | Its Settings tab | What it has |
| --- | --- | --- | --- | --- |
| 2026-10-03 00:33 | 2026-10-03 05:33 | `twinCities-R4LARsSE.js` | Presets, Saved settings, About | tiled photographs; **the iPhone's, both days** |
| 2026-10-03 20:37 | 2026-10-04 01:37 | `twinCities-D8QlvF5C.js` | and App files | the preview sheet, saved images, the service worker, the limits on what the GPU holds |
| 2026-10-03 20:59 | 2026-10-04 01:59 | `twinCities-Cto4YHjV.js` | the same | a panorama left keeps its tiles on the GPU, where it had been given up at once |
| 2026-10-03 21:09 | 2026-10-04 02:09 | `twinCities-C9TYTT-e.js` | the same | a deploy's changed files are kept on the first visit after it |
| 2026-10-04 12:33 | 2026-10-04 17:33 | `twinCities-BVTOJrr3.js` | and Diagnostics | the orbs in Firefox, the sheet as an extension, the report |

Safari had kept its copy of the page of 2026-10-03 00:33 and showed it each time the phone
came back to the tab: the same app as the evening before, working now because the scene had
been rebuilt for it. Nothing of two days' work had run on that phone, and the crash after
five minutes was that app's, from before the limits on what the GPU holds. The Android
phone's orbs say nothing either way: the evening's app draws them from their face files now
that it skips the sheet. An app already published cannot be told from here to reload; the tab
has to be reloaded on the phone.

FOSS Earth's answer is in the app after these, deployed that afternoon. Each page of a build carries
its build's time and commits; the app asks the site for its own page as it starts, and a page
older than the published one reloads itself while nobody has touched it, once, or says so
with a button; and the log's first line says which version runs, such as "App built
2026-10-04 20:23 UTC from a9e8e9d with FOSS Earth 930f725"
([its app files page](../../../foss-earth/ui/docs/app-files.md#the-page-and-a-browsers-copy-of-it)).
On this tour's build, FOSS Earth's `published-version.mjs` played the phone's case, the check
answering the browser's requests for the page with a copy two days older: in Chrome, Firefox
and WebKit the copy reloaded itself once into the published page and said so, did not when it
was touched first or when the browser kept answering with the copy, and in Chrome did the
same under the tour's service worker. With the site asked on every visit, a reload and a
revisit still took none of the app's 63 files from the network. What Safari on the phone does
with it is not known until the release after the one that carries it: the phone's tab then
holds a page that can ask.

- **The app with the version check, 2026-10-04, 15:32** (11 s to publish 86 files, 7.14 MiB;
  live at 15:34), built at 20:32 UTC from `54b9bea` with FOSS Earth `d538bfa`, bundle
  `twinCities-DzZbKG1U.js`. On the live site, at a phone's viewport in Chrome 154, Firefox 157
  and WebKit 26, the log's first line said "App built 2026-10-04 20:32 UTC from 54b9bea with
  FOSS Earth d538bfa", About and the report said the same in full, and the page found itself
  to be the published version. Asking cost 300 bytes in Chrome, which was told the page had
  not changed, and 1.7 KiB in Firefox and WebKit, which took it again. A visitor holding the
  12:33 version's worker took the 5 files this deploy changed, 1.49 MiB, once, and none on a
  reload or a later visit; FOSS Earth's crash check passed on the live tour. The iPhone's tab
  still holds the page of 2026-10-03 and has to be reloaded by hand once.

This split removes repeated local copying of the scene from app releases. It does **not**
split the final GitHub Pages site artifact: its branch build still sees all the media. The
server-side part of a long deploy can remain. The observed
[2026-09-28 Pages run](https://github.com/UMN-VR/UMN-VR.github.io/actions/runs/36381847888)
took about 67 seconds from creation to completion: its build job took 44 seconds and its
deployment job 14 seconds. That run does not account for ten minutes by itself. The preceding
local build, cold clone and initial media push are plausible contributors, but were not timed.
GitHub currently documents a 1 GB published-site
limit and a 10 minute deployment timeout; the tour should not grow indefinitely inside that
artifact. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Next delivery boundary

Put the scene and media on a separately published static content origin, with the U or the club
owning its account and retention policy. The app should publish only HTML, JavaScript, CSS and
the scene's URL. Choosing and connecting that storage is a separate deployment change; no
third-party account or media migration is configured here.

Use a versioned scene folder, for example `twin-cities/<revision>/scene.json`, with relative
media references. Upload and validate images first and the manifest last, then point the app
at that immutable manifest. Retain older versions while deployed app releases reference them.
Content hashes in shared image paths can avoid duplicating unchanged photographs across scene
revisions. Long-lived caching belongs on immutable media URLs; a mutable scene pointer needs
revalidation. The content service must supply correct image MIME types and CORS for the app's
origin.

`VITE_TOUR_SCENE_URL` configures the app's manifest URL at build time. Once a content origin has
been chosen, this lets the existing app release consume it without rewriting the scene format.
For example, to build an app overlay against a manifest that has already been published:

```sh
VITE_TOUR_SCENE_URL=https://content.example.edu/twin-cities/revision/scene.json npm run build:app
```

Its host and manifest must permit the app to fetch all referenced images. Moving the media
out of the Pages branch is what removes it from Pages' app deployment artifact; the additive
release commands above are an interim workflow.
