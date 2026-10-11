# Campus workspace release

`UMN-VR/tour` owns the workspace manifest as data; `UMN-VR/dev_installer`
pins its immutable location, bytes, SHA-256 and source revision and delegates
to `@foss-earth/dev-installer`. No application runtime is needed to retrieve
that data. A released default descriptor cannot be emitted until every real
source/artifact and its transport is accepted.

The complete default is campus application development, with tour, campus
About, club artifact assembly and their declared shared source dependencies.
The shared source closure includes engine, UI, renderer, toolbar, Sky,
scenes, 360, images and the current representation owners (equirectangular,
cubemap, tiled-cubemap, preview-sheets), shared About and opt-in Dev, plus
the accepted gamepad-tools source/artifact. Package preparation/provenance and
worker integration tools must be declared with their public owner exports.
All exact revisions, package integrity and build order belong in one manifest.
Search, VR, aircraft and JSBSim are not default dependencies. Earth website
wrappers are excluded; their Weather compatibility dependency is consequently
not a Campus default edge. Shared browser/build/update ports must be delivered
through the split owners. No registry fallback is accepted.

Named selections should expose `about`, `tour` and `club` development through
the shared dependency closure, alongside the full default. The club selection
consumes an accepted built tour artifact when source tour work is not selected;
it never gains a second tour source copy. A tour-source selection includes the
accepted shared source/build dependencies and prepared content. The About
selection needs its actual shared About package, without importing tour runtime.
The developer default requires source links for every selected inter-repository
package edge, with declared compatible peers. There is one independent provider
checkout per canonical repository in the workspace; Earth, Flight and Campus
consumers reuse that provider's real path. Portable relative layout and a
machine-local checkout map support existing checkout overrides. Do not nest
provider repositories inside an application, copy shared source or clone a
second provider to hide an incompatible pin. Final destinations are independent
`UMN-VR/<owner>`, `foss-earth/<provider>` and `Felipegalind0/gamepad-tools`
checkouts under the workspace root. Old staging aliases identify the same
checkouts; the original application archives remain read-only recovery inputs.

Declare all selected consumer/provider/package edges in `manifest.links`,
including transitive shared development dependencies and the common CI tooling.
Provider builds must produce their actual public dist/types/assets before
consumers run. Separate exact artifact qualification disables these source
links and verifies the installed package maps and full owning checks. Developer
success cannot substitute for that release receipt. Prepared media and native
generated inputs remain exact artifacts; source linking does not regenerate them.

The reviewed `ff46c57` installer supports explicit existing clean pinned
checkout overrides through `--links`. It does not automatically activate links
to every freshly cloned declared provider. Platform owns the pending shared
source-workspace mode that closes this gap. Campus must bind its reviewed
contract and replacement seal before claiming a fresh linked default; no
consumer linker or guessed new option is introduced here. The wrapper's
bootstrap tooling seal remains the reviewed exact artifact until that delivery.

Do not turn every current optional/development dependency into one unconditional
build-order edge. Current Engine selects Sky as an optional runtime peer, while
Sky uses Engine and `@foss-earth/research` for owner validation. That creates a
potential Engine/Sky cycle if all source links are naively ordered; the reviewed
installer refuses active-link cycles. Earth must deliver the required runtime,
build and owner-validation phases, including any real research provider pin,
and Platform must supply the supported ordering contract. Campus cannot mark
an incomplete graph as a runnable default or create an empty research repo.

Normal setup acquires a pinned prepared-content artifact with declared origin,
download bytes and SHA-256 before transfer, verifies it through shared bounded
installation and scene/file checking, and retains its resulting tree. It needs
no YouVisit backup, encoding step, native toolchain or server startup. The reviewed shared installer `ff46c57de0789417c9794a44a0710bedb6bae9cf` supplies safe bounded archive-tree transport and bounded HTTPS redirects. The chosen immutable public origin and actual default bootstrap remain acceptance gates; a local fixture cannot qualify public distribution.

Prepared-tree, source checkout and downloaded archive destinations must be distinct and non-nested. Retain the full prepared corpus with its public `tour/twin-cities/` prefix in the tree. Pass `{artifactTree:content}` to the owner build/check step as `UMN_TOUR_PUBLIC_ROOT`; ordinary local development can still use `public/`. `build:app` disables public copying in either layout. The shared archive `treeSha256` hashes sorted `[path,digest]` JSON pairs and differs from the retained size-inclusive campus inventory digest; record both. Archive entry/payload/tar/metadata bounds must be measured from the actual archive, including directories/padding. No archive pin has been fabricated.

Owner steps must retain committed manifests/locks and record regular-file outputs under ignored owner paths. Declare exact installed-package name/version/artifact/full required file maps, not only package version markers.

Optional media authoring requires an explicitly provided local backup path and
the documented image tools. It is excluded from normal onboarding. Every
install/build/check step is an argv array with declared outputs and explicit
opt-in for costly authoring. No global system installation is implied. Print
the relevant server command after setup; never start it.

Acceptance records the wrapper/shared CLI/manifest/source/content pins together.
Use the actual shared mechanism from an empty assigned scratch workspace for
the full default and at least one selection, then exercise integrity failure,
resumption, dirty/diverged refusal and read-only offline doctor. Retain all
logs/state. Synthetic planning fixtures are useful contract checks and cannot
substitute for those actual campus bootstrap receipts.

Development acceptance additionally records each declared package edge's actual
resolved provider root, two consumers sharing one real provider path, existing
checkout reuse/overrides, provider build order and preservation on dirty,
missing, conflicting or version-mismatched inputs. The Vite host must allow the
declared provider export roots through its public build contract without a
hardcoded personal path or blanket sibling source allowlist. The public build
producer outside the Earth website and its exact closure remain Earth delivery inputs.
