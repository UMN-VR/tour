# Retained pre-extraction guidance

Historical source, superseded by current CONTRIBUTING development instructions. Rights/contribution policies remain in CONTRIBUTING unchanged.

## Development

Campus application, placements, import rules and prepared-content release data
belong here. Generic scene/image/viewer/UI/rendering changes belong to their
FOSS Earth owner; consume its public exports without copying shared code.
Read [staging status](docs/staging-status.md), [workspace requirements](docs/workspace-release.md)
and the [README](README.md) before using inherited commands. Complete accepted
dependency pins, locks and split app integration are still pending.

The development default uses one standalone checkout per provider, linked
through public exports; release qualification uses exact artifacts with source
links disabled. Ordinary application work uses prepared public content. Never
edit generated files manually. Optional authoring requires an explicitly supplied
local backup and follows the [import guide](tools/twin-cities/README.md); preserve
the original backup and all retained evidence.

After a code edit, run `npm run typecheck`, relevant Vitest tests and `npm run lint`.
Run `src/tour/twinCitiesScene.test.ts` explicitly after changing its disk inputs;
retain importer conversion tests. Run the full `npm run ci` once when finished,
under the reserved slot with at most 50% workers and `.local/` logs. Documentation
alone needs no app suite. No implicit server, benchmark, encoding or deployment.
Unfinished accessibility and media work remains on the [roadmap](docs/roadmap.md).

Use strict TypeScript types where applicable, follow existing formatting and
lint rules, keep changes focused, and add meaningful tests for behavior changes.
Do not add generated output, credentials, API keys, vendor source copies or
unrelated formatting changes.

