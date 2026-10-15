import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSceneFiles, validateScene } from "foss-earth/scenes";
import { MINNEAPOLIS, ST_PAUL, TWIN_CITIES } from "./scenes";

// The photographs, where the scene build (npm run build:scene) wrote them; the published site holds them otherwise.
const site = path.resolve(process.env.TOUR_PUBLIC?.trim() || "public");
const published = new URL("tour/twin-cities/scene.json", "https://umn-vr.github.io/");
/** A published URL's file in the scene build's output. */
const fileOf = (url: string) => path.join(site, new URL(url).pathname);

describe("the Twin Cities tour's scene", () => {
  // The scene the tour publishes, from the twin-cities repository beside this one.
  const result = validateScene(readFileSync(createRequire(import.meta.url).resolve("@umn-vr/twin-cities/scene.json"), "utf8"), { baseUrl: published.href });

  it("is a valid generated scene", () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it.skipIf(!existsSync(path.join(site, "tour/twin-cities/media")))("has every image it declares, as declared", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    const report = checkSceneFiles(result.scene, url => (existsSync(fileOf(url)) ? new Uint8Array(readFileSync(fileOf(url))) : null));
    expect(report.problems).toEqual([]);
    // Six faces for each of three preview cubes, three whole images, and two tiled cubes of 6 · (1 + 4 + 16 + 64) tiles; and the one preview sheet.
    expect(report.files).toBe(result.scene.assets.size * (21 + 2 * 510) + 1);
    // 62,461 files read from disk: about five seconds, more when the disk is busy.
  }, 60_000);

  it("holds every photograph's 64 px preview in one sheet, so the map shows all its orbs after one request", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    const sheets = [...result.scene.sheets.values()];
    expect(sheets.map(sheet => [sheet.id, sheet.width, sheet.height])).toEqual([["previews-64", 4 * 6 * 64, 15 * 64]]);
    const places = new Set<string>();
    for (const asset of result.scene.assets.values()) {
      const first = asset.representations.find(entry => entry.projection === "cube" && entry.faceSize === 64);
      const place = first?.projection === "cube" ? first.sheet : undefined;
      expect(place?.id).toBe("previews-64");
      places.add(`${place!.x},${place!.y}`);
    }
    // Each in a cell of its own.
    expect(places.size).toBe(result.scene.assets.size);
  });

  it("offers every photograph as equi-angular and ordinary cube tiles at its full detail", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    for (const asset of result.scene.assets.values()) {
      const tiled = asset.representations.filter(entry => entry.projection === "tiled-cube");
      expect(tiled.map(entry => entry.projection === "tiled-cube" && [entry.id, entry.warp, entry.faceSize, entry.tileSize, entry.levelBytes.length])).toEqual([
        ["eac-tiles", "equi-angular", 1536, 192, 4],
        ["cube-tiles", "gnomonic", 1536, 192, 4],
      ]);
    }
  });

  it("splits the photographs into outdoor and indoor layers, each holding the 360 images", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    expect(result.scene.layers.map(layer => [layer.id, layer.title, layer.layers?.map(child => [child.id, child.title, child.kind])])).toEqual([
      ["outdoor", "Outdoor", [["outdoor-360", "360 images", "panoramas"]]],
      ["indoor", "Indoor", [["indoor-360", "360 images", "panoramas"]]],
    ]);
    const members = result.scene.layers.flatMap(layer => layer.layers?.flatMap(child => child.members ?? []) ?? []);
    expect(new Set(members).size).toBe(result.scene.spheres.size);
    expect(members).toHaveLength(result.scene.spheres.size);
  });

  it("opens on the tour's first stop", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    expect(result.scene.initialPanorama).toBe("northrop-mall");
    expect(result.scene.groups[0].title).toBe("1. Welcome to the UMN Twin Cities (feat. Northrop Mall)");
  });
});

describe("the tour's content location", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("uses the packaged scene by default and can point at a content release", async () => {
    vi.stubEnv("VITE_TOUR_SCENE_URL", "");
    vi.resetModules();
    expect((await import("./scenes")).TWIN_CITIES.url).toBe("twin-cities/scene.json");
    vi.stubEnv("VITE_TOUR_SCENE_URL", " https://content.example.org/twin-cities/r2/scene.json ");
    vi.resetModules();
    const configured = (await import("./scenes")).TWIN_CITIES;
    expect(configured.id).toBe(TWIN_CITIES.id);
    expect(configured.url).toBe("https://content.example.org/twin-cities/r2/scene.json");
  });

  it("resolves every campus against the tour's project site, preserving the published URLs", () => {
    for (const campus of [MINNEAPOLIS, ST_PAUL, TWIN_CITIES]) {
      expect(new URL(campus.url, "https://umn-vr.github.io/tour/").href).toBe(`https://umn-vr.github.io/tour/${campus.id}/scene.json`);
    }
  });
});
