/**
 * Pose-only scene update. It rewrites capture, orientation, marker placement,
 * hotspot directions, opening views, and the north summary from placements.json.
 * Photographs, preview sheets, and entity membership stay as they are.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { hotspotDirection, startDirection, toWorld } from "./youvisit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION = "umn-vr.tour";
export const RING_METERS = 15;
export const DEFAULT_OFFSET_M = 25;
const PUBLISHED = "https://umn-vr.github.io/tour/twin-cities/scene.json";

const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

export function sceneRevision(scene) {
  return createHash("sha256").update(JSON.stringify({ ...scene, revision: "" })).digest("hex").slice(0, 12);
}

/** East/north display offsets for panoramas that share a capture point. Index 0 stays at the point. */
export function markerOffsets(order, captureOf) {
  const atPoint = new Map();
  for (const id of order) {
    const capture = captureOf(id);
    const key = `${capture.longitudeDeg},${capture.latitudeDeg}`;
    if (!atPoint.has(key)) atPoint.set(key, []);
    atPoint.get(key).push(id);
  }
  const offsets = new Map();
  for (const id of order) {
    const capture = captureOf(id);
    const shared = atPoint.get(`${capture.longitudeDeg},${capture.latitudeDeg}`);
    const index = shared.indexOf(id);
    let eastM = 0;
    let northM = 0;
    if (index > 0) {
      const angle = (2 * Math.PI * (index - 1)) / (shared.length - 1);
      eastM = round(RING_METERS * Math.sin(angle), 2);
      northM = round(RING_METERS * Math.cos(angle), 2);
    }
    offsets.set(id, { eastM, northM });
  }
  return offsets;
}

function placementsById(panoramas) {
  const byId = new Map();
  for (const [key, placement] of Object.entries(panoramas)) {
    if (!placement?.id) throw new Error(`placements entry ${key} has no id`);
    if (byId.has(placement.id)) throw new Error(`placements.json uses the id ${placement.id} twice`);
    byId.set(placement.id, placement);
  }
  return byId;
}

function close(left, right, epsilon) {
  return Math.abs(left - right) <= epsilon;
}

function poseInputsMatch(entity, placement) {
  const pose = entity.imagePose ?? {};
  return close(pose.headingDeg, placement.pose.headingDeg, 1e-4)
    && close(pose.pitchDeg, placement.pose.pitchDeg, 1e-4)
    && close(pose.rollDeg, placement.pose.rollDeg, 1e-4);
}

function authoredStart(start) {
  return start && (start.fov !== null || start.lon !== 180 || start.lat !== 0) ? start : null;
}

/** Image-local hotspot and start angles from a YouVisit backup, keyed by placement id. */
export function loadPoseLocals(backup, panoramas) {
  const stops = JSON.parse(readFileSync(path.join(backup, "api", "v1.2-stops.json"), "utf8")).data;
  const byImage = new Map();
  const image = id => {
    const key = String(id);
    if (!byImage.has(key)) byImage.set(key, { starts: [], hotspots: [] });
    return byImage.get(key);
  };
  for (const stop of stops) {
    for (const item of stop.panoramas ?? []) {
      const record = image(item.id);
      record.starts.push({ lon: Number(item.start_lon), lat: Number(item.start_lat), fov: item.start_fov == null ? null : Number(item.start_fov) });
      for (const hotspot of item.hotspots ?? []) record.hotspots.push({ id: String(hotspot.id), coordinates: hotspot.coordinates });
    }
  }
  const byEntity = new Map();
  for (const [key, placement] of Object.entries(panoramas)) {
    const sources = [key, ...(placement.sameImage ?? [])].map(id => byImage.get(String(id))).filter(Boolean);
    const start = sources.flatMap(source => source.starts).find(authoredStart) ?? null;
    const hotspots = new Map();
    for (const source of sources) for (const hotspot of source.hotspots) if (!hotspots.has(hotspot.id)) hotspots.set(hotspot.id, hotspot);
    byEntity.set(placement.id, { start, hotspots });
  }
  return byEntity;
}

function applyEntity(entity, placement, offsets, locals) {
  const pose = {
    headingDeg: placement.pose.headingDeg,
    pitchDeg: placement.pose.pitchDeg,
    rollDeg: placement.pose.rollDeg,
  };
  const keepDirections = poseInputsMatch(entity, placement);
  if (!keepDirections) {
    for (const link of entity.links ?? []) {
      if (!link.direction || !String(link.id).startsWith("hotspot-")) continue;
      const hotspot = locals?.hotspots.get(String(link.id).slice("hotspot-".length));
      if (!hotspot?.coordinates?.length) {
        throw new Error(`${entity.id} changed orientation and its hotspot ${link.id} has no image-local angle to recompute. A YouVisit backup is required; published directions are not inverted.`);
      }
      link.direction = toWorld(hotspotDirection(hotspot.coordinates[0]), pose);
    }
    if (entity.initialView) {
      const start = locals?.start ?? null;
      if (!start) throw new Error(`${entity.id} changed orientation and its opening view has no image-local angle to recompute. A YouVisit backup is required; the published view is not inverted.`);
      const world = toWorld(startDirection(start), pose);
      entity.initialView = { ...entity.initialView, headingDeg: world.headingDeg, pitchDeg: world.pitchDeg };
    }
  }
  const ring = offsets.get(entity.id);
  const override = placement.marker ?? {};
  entity.capture = {
    ...entity.capture,
    longitudeDeg: placement.capture.longitudeDeg,
    latitudeDeg: placement.capture.latitudeDeg,
    height: placement.capture.height ?? null,
  };
  entity.imagePose = { ...entity.imagePose, ...pose, aligned: placement.pose.aligned === true };
  entity.marker = {
    ...entity.marker,
    mode: placement.capture.height ? "capture-relative" : "ground-relative",
    offsetM: DEFAULT_OFFSET_M,
    radiusMeters: entity.marker?.radiusMeters ?? 3,
    ...override,
    eastM: override.eastM ?? ring.eastM,
    northM: override.northM ?? ring.northM,
  };
  const tour = entity.extensions?.[EXTENSION];
  if (tour) {
    tour.capture = placement.capture.source;
    if (tour.north) tour.north.provenance = placement.pose.provenance;
  }
}

