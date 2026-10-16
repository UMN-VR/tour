import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkPlacementHeights, heightProblems, preparePlacements, run, sceneHeightProblems, SCENES } from "./prepare-heights.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOOGLE = "google-photorealistic-3d-tiles";
const USGS = "usgs-3dep-epqs-geoid18";

function row(id, longitudeDeg = -93.2, extra = {}) {
  return { id, title: id, capture: { longitudeDeg, latitudeDeg: 44.9, source: "fixture" }, pose: { headingDeg: 0, pitchDeg: 0, rollDeg: 0, aligned: false, provenance: "" }, ...extra };
}
function heightOf(meters, provider = GOOGLE, longitudeDeg = -93.2, more = {}) {
  return {
    height: { meters, datum: "WGS84-ellipsoid", uncertaintyMeters: 2.01, source: `${provider} fixture` },
    heightPreparation: { provider, sampledOn: "2026-10-15", longitudeDeg, latitudeDeg: 44.9, ...more },
  };
}
/** A placement at -93.2 whose height was prepared at `preparedLongitudeDeg`. */
function withHeight(id, meters, provider, preparedLongitudeDeg = -93.2, more = {}) {
  const value = row(id);
  Object.assign(value.capture, heightOf(meters, provider, preparedLongitudeDeg, more));
  return value;
}
/** A fake engine preparation: Google everywhere at 200 m plus the longitude's fraction, and a call log. */
function fakePrepare() {
  const calls = [];
  const prepare = async points => {
    calls.push(points.map(point => point.id));
    return { points: points.map(point => ({ ...point, ...{ height: heightOf(300).height, preparation: heightOf(300, GOOGLE, point.longitudeDeg).heightPreparation } })) };
  };
  return { prepare, calls };
}

describe("height preparation for placements", () => {
  it("prepares only missing or moved heights and never replaces an authored one", async () => {
    const document = { panoramas: {
      a: row("a"),
      b: withHeight("b", 236, GOOGLE),
      c: withHeight("c", 240, "editor"),
      d: withHeight("d", 238, GOOGLE, -93.3),
      e: withHeight("e", 235, USGS, -93.2, { fallbackReason: "network: offline" }),
      f: (() => { const value = row("f"); value.capture.height = { meters: 250, datum: "WGS84-ellipsoid", uncertaintyMeters: 1, source: "typed" }; return value; })(),
    } };
    const before = JSON.stringify(document);
    const { prepare, calls } = fakePrepare();
    const result = await preparePlacements(document, { prepare });
    expect(calls).toEqual([["a", "d"]]);
    expect(result.document.panoramas.a.capture.height.meters).toBe(300);
    expect(result.document.panoramas.d.capture.heightPreparation.longitudeDeg).toBe(-93.2);
    expect(result.document.panoramas.c.capture.height.meters).toBe(240);
    expect(result.document.panoramas.f.capture.height.meters).toBe(250);
    expect(JSON.stringify(document)).toBe(before);
    await preparePlacements(document, { prepare, retryFallbacks: true });
    expect(calls.at(-1)).toEqual(["a", "d", "e"]);
    await preparePlacements(document, { prepare, refresh: true });
    expect(calls.at(-1)).toEqual(["a", "b", "d", "e"]);
  });

  it("is a no-op without network once every height is prepared", async () => {
    const document = { panoramas: { b: withHeight("b", 236, GOOGLE) } };
    const result = await preparePlacements(document, { prepare: async () => { throw new Error("no network expected"); } });
    expect(result.prepared).toEqual([]);
  });

  it("refuses a result for another coordinate", async () => {
    const prepare = async points => ({ points: points.map(point => ({ ...point, longitudeDeg: 0, height: heightOf(1).height, preparation: heightOf(1).heightPreparation })) });
    await expect(preparePlacements({ panoramas: { a: row("a") } }, { prepare })).rejects.toThrow(/another coordinate/);
  });

  it("names every problem a published height would have", () => {
    expect(heightProblems(row("a"))).toEqual(["no fixed capture height"]);
    const extra = withHeight("x", 236, GOOGLE);
    extra.capture.height.provider = "google";
    expect(heightProblems(extra).join()).toMatch(/fields the scene format refuses/);
    expect(heightProblems(withHeight("m", 236, GOOGLE, -93.3)).join()).toMatch(/another coordinate/);
    expect(heightProblems(withHeight("c", 236, "editor", -93.3))).toEqual([]);
    expect(heightProblems({ ...withHeight("g", 236, GOOGLE), marker: { mode: "ground-relative" } }).join()).toMatch(/ground-relative/);
    expect(() => checkPlacementHeights({ panoramas: { a: row("a"), b: withHeight("b", 236, GOOGLE) } })).toThrow(/a: no fixed capture height/);
    const counted = checkPlacementHeights({ panoramas: { b: withHeight("b", 236, GOOGLE), e: withHeight("e", 235, USGS, -93.2, { fallbackReason: "auth: denied" }) } });
    expect(counted).toEqual({ total: 2, byProvider: { [GOOGLE]: 1, [USGS]: 1 }, fallbacks: [{ id: "e", reason: "auth: denied" }] });
  });

  it("finds a scene that does not carry its placement's height", () => {
    const placements = { panoramas: { b: withHeight("b", 236, GOOGLE) } };
    const entity = { id: "b", type: "panorama", capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, height: placements.panoramas.b.capture.height }, marker: { mode: "capture-relative" } };
    expect(sceneHeightProblems({ entities: [entity] }, placements)).toEqual([]);
    expect(sceneHeightProblems({ entities: [{ ...entity, marker: { mode: "ground-relative" } }] }, placements).join()).toMatch(/not capture-relative/);
    expect(sceneHeightProblems({ entities: [{ ...entity, capture: { ...entity.capture, height: null } }] }, placements).join()).toMatch(/height differs/);
  });
});

describe("prepare-heights files", () => {
  let directory = null;
  afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); directory = null; });
  function scratch() {
    const root = path.resolve(here, "../../build");
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(path.join(root, "prepare-heights-test-"));
    return directory;
  }

  it("writes atomically, and writes nothing when preparation fails", async () => {
    const root = scratch();
    const file = path.join(root, "placements.json");
    const original = `${JSON.stringify({ panoramas: { a: row("a") } }, null, 2)}\n`;
    writeFileSync(file, original);
    await expect(run({ placements: file, prepare: async () => { throw new Error("Google and USGS both failed"); } })).rejects.toThrow(/both failed/);
    expect(readFileSync(file, "utf8")).toBe(original);
    const { prepare } = fakePrepare();
    expect(await run({ placements: file, prepare })).toMatch(/Prepared 1 height/);
    expect(JSON.parse(readFileSync(file, "utf8")).panoramas.a.capture.height.meters).toBe(300);
    expect(await run({ placements: file, prepare: async () => { throw new Error("no network expected"); } })).toMatch(/Unchanged/);
  });
});

describe("the canonical tour data", () => {
  it("gives every photograph a fixed height, carried by the Twin Cities, Minneapolis and Saint Paul scenes", () => {
    const placements = JSON.parse(readFileSync(path.join(here, "placements.json"), "utf8"));
    const result = checkPlacementHeights(placements);
    expect(result.total).toBe(60);
    for (const name of SCENES) {
      const scene = JSON.parse(readFileSync(path.resolve(here, "../../..", name, "scene.json"), "utf8"));
      expect(sceneHeightProblems(scene, placements), name).toEqual([]);
    }
  });
});
