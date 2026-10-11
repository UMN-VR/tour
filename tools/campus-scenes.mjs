#!/usr/bin/env node
/**
 * Writes the Minneapolis and Saint Paul tours' scenes from the Twin Cities one.
 *
 * Each campus's checkout beside this one lists its panoramas in campus.json; its
 * scene.json is the Twin Cities scene (../twin-cities/scene.json) with only those
 * panoramas, their photographs, the stops they are in and the links between
 * them. A link to a panorama on the other campus is left out, as is a stop with
 * none of the campus's panoramas. The overview looks at the campus's panoramas
 * from as far as their spread needs. The photographs stay where the Twin Cities
 * scene published them: every media URL points to ../twin-cities/media/.
 *
 *   node tools/campus-scenes.mjs           write both scenes
 *   node tools/campus-scenes.mjs --check   exit 1 if either scene is not what this would write
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CAMPUSES = ["minneapolis", "st-paul"];
const MEDIA = "../twin-cities/media/";

const metersPerDegree = 111_320;

/** The campus's scene, made from the Twin Cities scene and the campus's campus.json. */
export function campusScene(full, campus) {
  const members = new Set(campus.panoramas);
  const missing = campus.panoramas.filter(id => !full.entities.some(entity => entity.id === id));
  if (missing.length) throw new Error(`${campus.id}: the Twin Cities scene has no panorama ${missing.join(", ")}`);
  if (!members.has(campus.initialPanorama)) throw new Error(`${campus.id}: initialPanorama ${campus.initialPanorama} is not one of its panoramas`);

  const entities = full.entities.filter(entity => members.has(entity.id))
    .map(entity => entity.links ? { ...entity, links: entity.links.filter(link => members.has(link.target)) } : entity);
  const assetIds = new Set(entities.map(entity => entity.assetId));
  const groups = (full.groups ?? []).map(group => ({ ...group, members: group.members.filter(id => members.has(id)) }))
    .filter(group => group.members.length);

  const scene = {
    format: full.format,
    version: full.version,
    id: campus.id,
    revision: "",
    title: campus.title,
    requiredExtensions: full.requiredExtensions,
    extensions: {
      ...full.extensions,
      "umn-vr.tour": { ...full.extensions["umn-vr.tour"], campus: `The panoramas of ${full.id} revision ${full.revision} listed in this campus's campus.json, written by the tour's tools/campus-scenes.mjs.` },
    },
    assets: full.assets.filter(asset => assetIds.has(asset.id)),
    entities,
    groups,
    initialPanorama: campus.initialPanorama,
    overview: overviewOf(entities, full.overview),
    markerStyle: full.markerStyle,
  };
  const rebased = rebaseMedia(scene);
  rebased.revision = createHash("sha256").update(JSON.stringify(rebased)).digest("hex").slice(0, 12);
  return rebased;
}

/**
 * Looks down at the panoramas' captures as the Twin Cities overview does, from as far as their
 * spread needs: 0.8 times it, as the Twin Cities scene's 5000 m is for its panoramas' 6.3 km.
 */
function overviewOf(entities, like) {
  const longitudes = entities.map(entity => entity.capture.longitudeDeg);
  const latitudes = entities.map(entity => entity.capture.latitudeDeg);
  const [west, east, south, north] = [Math.min(...longitudes), Math.max(...longitudes), Math.min(...latitudes), Math.max(...latitudes)];
  const latitudeDeg = (south + north) / 2;
  const spread = Math.max((north - south) * metersPerDegree, (east - west) * metersPerDegree * Math.cos(latitudeDeg * Math.PI / 180));
  return {
    ...like,
    target: { longitudeDeg: round((west + east) / 2, 6), latitudeDeg: round(latitudeDeg, 6), height: null },
    distanceMeters: Math.max(1500, Math.round(spread * 0.8 / 100) * 100),
  };
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Every media URL, "media/…", as "../twin-cities/media/…". */
function rebaseMedia(value) {
  if (typeof value === "string") return value.startsWith("media/") ? MEDIA + value.slice("media/".length) : value;
  if (Array.isArray(value)) return value.map(rebaseMedia);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebaseMedia(entry)]));
  return value;
}

const text = scene => `${JSON.stringify(scene, null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sibling = path => new URL(`../../${path}`, import.meta.url);
  const full = JSON.parse(readFileSync(sibling("twin-cities/scene.json"), "utf8"));
  const check = process.argv.includes("--check");
  let stale = false;
  for (const name of CAMPUSES) {
    const campus = JSON.parse(readFileSync(sibling(`${name}/campus.json`), "utf8"));
    const written = text(campusScene(full, campus));
    const file = sibling(`${name}/scene.json`);
    if (check) {
      let current = "";
      try { current = readFileSync(file, "utf8"); } catch { /* not written yet */ }
      if (current !== written) { stale = true; console.error(`${name}/scene.json is not what tools/campus-scenes.mjs writes; run it.`); }
    } else {
      writeFileSync(file, written);
      console.log(`Wrote ${name}/scene.json: ${campus.panoramas.length} panoramas.`);
    }
  }
  if (stale) process.exitCode = 1;
}
