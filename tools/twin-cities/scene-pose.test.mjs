import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPlacementPoses, markerOffsets } from "./scene-pose.mjs";
import { toWorld, hotspotDirection, startDirection } from "./youvisit.mjs";

const scenePath = new URL("../../../twin-cities/scene.json", import.meta.url);
const placementsPath = new URL("./placements.json", import.meta.url);

function miniScene() {
  return {
    format: "foss-earth-scene", version: 1, id: "umn-twin-cities", revision: "abc", title: "Fixture",
    extensions: { "umn-vr.tour": { north: "0 of 1 panoramas have north set; the others face an arbitrary direction." } },
    entities: [{
      id: "northrop-mall", type: "panorama", title: "Northrop",
      capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, height: null },
      imagePose: { headingDeg: 0, pitchDeg: 0, rollDeg: 0, aligned: false },
      marker: { mode: "ground-relative", eastM: 0, northM: 0, offsetM: 25, radiusMeters: 3 },
      links: [{ id: "hotspot-7", target: "other", label: "Other", direction: { headingDeg: 10, pitchDeg: 1 } }],
      initialView: { headingDeg: 20, pitchDeg: 5, verticalFovDeg: 100 },
      extensions: { "umn-vr.tour": { capture: "old", north: { provenance: "old" } } },
    }],
  };
}

function placement(headingDeg = 0) {
  return {
    "1": {
      id: "northrop-mall", title: "Northrop",
      capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, source: "checked" },
      pose: { headingDeg, pitchDeg: 0, rollDeg: 0, aligned: false, provenance: "new" },
    },
  };
}

describe("pose-only scene update", () => {
  it("keeps the published Twin Cities scene when placements are unchanged", () => {
    const scene = JSON.parse(readFileSync(scenePath, "utf8"));
    const placements = JSON.parse(readFileSync(placementsPath, "utf8"));
    const applied = applyPlacementPoses(scene, placements.panoramas, null);
    expect(applied.changed).toBe(false);
    expect(applied.revision).toBe(scene.revision);
    expect(applied.scene).toBe(scene);
  });

  it("spreads shared capture points on the published ring", () => {
    const offsets = markerOffsets(["a", "b", "c"], () => ({ longitudeDeg: 1, latitudeDeg: 2 }));
    expect(offsets.get("a")).toEqual({ eastM: 0, northM: 0 });
    expect(offsets.get("b").eastM).toBeCloseTo(0, 5);
    expect(offsets.get("b").northM).toBeCloseTo(15, 5);
    expect(offsets.get("c").northM).toBeCloseTo(-15, 5);
  });

  it("refuses to invent hotspot directions and recomputes them from image-local angles", () => {
    expect(() => applyPlacementPoses(miniScene(), placement(12), null)).toThrow(/not inverted/);
    const locals = new Map([["northrop-mall", { start: { lon: 10, lat: 0, fov: 90 }, hotspots: new Map([["7", { id: "7", coordinates: [{ x: 0.2, y: 0.1 }] }]]) }]]);
    const applied = applyPlacementPoses(miniScene(), placement(12), locals);
    const entity = applied.scene.entities[0];
    expect(entity.imagePose.headingDeg).toBe(12);
    expect(entity.links[0].direction).toEqual(toWorld(hotspotDirection({ x: 0.2, y: 0.1 }), entity.imagePose));
    expect(entity.initialView.headingDeg).toBe(toWorld(startDirection({ lon: 10, lat: 0 }), entity.imagePose).headingDeg);
    expect(entity.initialView.verticalFovDeg).toBe(100);
    expect(applied.changed).toBe(true);
    expect(applied.revision).not.toBe("abc");
  });

  it("refuses a photograph the scene does not already contain", () => {
    expect(() => applyPlacementPoses(miniScene(), { ...placement(), "2": { id: "other", title: "Other", capture: { longitudeDeg: 0, latitudeDeg: 0, source: "" }, pose: { headingDeg: 0, pitchDeg: 0, rollDeg: 0, aligned: false, provenance: "" } } }, null)).toThrow(/cannot change which photographs/);
  });
});
