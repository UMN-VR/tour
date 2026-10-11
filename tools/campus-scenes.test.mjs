import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkSceneFiles, validateScene } from "foss-earth/scenes";
import { CAMPUSES, campusScene } from "./campus-scenes.mjs";

const sibling = file => JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));
const full = sibling("twin-cities/scene.json");
const site = path.resolve(process.env.TOUR_PUBLIC?.trim() || "public");
const media = path.join(site, "tour/twin-cities/media");

describe.each(CAMPUSES)("the %s tour's scene", name => {
  const campus = sibling(`${name}/campus.json`);
  const written = sibling(`${name}/scene.json`);
  const published = `https://umn-vr.github.io/tour/${name}/scene.json`;
  const result = validateScene(JSON.stringify(written), { baseUrl: published });

  it("is what tools/campus-scenes.mjs writes from the Twin Cities scene", () => {
    expect(written).toEqual(campusScene(full, campus));
  });

  it("is a valid scene, opening on the campus's first stop", () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(written.initialPanorama).toBe(campus.initialPanorama);
  });

  it("has the campus's panoramas, each as the Twin Cities scene has it but for links to the other campus", () => {
    expect(written.entities.map(entity => entity.id)).toEqual(campus.panoramas);
    for (const entity of written.entities) {
      const original = full.entities.find(candidate => candidate.id === entity.id);
      expect({ ...entity, links: undefined }).toEqual({ ...original, links: undefined });
      expect(entity.links).toEqual(original.links?.filter(link => campus.panoramas.includes(link.target)));
    }
  });

  it("finds its photographs where the Twin Cities scene published them", () => {
    if (!result.ok) throw new Error("the scene is not valid");
    const report = checkSceneFiles(result.scene, url => {
      expect(url.startsWith("https://umn-vr.github.io/tour/twin-cities/media/")).toBe(true);
      const file = path.join(site, new URL(url).pathname);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : existsSync(media) ? null : new Uint8Array();
    });
    if (existsSync(media)) expect(report.problems).toEqual([]);
  }, 60_000);
});

describe("the campus tours", () => {
  it("between them have every Twin Cities panorama once", () => {
    const panoramas = CAMPUSES.flatMap(name => sibling(`${name}/campus.json`).panoramas);
    expect([...panoramas].sort()).toEqual(full.entities.map(entity => entity.id).sort());
  });
});
