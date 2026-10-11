# Campus content and documentation owners

Decision from the 2026-10-08 source inventory: retain campus media source/import
and content-release metadata in `UMN-VR/tour`. Do not create
`UMN-VR/twin-cities-content`, `UMN-VR/docs` or `UMN-VR/research` merely to fill
the proposal graph. They have no independently maintained source/catalog role
today. The migration coordinator records these retained owners in its roster.

The prepared content is 62,582 files and 694,126,088 bytes. Referenced media is
62,461 files and 693,137,598 bytes. A second Git repository would duplicate this
output; a versioned artifact/static-origin release supplies its independent
delivery boundary without that duplication. Until a content origin is chosen,
retain additive Pages app/content releases and the existing relative paths.
External account selection, upload and retention administration remain a
separate deployment task.

The baseline scene is `umn-twin-cities`, revision `4b89d4e2af09`, with 60 assets,
60 entities, 24 groups and 134 links. Its 377,117-byte manifest SHA-256 is
`61c25d55523be24e4d937e594169c3d5d385f816005bc20bf209201c794686ed`.
The optional preview-sheet revision is `e2bebc5b31f1`; both tiled cube warps,
three preview sizes, three whole-image sizes and original-face fallback remain
part of the accepted content contract. Shared schema/image validation stays
in the Earth owners, never reimplemented in UMN.

Retain these homes:

| Material | Owner |
| --- | --- |
| Placements, YouVisit importer/preparation, public source credits and content-release pins | `UMN-VR/tour` |
| Tour README, scene preparation, content delivery, roadmap, bug reporting, media/placement plans, campus performance interpretation and future accessibility studies | `UMN-VR/tour` |
| Campus authored graph, About links/credits and resolved-release adaptation guide | `UMN-VR/about` |
| Club landing page/branding, club contributor instructions and pinned tour assembly/publication | `UMN-VR/UMN-VR.github.io` |
| Generic scene/image/renderer contracts and technical research | Their FOSS Earth implementations/catalogs |
| Organization policy/default templates | `UMN-VR/.github`, provisioned and admitted by the coordinator |

Content releases must name the immutable manifest revision/hash, file inventory
and every supported application's content pin. Validate referenced files before
publishing images and publish the manifest last; retain every revision still
used. Changing package paths does not justify re-encoding the archive.

Additive publishing preserves paths omitted from a payload, but overwrites
paths included in it. Different supported content bytes therefore need distinct
immutable manifest/media paths. Preserve the legacy
`/tour/twin-cities/scene.json` and its referenced bytes for already published
apps; do not overwrite an immutable retained path with different bytes. Content
hash reuse or a separately hosted versioned origin must be selected before
publishing changed media. This extraction preserves the current corpus; it
does not duplicate two full archives into a Pages payload.

Keep the full prepared corpus as the initial artifact selection. A smaller
runtime-only selection would be 62,462 files and 693,514,715 bytes including
the manifest, and needs its own inventory/digest and explicit release decision.
The current baseline includes preparation metadata; do not silently omit it.
Prepared-content dry-run validation waits for the accepted public scene/file
checker; the campus byte inventory alone cannot establish valid scene links,
dimensions or image representations.

Compatibility evidence distinguishes supported content from rejected historical
schemas. Retained Oct-05 scene fixtures match the current revision and manifest
pin. The local historical revision `1f3e62bbd87a` uses a rejected top-level
sheet field and is a negative fixture, not a supported prior content release.
Retained Oct-08 app output can exercise previous-page/worker behavior; preserve
its actual old build identity rather than relabeling it as a new split artifact.

Normal development consumes prepared public content and needs no YouVisit
backup. Optional media authoring needs the local-only source backup through an
explicit supplied path. Preserve `.local/youvisit-backup/` in its existing
checkout; it is not an installer download, artifact input to publish wholesale,
or a disposable migration folder.

All 60 photographs still lack aligned north, five remain unplaced precisely,
and the separate accessible tour, ordinary photos, narration and video remain
unfinished. Preserve current captions/descriptions, keyboard/text access,
entity IDs, links, views, genuine human and asset credits. The photographs are
credited to © Regents of the University of Minnesota; placement methods retain
© OpenStreetMap contributors, ODbL 1.0.
