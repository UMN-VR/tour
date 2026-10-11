import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateScene } from "@foss-earth/scenes";
import { builtInSceneHooks, checkSceneFiles } from "@foss-earth/scenes/node";
import { validateViewerAsset, type BuiltInRepresentation } from "@foss-earth/360";
import { createPreviewSheetsExtensionHook } from "@foss-earth/preview-sheets/scene-extension";
import { PREVIEW_SHEETS_EXTENSION, type ResolvedSheetPlace, type SheetRecord } from "@foss-earth/preview-sheets";
import type { TiledCubeRepresentationRecord } from "@foss-earth/tiled-cubemap";
import { tourPublicRoot } from "../../tools/twin-cities/content-root.mjs";
import { TWIN_CITIES } from "./scenes";

const site = pathToFileURL(`${tourPublicRoot()}/`);
// Validate local generated content even when a build selects a remote release.
const published = new URL("tour/twin-cities/scene.json", "https://umn-vr.github.io/");
/** A published URL's file in public/. */
const fileOf = (url: string) => new URL(`.${new URL(url).pathname}`, site);

describe("the Twin Cities tour's scene", () => {
  const result = validateScene(readFileSync(fileOf(published.href), "utf8"), {
    baseUrl: published.href, representations: builtInSceneHooks(), validateImageAsset: validateViewerAsset,
    extensionHooks: [createPreviewSheetsExtensionHook()],
  });

  it("is a valid generated scene", () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("has every image it declares, as declared", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    const report = checkSceneFiles(result.scene, url => (existsSync(fileOf(url)) ? new Uint8Array(readFileSync(fileOf(url))) : null));
    expect(report.problems).toEqual([]);
    // Six faces for each of three preview cubes, three whole images, and two tiled cubes of 6 · (1 + 4 + 16 + 64) tiles; and the one preview sheet.
    expect(report.files).toBe(result.scene.assets.size * (21 + 2 * 510) + 1);
    // 62,461 files read from disk: about five seconds, more when the disk is busy.
  }, 60_000);

  it("holds every photograph's 64 px preview in one sheet, so the map shows all its orbs after one request", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    const sheets = [...(result.scene.extensionData.get(PREVIEW_SHEETS_EXTENSION) as ReadonlyMap<string, SheetRecord>).values()];
    expect(sheets.map(sheet => [sheet.id, sheet.width, sheet.height])).toEqual([["previews-64", 4 * 6 * 64, 15 * 64]]);
    const places = new Set<string>();
    for (const asset of result.scene.assets.values()) {
      const representations = asset.representations as readonly (BuiltInRepresentation & { sheet?: ResolvedSheetPlace })[];
      const first = representations.find(entry => entry.projection === "cube" && entry.faceSize === 64);
      const place = (first?.projection === "cube" ? first.sheet : undefined) as ResolvedSheetPlace | undefined;
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
      expect(tiled.map(value => {
        // The registered shared leaf hook validated this representation.
        const entry = value as TiledCubeRepresentationRecord;
        return [entry.id, entry.warp, entry.faceSize, entry.tileSize, entry.levelBytes.length];
      })).toEqual([
        ["eac-tiles", "equi-angular", 1536, 192, 4],
        ["cube-tiles", "gnomonic", 1536, 192, 4],
      ]);
    }
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
    expect((await import("./scenes")).TWIN_CITIES.url).toBe(published.pathname.slice(1));
    vi.stubEnv("VITE_TOUR_SCENE_URL", " https://content.example.org/twin-cities/r2/scene.json ");
    vi.resetModules();
    const configured = (await import("./scenes")).TWIN_CITIES;
    expect(configured.id).toBe(TWIN_CITIES.id);
    expect(configured.url).toBe("https://content.example.org/twin-cities/r2/scene.json");
  });
});
