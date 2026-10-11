import { describe, expect, it } from "vitest";
import type { SceneEntryStatus, SceneStatus } from "@foss-earth/scenes/browser";
import { campusDiagnostics } from "./dev";

const release = { configuredManifestUrl: "https://umn-vr.github.io/tour/twin-cities/scene.json", revision: "release-pin" };
function entry(id: string): SceneEntryStatus {
  return { id, title: `Stop ${id}`, description: null, supported: true, message: null, placement: "placed", preview: "ready", marker: null, capture: null, pose: null, attribution: null, previewDetail: null, images: [], links: [] };
}
function committed(): SceneStatus {
  return {
    sceneId: "twin-cities", revision: "loaded-revision", title: "Twin Cities", generation: 3,
    phase: "immersive", active: "a", target: "b", hovered: null, view: null,
    entries: [entry("a"), entry("b")], groups: [], credits: [], overview: "applied",
    warnings: [{ path: "$.entities.a", message: "North alignment remains unknown" }],
    renderingAvailable: true, unavailableReason: null, lastError: null,
  };
}

describe("Campus observations from the shared scene controller", () => {
  it("shows committed scene and active entry during a pending replacement without inventing loaded provenance", () => {
    const data = campusDiagnostics({ loading: "https://example.org/pending.json", errors: [], status: committed() }, release);
    expect(data.scene?.revision).toBe("loaded-revision");
    expect(data.entity).toEqual({ id: "a", title: "Stop a" });
    expect(data.loadedManifestUrl).toBeUndefined();
    expect(data.placements).toBeUndefined();
    expect(data.release).toEqual(release);
    expect(data.warnings).toEqual(["$.entities.a: North alignment remains unknown"]);
  });

  it("retains committed facts while reporting a replacement failure and the viewer's error", () => {
    const status = { ...committed(), lastError: "Image could not be prepared" };
    const data = campusDiagnostics({ loading: null, errors: [{ path: "$", message: "Replacement rejected" }], status }, release);
    expect(data.scene?.generation).toBe(3);
    expect(data.entity?.id).toBe("a");
    expect(data.errors).toEqual(["Replacement rejected", "Image could not be prepared"]);
    expect(data.loadedManifestUrl).toBeUndefined();
  });

  it("clears loaded scene and entity observations after unload without calling a release pin a loaded revision", () => {
    const data = campusDiagnostics({ loading: null, errors: [], status: null }, release);
    expect(data.scene).toBeUndefined();
    expect(data.entity).toBeUndefined();
    expect(data.warnings).toBeUndefined();
    expect(data.loadedManifestUrl).toBeUndefined();
    expect(data.release.revision).toBe("release-pin");
    expect(data.errors).toEqual([]);
    expect(data.immersionDetail).toBeUndefined();
  });

  it("preserves the committed viewer measurement during pending replacement", () => {
    const measurement = { representation: "tiled-cubemap", loading: "Refining visible tiles", limitation: "Source limit", progress: ["Visible coverage ready"] };
    const status = { ...committed(), immersionDetail: measurement };
    const data = campusDiagnostics({ loading: "pending.json", errors: [], status }, release);
    expect(data.immersionDetail).toEqual(measurement);
    expect(data.immersionDetail?.progress).not.toBe(measurement.progress);
    expect(data.scene?.revision).toBe("loaded-revision");
    expect(data.loadedManifestUrl).toBeUndefined();
  });

  it.each([undefined, null])("does not fabricate missing displayed detail (%s)", immersionDetail => {
    const data = campusDiagnostics({ loading: null, errors: [], status: { ...committed(), immersionDetail } }, release);
    expect(data.immersionDetail).toBeUndefined();
  });

  it("reports only public capture accuracy and alignment without owner provenance", () => {
    const selected = { ...entry("a"), capture: { longitudeDeg: -93, latitudeDeg: 45, heightMeters: null, horizontalAccuracyMeters: 12 }, pose: { headingDeg: 0, pitchDeg: 0, rollDeg: 0, aligned: false } };
    const data = campusDiagnostics({ loading: null, errors: [], status: { ...committed(), entries: [selected] } }, release);
    expect(data.placements).toEqual({ accuracy: "12 m", alignment: "Not aligned" });
  });
});
