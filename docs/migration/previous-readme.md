# University of Minnesota campus tour

`UMN-VR/tour` owns the campus tour at
<https://umn-vr.github.io/tour/twin-cities/>: its page, photographs, placements,
branding, importer, accessible content and application release. The separate
[club site](https://github.com/UMN-VR/UMN-VR.github.io) owns the landing page and
assembles a pinned tour artifact. [Campus About](https://github.com/UMN-VR/about)
owns the credits and campus release/dependency graph adaptation.

This is a source adoption candidate. Fourteen exact Earth package inputs,
including checked Scenes `2ac022d0`, are retained in [the input seals](release/earth-inputs.json).
Campus content/placement/About composition uses their public exports. Replacing
the inherited website-wrapper boot/build path still requires shared browser,
build and update ports outside the website package. The inherited lock has not
been regenerated for these inputs. [Staging status](docs/staging-status.md) records
the remaining app, content, installer and publication gates.

## Development workspace

Use independent repositories under one workspace root:

```text
WORKSPACE/
├── UMN-VR/
│   ├── tour/
│   ├── about/
│   ├── dev_installer/
│   ├── UMN-VR.github.io/
│   └── .github/
├── foss-earth/
│   ├── engine/                # shared runtime
│   ├── scenes/                # shared scene contract/tools
│   └── ...                    # independent shared providers
└── Felipegalind0/gamepad-tools/
```

The [Campus installer](https://github.com/UMN-VR/dev_installer) delegates workspace
selection, verified downloads and source/package links to the shared installer.
The actual pinned default manifest and source/hybrid bootstrap are pending;
[workspace release](docs/workspace-release.md) describes their requirements.
No tour runtime or private YouVisit snapshot is needed to bootstrap that data.

After the accepted dependency/content inputs are installed and checked,
`npm run dev` starts the local tour when explicitly invoked. The inherited
`npm run qr` command still needs Earth's public QR CLI delivery. Source
links must resolve public exports from the single provider checkout; release
qualification separately installs exact artifacts with source links disabled.

## Prepared content and authoring

Normal builds consume a verified public-layout tree containing
`tour/twin-cities/scene.json` and its prepared images. Set `UMN_TOUR_PUBLIC_ROOT`
to that tree root when it lives outside this checkout. `VITE_TOUR_SCENE_URL`
can select an independently published manifest. [Content ownership](docs/content-ownership.md)
and [content delivery](docs/content-delivery.md) record retained ownership,
representation compatibility and device limits.

The current baseline has 60 photographs, 24 groups and 134 links. The Regents'
photograph credit and OpenStreetMap placement credit remain. North alignment,
placement accuracy, richer media and the accessible tour still have unfinished
work; see [roadmap](docs/roadmap.md). Existing prepared bytes are preserved.

Optional authoring requires an explicitly authorized snapshot:

```sh
npm run build:scene -- --backup /path/to/authorized/snapshot
```

The importer does not discover, move or copy the preserved private backup.
It is excluded from ordinary setup/build. See [authoring instructions](tools/twin-cities/README.md).

## Commands

Run checks only within the coordinator's granted migration check window.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | App, build-tool and test declarations |
| `npm test` | Owner tests, using at most half the workers |
| `npm run lint` | Owner source lint |
| `npm run check:content -- .local/checks/RELEASE/content.json` | Actual prepared manifest, referenced files and baseline digest; requires a new receipt path |
| `npm run ci` | Shared conformance, owner lint/tests and app-only production build |
| `npm run build` | Alias for app-only build; prepared media is not copied |
| `npm run build:app` | App-only output in `dist-app/`; no photographs or club landing inputs |
| `npm run package:app -- ...` | Seal checked compiled app bytes and content identity |
| `npm run deploy:app -- --dry-run ...` | Inspect an additive publication plan; no upload |

[Release artifacts](docs/release-artifact.md) describe exact packaging arguments,
club assembly and rollback. No live deployment command is provided by this
owner candidate. Production publication requires the proper Earth split,
passing local adoption and coordinator review.

## Compatibility

Preserve `/tour/twin-cities/`, existing keyboard/text access and content, root `/assets/`,
`/foss-earth-sw.js` with scope `/`, all [13 current tab IDs](docs/tab-compatibility.md),
report-only `?report`, updates and old hashed resources. The optional shared Dev
tab activates only for a single exact `?dev=1`; [Campus observations](docs/dev-contribution.md)
reuse the mounted scene controller. Current source preparation is not runtime
or browser qualification. Search and VR remain deferred.

## Community documents

- [Code of conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](SECURITY.md)


## Approved independent scene ownership — 2026-10-10

Runtime-free selector and workspace/release/routing manifest. Runtime now belongs to App; content to independent scenes. Earlier ownership descriptions are retained historical context; this current assignment controls source/build adoption.
