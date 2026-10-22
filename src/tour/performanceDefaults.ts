import type { SettingsRegistry } from "foss-earth/settings";

/** Equivalent-output renderer paths qualified on the tour; keep shader math unchanged. */
export function applyTourPerformanceDefaults(settings: SettingsRegistry): void {
  for (const id of [
    "renderer.experiments.panoramaBookkeeping",
    "renderer.experiments.opaqueImmersion",
    "renderer.experiments.presentationCandidates",
  ]) {
    settings.setHostDefault(id, true, "Shows the same tour with less rendering work.");
  }
}
