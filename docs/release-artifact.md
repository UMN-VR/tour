# Tour app release artifact

`UMN-VR/tour` owns the application artifact contract and its public Node export
`@umn-vr/tour/release`. This entry imports no browser runtime or scene schema.
The club site owns its landing page and publication assembly.

The npm package exposes only the Node artifact contract. Browser application
packages and build tools are development dependencies of this private app;
installing the artifact contract does not install a globe or tour runtime.
The current inherited local build links still await final shared pins and do
not qualify standalone app setup.

The tour build is a domain-root overlay, even though its page remains
`/tour/twin-cities/`. Preserve `/assets/` and `/foss-earth-sw.js` at the domain
root with worker scope `/`. Prefixing the complete output under the page's
route changes those URLs and is incompatible with existing pages.

An artifact folder contains `tour-release.json`, its measured `club-pin.json`
and `payload/`. The descriptor
records the exact source commit, dirty state, package version/build time, root
base, page route, worker URL/scope, content manifest URL/revision/SHA-256 and
every app file's relative path/byte count/SHA-256. Its compatibility record lists
the 13 existing tab IDs; this record is an expectation to test during runtime
adoption, not evidence that a candidate mount implements those tabs.

The club pins the descriptor SHA-256, validates the exact inventory and every
payload byte, then copies the payload at its output root. Verification rejects
media in app output, club landing inputs, hidden Jekyll paths, traversal,
symlinks, missing/extra files and mismatched sizes/digests. A release output
folder must be new: no cleaning or overwriting retained artifacts.

The tour also emits owner-specific full-source and package-version stamps.
The public verifier binds both to the descriptor, alongside the shared build
time/short-source stamp and compiled content URL. A descriptor with a new digest
cannot relabel the unchanged payload as another commit or package version.

After the app and prepared scene have passed their owner checks:

```sh
npm run build:app
mkdir -p .local/releases
node tools/release/package.mjs dist-app .local/releases/RELEASE public/tour/twin-cities/scene.json tour/twin-cities/scene.json
```

For independently hosted content, pass its immutable manifest URL as the last
argument. `VITE_TOUR_SCENE_URL` must select the same URL during the build.
The packaging command does not validate/rebuild/encode the scene and does not
publish anything; shared scene verification remains a prerequisite.

Publish application overlays additively. Keep older hashed bundles, workers'
cached files and each content revision named by a supported app. Content
publication is a separate validated payload; an app-only release carries no
media. Rollback selects the previous exact tour artifact pin and leaves club
sources and content unchanged. The retained pre-migration `dist-app/` is stale
and is not an accepted split artifact.

An app-only publication plan can be inspected without any publication action:

```sh
npm run deploy:app -- --dry-run .local/releases/RELEASE PIN_JSON RETAINED_RELEASES_JSON
```

Use the generated `club-pin.json` as `PIN_JSON`. The pin has
`schemaVersion: 1`, `repository: "UMN-VR/tour"`, the existing
`mountPath` and exact `descriptorSha256`. The optional retained-release JSON
lists `{directory, descriptorSha256}` for each supported prior artifact. The
plan verifies those real artifacts, rejects changed bytes at retained app
resource paths, lists older files that must remain, and declares no deletions.
Different supported content bytes require different immutable manifest URLs.
The command accepts only `--dry-run`; live publication is separately gated.
It does not validate current/prior runtime compatibility or content schema.

No hosting provider, upload, live deployment, device performance qualification
or completed accessible tour is implied by this packaging boundary.
