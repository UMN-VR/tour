import { describe, expect, it } from "vitest";
import { planLinkImport } from "./import-links.mjs";
import { applyPlacementLinks } from "./scene-links.mjs";

const placements = { panoramas: { 1: { id: "a", title: "A", capture: { longitudeDeg: -93, latitudeDeg: 45, height: { meters: 200 } } }, 2: { id: "b", title: "B", capture: { longitudeDeg: -93, latitudeDeg: 45.001, height: { meters: 202 } } } } };
const campuses = { "umn-minneapolis": new Set(["a", "b"]) };
function exported() { return { format: "foss-earth-link-overrides", version: 1, scenes: [{ sceneId: "umn-minneapolis", sceneUrl: "https://tour.example/scene.json", edits: [{ entityId: "a", authoredRevision: "r1", updatedAt: "2026-10-16T04:30:00.000Z", links: [{ target: "b", label: "B" }] }] }] }; }
describe("tour image links", () => {
  it("imports additions idempotently and computes directions from corrected captures on every build", () => {
    const plan = planLinkImport(placements, exported(), campuses); expect(plan.ok).toBe(true);
    expect(plan.placements.panoramas[1].links).toEqual(["b"]);
    expect(planLinkImport(plan.placements, exported(), campuses).placements).toEqual(plan.placements);
    const original = { id: "original", target: "b", label: "Original tour hotspot" };
    const scene = { entities: [{ id: "a", type: "panorama", links: [] }, { id: "b", type: "panorama", links: [original] }] };
    applyPlacementLinks(scene, plan.placements.panoramas);
    expect(scene.entities[0].links).toMatchObject([{ id: "image-link-b", target: "b", direction: { headingDeg: 0 } }]);
    expect(scene.entities[0].links[0].direction.pitchDeg).toBeGreaterThan(0);
    plan.placements.panoramas[2].capture.latitudeDeg = 44.999;
    applyPlacementLinks(scene, plan.placements.panoramas);
    expect(scene.entities[0].links).toHaveLength(1); expect(scene.entities[0].links[0].direction.headingDeg).toBeCloseTo(180);
    expect(scene.entities[1].links).toEqual([original]);
  });
  it("rejects the whole import for self, unknown, cross-campus, duplicate or nonfinite links", () => {
    for (const change of [d => { d.scenes[0].edits[0].links[0].target = "a"; }, d => { d.scenes[0].edits[0].links[0].target = "unknown"; }, d => { d.scenes[0].edits.push(d.scenes[0].edits[0]); }, d => { d.scenes[0].edits[0].links[0].direction = { headingDeg: NaN, pitchDeg: 0 }; }]) {
      const data = exported(); change(data); expect(planLinkImport(placements, data, campuses)).toMatchObject({ ok: false, placements: null });
    }
    expect(planLinkImport(placements, exported(), { "umn-minneapolis": new Set(["a"]) }).ok).toBe(false);
    expect(placements.panoramas[1].links).toBeUndefined();
  });
  it("does not duplicate an existing authored target and removes deleted additions on rebuild", () => {
    const p = structuredClone(placements); p.panoramas[1].links = ["b"];
    const original = { id: "hotspot", target: "b", label: "B" };
    const scene = { entities: [{ id: "a", type: "panorama", links: [original] }, { id: "b", type: "panorama" }] };
    applyPlacementLinks(scene, p.panoramas); expect(scene.entities[0].links).toEqual([original]);
    scene.entities[0].links = [{ id: "image-link-b", target: "b", label: "B" }]; delete p.panoramas[1].links;
    applyPlacementLinks(scene, p.panoramas); expect(scene.entities[0].links).toEqual([]);
  });
});
