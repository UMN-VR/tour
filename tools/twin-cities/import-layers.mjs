/**
 * Applies an exported layer-override file to the tour placements and the Twin
 * Cities scene. The default is a dry run. --write updates placements, moves
 * the photographs in twin-cities/scene.json, and regenerates the campus scenes.
 * It does not rebuild photographs.
 *
 *   node tools/twin-cities/import-layers.mjs --input build/umn-tour-layers.json
 *   node tools/twin-cities/import-layers.mjs --input build/umn-tour-layers.json --write
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPUSES, campusScene } from "../campus-scenes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FORMAT = "foss-earth-layer-overrides";
const VERSION = 1;
const SCENE_IDS = new Set(["umn-twin-cities", "umn-minneapolis", "umn-st-paul"]);

function text(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function sceneUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/** indoor or outdoor, from the panoramas layer the photograph was dropped on. */
export function placementLayer(layers, layerId, parent = null) {
  for (const layer of layers ?? []) {
    if (layer.id === layerId) {
      if (layer.kind !== "panoramas") return null;
      if (parent?.id === "indoor" || parent?.id === "outdoor") return parent.id;
      return null;
    }
    const found = placementLayer(layer.layers, layerId, layer);
    if (found) return found;
  }
  return null;
}

function moveMember(layers, entityId, layerId) {
  let target = false;
  const walk = nodes => {
    for (const layer of nodes ?? []) {
      if (layer.kind === "panoramas" && Array.isArray(layer.members)) {
        const had = layer.members.includes(entityId);
        if (layer.id === layerId) {
          target = true;
          if (!had) layer.members.push(entityId);
        } else if (had) layer.members = layer.members.filter(id => id !== entityId);
      }
      walk(layer.layers);
    }
  };
  walk(layers);
  return target;
}

function withLayer(record, layer) {
  const next = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "title") { next.title = value; next.layer = layer; }
    else if (key !== "layer") next[key] = value;
  }
  if (next.layer === undefined) next.layer = layer;
  return next;
}

/**
 * Plans the placement and scene changes. `placements` is the tour placements
 * document. `scene` is the Twin Cities scene. Neither argument is modified.
 */
