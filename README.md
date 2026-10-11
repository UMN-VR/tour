# UMN campus tour selector

Tour owns the static, accessible selector at `/tour/`, the routing graph and
runtime-free Campus workspace/release manifest. The three ordinary links select
Minneapolis, Saint Paul or Twin Cities. Existing Regents photograph URLs and
credits are retained; no new media or JavaScript runtime is part of the selector.

Shared runtime/composition belongs to `UMN-VR/app`. Authored scene content belongs
to `UMN-VR/minneapolis` and `UMN-VR/st-paul`; `UMN-VR/twin-cities` is their thin
pinned aggregate. The club site is the single canonical publisher for all routes.
Read the [selector guide](docs/selector.md) and [routing data](release/routes.json).

After a fresh check grant, `npm test` checks the pure Node artifact contract and
`npm run build` compiles only index.html/CSS. The public `./release` export measures
source-stamped static output, verifies all bytes and produces a `/tour/` payload.
There are no current Earth website or campus runtime dependencies in this package.
Old src/tour, importer/build/release sources and the dirty inherited lock remain
frozen recovery inputs, excluded from current scripts, build and package files.

The [workspace plan](release/workspace-plan.json) covers all ten Campus owners
and source/package/hybrid component choices. It is explicitly a preparation plan;
new clean source/package pins, qualified public media transport and shared
installer/bootstrap qualification are still required before a runnable exact
manifest can be released. Default setup must not require the private backup.

Source preparation is complete at this checkpoint; checks/build/package/browser,
public bootstrap and actual remote admission are queued. The [previous README](docs/migration/previous-readme.md)
retains pre-extraction instructions as historical context.

- [Code of conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](SECURITY.md)
