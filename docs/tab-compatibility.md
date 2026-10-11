# Campus tab compatibility

The extracted campus app must preserve the existing 13 IDs:

`location`, `map`, `renderer`, `sky`, `time`, `controls`, `interface`,
`settings`, `about`, `bug-report`, `scenes`, `panorama`, `panorama-settings`.

Globe mode has 11 tabs; panorama mode has 9. The panorama title follows
`360: <photograph title>`; closing it exits panorama and restores the globe.
Scene IDs, links and Northrop Mall initial view remain the captured corpus.
The three existing state keys are `foss-earth.settings.v1`,
`foss-earth-scene-media-v1` and `fossEarthScene`; update status also remains
bound to the published page path. Keep the domain-root worker URL and scope.

`?report` remains the report-only page without a globe or current tabs. Opt-in
`?dev=1` uses the one shared Dev tab and campus observation contribution only
after its public mount/lazy lifecycle is accepted. Search, Weather and VR
are not new current tabs in this migration.

The release descriptor lists the expected 13 IDs. That list is not runtime
evidence. Actual engine/UI/toolbar/scenes/360 adoption must check contexts,
dynamic titles, tab close behavior, keyboard focus, visible descriptions,
captions, credits and current accessible text. Worker/update, previous-page
lazy chunks and current/prior supported scene combinations need real consumed
artifact checks. Device/performance qualification and the separate accessible
tour remain unfinished.
