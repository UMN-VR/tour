import { describe, expect, it } from "vitest";
import { planLayerImport, placementLayer } from "./import-layers.mjs";

function scene() {
  return {
    revision: "abc",
    entities: [{ id: "garden" }, { id: "mall" }, { id: "courtyard" }],
    layers: [
      { id: "outdoor", title: "Outdoor", layers: [{ id: "outdoor-360", title: "360 images", kind: "panoramas", members: ["garden", "mall"] }] },
      { id: "indoor", title: "Indoor", layers: [{ id: "indoor-360", title: "360 images", kind: "panoramas", members: ["courtyard"] }] },
    ],
  };
}

function placements() {
  return { panoramas: { "1": { id: "garden", title: "Garden", layer: "outdoor" }, "3": { id: "mall", title: "Mall", layer: "outdoor" }, "2": { id: "courtyard", title: "Courtyard", layer: "indoor" } } };
}

function exported(edits) {
  return {
    format: "foss-earth-layer-overrides", version: 1, exportedAt: "2026-10-15T20:00:00.000Z",
    scenes: [{ sceneId: "umn-twin-cities", sceneUrl: "https://umn-vr.github.io/tour/twin-cities/scene.json", edits }],
  };
}

describe("importing layer corrections", () => {
  it("moves a photograph from outdoor to indoor in placements and the scene", () => {
    expect(placementLayer(scene().layers, "indoor-360")).toBe("indoor");
    const plan = planLayerImport(placements(), scene(), exported([{ entityId: "garden", title: "Garden", layerId: "indoor-360", authoredLayerId: "outdoor-360", authoredRevision: "abc", updatedAt: "2026-10-15T20:00:00.000Z" }]));
    expect(plan.ok).toBe(true);
    expect(plan.placements.panoramas["1"].layer).toBe("indoor");
    expect(plan.scene.layers[0].layers[0].members).toEqual(["mall"]);
    expect(plan.scene.layers[1].layers[0].members).toEqual(["courtyard", "garden"]);
    expect(planLayerImport(plan.placements, plan.scene, exported([{ entityId: "garden", title: "Garden", layerId: "indoor-360", authoredLayerId: "outdoor-360", authoredRevision: "abc", updatedAt: "2026-10-15T20:00:00.000Z" }])).rows[0].status).toBe("already-applied");
  });

  it("refuses to leave a 360 images layer with no photographs", () => {
    const source = scene();
    source.layers[0].layers[0].members = ["garden"];
    source.entities = source.entities.filter(entity => entity.id !== "mall");
    const plan = planLayerImport(placements(), source, exported([{ entityId: "garden", title: "Garden", layerId: "indoor-360", authoredLayerId: "outdoor-360", authoredRevision: "abc", updatedAt: "2026-10-15T20:00:00.000Z" }]));
    expect(plan.ok).toBe(false);
    expect(plan.scene).toBeNull();
  });

  it("refuses a layer that is not indoor or outdoor", () => {
    const plan = planLayerImport(placements(), scene(), exported([{ entityId: "garden", layerId: "tunnels", authoredLayerId: "outdoor-360", authoredRevision: "abc", updatedAt: "2026-10-15T20:00:00.000Z" }]));
    expect(plan.ok).toBe(false);
    expect(plan.scene).toBeNull();
  });
});