/**
 * Returns the scene with placements applied. Unchanged placements keep the same
 * object, so the published revision is not replaced by a rebuild.
 */
export function applyPlacementPoses(scene, panoramas, locals = null) {
  const byId = placementsById(panoramas);
  const entities = scene.entities ?? [];
  const panoramasInScene = entities.filter(entity => entity.type === "panorama");
  const sceneIds = new Set(panoramasInScene.map(entity => entity.id));
  const missing = [...byId.keys()].filter(id => !sceneIds.has(id));
  const extra = [...sceneIds].filter(id => !byId.has(id));
  if (missing.length || extra.length) {
    throw new Error(`Pose-only rebuild cannot change which photographs are in the scene. Missing from the scene: ${missing.join(", ") || "none"}. Missing from placements: ${extra.join(", ") || "none"}.`);
  }
  const next = structuredClone(scene);
  const order = next.entities.filter(entity => entity.type === "panorama").map(entity => entity.id);
  const offsets = markerOffsets(order, id => byId.get(id).capture);
  for (const entity of next.entities) {
    if (entity.type !== "panorama") continue;
    applyEntity(entity, byId.get(entity.id), offsets, locals?.get(entity.id) ?? null);
  }
  const aligned = next.entities.filter(entity => entity.type === "panorama" && entity.imagePose?.aligned === true).length;
  const total = order.length;
  const summary = `${aligned} of ${total} panoramas have north set; the others face an arbitrary direction.`;
  if (next.extensions?.[EXTENSION]) next.extensions[EXTENSION].north = summary;
  if (JSON.stringify(next) === JSON.stringify(scene)) return { scene, changed: false, revision: scene.revision };
  next.revision = sceneRevision(next);
  return { scene: next, changed: true, revision: next.revision };
}

function scenesNodeHref() {
  return pathToFileURL(fileURLToPath(new URL("../../node_modules/foss-earth/node_modules/@foss-earth/scenes/node/scene-check.mjs", import.meta.url))).href;
}

async function validate(scene) {
  const { validateSceneDocument } = await import(scenesNodeHref());
  const result = validateSceneDocument(JSON.stringify(scene), { baseUrl: PUBLISHED });
  if (!result.ok) {
    const errors = (result.errors ?? []).map(error => error.message ?? JSON.stringify(error)).join("\n");
    throw new Error(`The pose-only scene is not valid.\n${errors}`);
  }
}

function writeAtomic(file, text, original) {
  if (existsSync(file) && readFileSync(file, "utf8") !== original) throw new Error(`${file} changed since it was read. Nothing was written.`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, text);
  try { renameSync(temporary, file); }
  catch (error) { rmSync(temporary, { force: true }); throw error; }
}

function defaultBackup() {
  const root = path.resolve(here, "..", "..", ".local", "youvisit-backup");
  if (!existsSync(root)) return null;
  const snapshot = readdirSync(root).filter(name => name.startsWith("snapshot-")).sort().at(-1);
  return snapshot ? path.join(root, snapshot) : null;
}

/** Reads placements and a scene, updates pose-derived fields, validates, and writes when asked. */
export async function runPoseOnly(options = {}) {
  const placementsPath = path.resolve(options.placements ?? path.join(here, "placements.json"));
  const scenePath = path.resolve(options.scene ?? path.resolve(here, "..", "..", "..", "twin-cities", "scene.json"));
  const outputPath = path.resolve(options.output ?? scenePath);
  const original = readFileSync(scenePath, "utf8");
  const scene = JSON.parse(original);
  const placements = JSON.parse(readFileSync(placementsPath, "utf8"));
  const backup = options.backup ? path.resolve(options.backup) : defaultBackup();
  const locals = backup ? loadPoseLocals(backup, placements.panoramas) : null;
  const applied = applyPlacementPoses(scene, placements.panoramas, locals);
  await validate(applied.scene);
  const text = `${JSON.stringify(applied.scene, null, 2)}\n`;
  if (!applied.changed && outputPath === scenePath) return `Unchanged ${scenePath}, revision ${applied.revision}.`;
  if (outputPath === scenePath) writeAtomic(outputPath, text, original);
  else writeFileSync(outputPath, text);
  return `Wrote ${outputPath}, revision ${applied.revision}.`;
}