export function planLayerImport(placements, scene, exported) {
  const rows = [];
  if (!exported || exported.format !== FORMAT || exported.version !== VERSION || !Array.isArray(exported.scenes)) {
    return { ok: false, rows, messages: ["The export is not foss-earth layer overrides version 1."], placements: null, scene: null };
  }
  const byId = new Map();
  for (const [key, record] of Object.entries(placements?.panoramas ?? {})) {
    if (!record?.id) return { ok: false, rows, messages: [`placements entry ${key} has no id`], placements: null, scene: null };
    if (byId.has(record.id)) return { ok: false, rows, messages: [`placements.json uses ${record.id} more than once`], placements: null, scene: null };
    byId.set(record.id, key);
  }
  const entityIds = new Set((scene?.entities ?? []).map(entity => entity.id));
  const chosen = new Map();
  let invalid = false;
  for (const item of exported.scenes) {
    if (!SCENE_IDS.has(item?.sceneId) || !sceneUrl(item?.sceneUrl) || !Array.isArray(item?.edits)) {
      invalid = true;
      rows.push({ id: item?.sceneId ?? "", status: "invalid", note: "A scene must be a campus tour scene with an http(s) URL and no query." });
      continue;
    }
    for (const edit of item.edits) {
      if (!text(edit?.entityId) || !text(edit?.layerId)) {
        invalid = true;
        rows.push({ id: edit?.entityId ?? "", status: "invalid", note: "An edit is missing its photograph or layer." });
        continue;
      }
      const category = placementLayer(scene?.layers, edit.layerId);
      if (!category) {
        invalid = true;
        rows.push({ id: edit.entityId, status: "invalid", note: `${edit.layerId} is not an indoor or outdoor 360 images layer.` });
        continue;
      }
      if (!byId.has(edit.entityId) || !entityIds.has(edit.entityId)) {
        invalid = true;
        rows.push({ id: edit.entityId, status: "unknown", note: `${edit.entityId} is not a photograph in the Twin Cities scene.` });
        continue;
      }
      const previous = chosen.get(edit.entityId);
      if (previous && previous.category !== category) {
        invalid = true;
        rows.push({ id: edit.entityId, status: "conflicting", note: `${edit.entityId} is ${previous.category} in one scene and ${category} in another.` });
        continue;
      }
      chosen.set(edit.entityId, { category, layerId: edit.layerId });
    }
  }
  if (invalid) return { ok: false, rows, messages: [], placements: null, scene: null };
  const nextPlacements = structuredClone(placements);
  const nextScene = structuredClone(scene);
  for (const [id, change] of chosen) {
    const key = byId.get(id);
    const current = nextPlacements.panoramas[key].layer ?? null;
    nextPlacements.panoramas[key] = withLayer(nextPlacements.panoramas[key], change.category);
    if (!moveMember(nextScene.layers, id, change.layerId)) {
      rows.push({ id, status: "invalid", note: `${change.layerId} is not in the scene.` });
      return { ok: false, rows, messages: [], placements: null, scene: null };
    }
    rows.push({ id, status: current === change.category ? "already-applied" : "accepted", layer: change.category, note: current === change.category ? "Already in that layer." : `${current ?? "unset"} → ${change.category}.` });
  }
  const empty = [];
  const walk = nodes => {
    for (const layer of nodes ?? []) {
      if (layer.kind === "panoramas" && (!Array.isArray(layer.members) || layer.members.length === 0)) empty.push(layer.id);
      walk(layer.layers);
    }
  };
  walk(nextScene.layers);
  if (empty.length) {
    rows.push({ id: empty.join(", "), status: "invalid", note: "A 360 images layer would have no photographs." });
    return { ok: false, rows, messages: [], placements: null, scene: null };
  }
  return { ok: true, rows, messages: [], placements: nextPlacements, scene: nextScene };
}

export function revisionOf(scene) {
  const copy = { ...scene, revision: "" };
  return createHash("sha256").update(JSON.stringify(copy)).digest("hex").slice(0, 12);
}

function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try { renameSync(temporary, file); }
  catch (error) { rmSync(temporary, { force: true }); throw error; }
}

function report(plan) {
  if (!plan.rows.length && plan.ok) return "No layer corrections to apply.";
  return [...plan.messages, ...plan.rows.map(row => `${row.status}: ${row.id}. ${row.note}`)].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFlag = process.argv.indexOf("--input");
  const input = inputFlag >= 0 ? process.argv[inputFlag + 1] : "";
  if (!input) throw new Error("Pass --input <exported-layers.json>.");
  const placementsPath = path.join(here, "placements.json");
  const appPlacementsPath = path.resolve(here, "../../../app/tools/twin-cities/placements.json");
  const scenePath = path.resolve(here, "../../../twin-cities/scene.json");
  const plan = planLayerImport(JSON.parse(readFileSync(placementsPath, "utf8")), JSON.parse(readFileSync(scenePath, "utf8")), JSON.parse(readFileSync(input, "utf8")));
  console.log(report(plan));
  if (!plan.ok) process.exitCode = 1;
  else if (process.argv.includes("--write")) {
    plan.scene.revision = revisionOf(plan.scene);
    writeJson(placementsPath, plan.placements);
    writeJson(scenePath, plan.scene);
    if (existsSync(appPlacementsPath)) writeJson(appPlacementsPath, plan.placements);
    for (const name of CAMPUSES) {
      const campus = JSON.parse(readFileSync(path.resolve(here, `../../../${name}/campus.json`), "utf8"));
      writeJson(path.resolve(here, `../../../${name}/scene.json`), campusScene(plan.scene, campus));
    }
    console.log(`Wrote placements and scenes at revision ${plan.scene.revision}.`);
  }
}
