import { createSettingsRegistry, FOSS_EARTH_PARAMETERS, SETTINGS_STORAGE_KEY, type SettingsStorage } from "foss-earth/settings";
import { describe, expect, it } from "vitest";
import { applyTourPerformanceDefaults } from "./performanceDefaults";

function registry(values: Record<string, boolean> = {}, search = "") {
  const items = new Map<string, string>([[SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values })]]);
  const storage: SettingsStorage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); } };
  const settings = createSettingsRegistry({ storage, searchParams: new URLSearchParams(search) });
  settings.register(FOSS_EARTH_PARAMETERS.filter(spec => spec.id.startsWith("renderer.experiments.")));
  return settings;
}

describe("tour renderer defaults", () => {
  it("uses the qualified paths without enabling different shader arithmetic", () => {
    const settings = registry();
    applyTourPerformanceDefaults(settings);
    expect(settings.get("renderer.experiments.panoramaBookkeeping")).toBe(true);
    expect(settings.get("renderer.experiments.opaqueImmersion")).toBe(true);
    expect(settings.get("renderer.experiments.presentationCandidates")).toBe(true);
    expect(settings.get("renderer.experiments.panoramaShaders")).toBe(false);
    expect(settings.get("renderer.experiments.all")).toBe(false);
    expect(settings.inspect("renderer.experiments.presentationCandidates").provenance).toBe("host-default");
  });

  it("preserves saved opt-outs and keeps URL overrides authoritative", () => {
    const settings = registry({ "renderer.experiments.panoramaBookkeeping": false },
      "set.renderer.experiments.opaqueImmersion=0&set.renderer.experiments.presentationCandidates=0&set.renderer.experiments.panoramaShaders=1");
    applyTourPerformanceDefaults(settings);
    expect(settings.get("renderer.experiments.panoramaBookkeeping")).toBe(false);
    expect(settings.get("renderer.experiments.opaqueImmersion")).toBe(false);
    expect(settings.get("renderer.experiments.presentationCandidates")).toBe(false);
    expect(settings.get("renderer.experiments.panoramaShaders")).toBe(true);
  });

  it("leaves visitors free to turn a default off and reset it", () => {
    const settings = registry();
    applyTourPerformanceDefaults(settings);
    settings.set("renderer.experiments.presentationCandidates", false);
    expect(settings.get("renderer.experiments.presentationCandidates")).toBe(false);
    settings.reset("renderer.experiments.presentationCandidates");
    expect(settings.get("renderer.experiments.presentationCandidates")).toBe(true);
  });
});
