#!/usr/bin/env node
/**
 * Builds the Twin Cities campus tour as a FOSS Earth scene from the YouVisit
 * backup: public/tour/twin-cities/scene.json, and the prepared images under
 * public/tour/twin-cities/media/<panorama>/. The tour page serves both.
 *
 *   npm run build:scene
 *
 * What comes from where:
 *   - the YouVisit backup (.local/youvisit-backup/snapshot-*): the images, the
 *     stops and their order, titles and descriptions, the hotspots that link
 *     one panorama to another and where they point, and each stop's start view;
 *   - tools/twin-cities/placements.json, edited by hand: which image each
 *     panorama is, its id and title, where it was taken and which way is north;
 *   - FOSS Earth, the package this repository installs: its scripts/prepare-panorama.mjs
 *     turns each image into preview cubes, whole images and tiled cubes, its
 *     scripts/lib/previewSheet.mjs puts every panorama's smallest preview cube into one
 *     image, and its scripts/check-scene.mjs checks the result the way the viewer will read it.
 *
 * Options:
 *   --backup dir                 the snapshot to read (default: the newest .local/youvisit-backup/snapshot-*)
 *   --foss-earth dir             another FOSS Earth checkout (default: the installed foss-earth package)
 *   --preview-face-sizes 64,128,256   preview cube faces, px
 *   --preview-sheet 64           the preview cubes put together in one image, media/previews-<size>.jpg,
 *                                which shows every orb after one request: the size orbs load first
 *                                (default: the smallest preview face size); "" for none
 *   --immersion-widths 2048,4096,6144 whole images for looking around, px; 6144 is YouVisit's full width
 *   --tiles eac,cube             tiled cubes for looking around: equi-angular and ordinary, each of
 *                                1536 px faces (6144 / 4) in tiles of --tile-size; "" for none
 *   --tile-size 192              a tile's texels a side
 *   --quality 80                 JPEG quality; YouVisit's own files are 75 to 80
 *   --jobs 3                     images prepared at once; each takes about 1.5 GB of memory
 *
 * An image already prepared from the same file with the same options is not
 * prepared again, so a change to placements.json rebuilds in seconds.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hotspotDirection, plain, startDirection, toWorld } from "./youvisit.mjs";
import { markerOffsets } from "./scene-pose.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const PUBLISHED = "https://umn-vr.github.io/tour/twin-cities/scene.json";
const EXTENSION = "umn-vr.tour";
/** The Regents hold the copyright on the tour's photographs. */
const ATTRIBUTION = "© Regents of the University of Minnesota";

// ─── options ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const [name, inline] = arg.slice(2).split("=", 2);
    if (name === "help" || name === "poses-only") { options[name] = inline ?? true; continue; }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    options[name] = value;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}
if (options["poses-only"]) {
  const { runPoseOnly } = await import("./scene-pose.mjs");
  try { console.log(await runPoseOnly(options)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
  process.exit(0);
}
const backupRoot = path.join(repo, ".local", "youvisit-backup");
const backup = path.resolve(options.backup ?? path.join(backupRoot, readdirSync(backupRoot).filter(name => name.startsWith("snapshot-")).sort().at(-1)));
const installed = path.join(repo, "node_modules", "foss-earth");
if (!options["foss-earth"] && !existsSync(installed)) throw new Error("foss-earth is not installed; run npm install first");
const fossEarth = path.resolve(options["foss-earth"] ?? realpathSync(installed));
const previewSizes = (options["preview-face-sizes"] ?? "64,128,256").split(",").map(Number);
const sheetSize = options["preview-sheet"] === "" ? null : Number(options["preview-sheet"] ?? Math.min(...previewSizes));
const immersionWidths = (options["immersion-widths"] ?? "2048,4096,6144").split(",").map(Number);
const quality = Number(options.quality ?? 80);
const tileKinds = (options.tiles ?? "eac,cube").split(",").filter(Boolean);
const tileSize = Number(options["tile-size"] ?? 192);
const jobs = Math.max(1, Number(options.jobs ?? 3));
const out = path.join(repo, "public", "tour", "twin-cities");
const media = path.join(out, "media");
for (const file of ["scripts/prepare-panorama.mjs", "scripts/check-scene.mjs", "scripts/lib/previewSheet.mjs"]) {
  if (!existsSync(path.join(fossEarth, file))) throw new Error(`${fossEarth} has no ${file}; update FOSS Earth, or pass --foss-earth <checkout>`);
}

// ─── the YouVisit data ───────────────────────────────────────────────────

const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const api = name => readJson(path.join(backup, "api", name));
const stops = api("v1.2-stops.json").data;
const stopOrder = api("v2-stops-tours.json").resources.tour3.stops.map(stop => stop.stopid);
const stopById = new Map(stops.map(stop => [stop.stopid, stop]));
const locations = new Map(readJson(path.join(backup, "panorama-locations.json")).map(row => [row.panorama, row]));

/** Every YouVisit panorama id the tour data names: its text, its stops, its start view and its hotspots. */
const panoramas = new Map();
function panorama(id) {
  const key = String(id);
  if (!panoramas.has(key)) panoramas.set(key, { id: key, title: "", description: "", stops: [], start: null, hotspots: [] });
  return panoramas.get(key);
}
for (const stopId of stopOrder) {
  const stop = stopById.get(stopId);
  for (const item of stop.panoramas) {
    const entry = panorama(item.id);
    entry.title ||= plain(item.title);
    entry.description ||= plain(item.description);
    if (!entry.stops.includes(stopId)) entry.stops.push(stopId);
    entry.start ??= { lon: Number(item.start_lon), lat: Number(item.start_lat), fov: item.start_fov == null ? null : Number(item.start_fov) };
    for (const hotspot of item.hotspots ?? []) {
      for (const opens of hotspot.media_items ?? []) {
        if (opens.item_type !== "panorama") continue;
        const target = panorama(opens.item_id);
        target.title ||= plain(hotspot.title);
        target.description ||= plain(hotspot.description);
        if (!target.stops.includes(stopId)) target.stops.push(stopId);
        entry.hotspots.push({ id: hotspot.id, target: String(opens.item_id), coordinates: hotspot.coordinates });
      }
    }
  }
}

// ─── images and placements ───────────────────────────────────────────────

const placements = readJson(path.join(here, "placements.json")).panoramas;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const imageFile = id => path.join(backup, "media", "panoramas", id, "6144.jpg");

/**
 * The photographs: each placements.json entry, with the YouVisit ids its sameImage lists. Byte-identical
 * files must share an entry; a photograph uploaded twice with different bytes is listed there by hand.
 */
const idOfImage = new Map();
const entityOf = new Map();
for (const [key, placement] of Object.entries(placements)) {
  if (idOfImage.has(placement.id)) throw new Error(`placements.json uses the id ${placement.id} twice`);
  const ids = [key, ...(placement.sameImage ?? [])];
  for (const id of ids) {
    if (entityOf.has(id)) throw new Error(`placements.json lists panorama ${id} under both ${entityOf.get(id)} and ${placement.id}`);
    if (!existsSync(imageFile(id))) throw new Error(`placements.json names panorama ${id}, which has no image in ${backup}`);
    entityOf.set(id, placement.id);
  }
  idOfImage.set(placement.id, { hash: sha256(readFileSync(imageFile(key))), key, ids, placement });
}
const byHash = new Map();
for (const id of new Set([...panoramas.keys(), ...locations.keys()])) {
  if (!entityOf.has(id)) throw new Error(`panorama ${id} of the backup is not in placements.json, as an entry or in a sameImage list`);
  const hash = sha256(readFileSync(imageFile(id)));
  if (byHash.has(hash) && entityOf.get(byHash.get(hash)) !== entityOf.get(id)) throw new Error(`panoramas ${byHash.get(hash)} and ${id} are the same file but different entries of placements.json`);
  byHash.set(hash, id);
}

// ─── preparing the images ────────────────────────────────────────────────

const NEUTRAL_POSE = { headingDeg: 0, pitchDeg: 0, rollDeg: 0, provenance: "Preparation does not depend on the pose; the scene's imagePose comes from tools/twin-cities/placements.json." };

function prepared(entityId, hash) {
  const record = path.join(media, entityId, "prepared.json");
  if (!existsSync(record)) return null;
  const provenance = readJson(record);
  const same = provenance.source?.sha256 === hash
    && JSON.stringify(provenance.settings?.previewSizes) === JSON.stringify(previewSizes)
    && JSON.stringify(provenance.settings?.immersionWidths) === JSON.stringify(immersionWidths)
    && provenance.settings?.encoding === "jpeg" && provenance.settings?.quality === quality
    && JSON.stringify(provenance.settings?.tiles?.kinds ?? []) === JSON.stringify(tileKinds)
    && (tileKinds.length === 0 || provenance.settings?.tiles?.tileSize === tileSize);
  return same ? readJson(path.join(media, entityId, "asset.fragment.json")).asset : null;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("close", code => (code === 0 ? resolve(output) : reject(new Error(`${path.basename(args[0])} exited ${code}: ${output.trim()}`))));
  });
}

async function prepareAll() {
  mkdirSync(media, { recursive: true });
  const scratch = path.join(repo, ".local", "tour-build");
  mkdirSync(scratch, { recursive: true });
  const posePath = path.join(scratch, "neutral-pose.json");
  writeFileSync(posePath, JSON.stringify(NEUTRAL_POSE, null, 2));
  const assets = new Map();
  const queue = [];
  for (const [entityId, { hash, key }] of idOfImage) {
    const asset = prepared(entityId, hash);
    if (asset) assets.set(entityId, asset);
    else queue.push({ entityId, key });
  }
  let done = 0;
  const total = queue.length;
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const folder = path.join(media, job.entityId);
      rmSync(folder, { recursive: true, force: true });
      await run(process.execPath, [
        path.join(fossEarth, "scripts", "prepare-panorama.mjs"),
        "--input", imageFile(job.key), "--pose", posePath, "--asset-id", job.entityId,
        "--preview-face-sizes", previewSizes.join(","), "--immersion-widths", immersionWidths.join(","),
        "--encoding", "jpeg", "--quality", String(quality),
        ...(tileKinds.length ? ["--tiles", tileKinds.join(","), "--tile-size", String(tileSize)] : []),
        "--attribution", ATTRIBUTION, "--url-prefix", `media/${job.entityId}/`, "--out", folder,
      ]);
      assets.set(job.entityId, readJson(path.join(folder, "asset.fragment.json")).asset);
      console.log(`prepared ${job.entityId} (${++done} of ${total})`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  // Folders of images no longer in the scene. Only prepared output is removed.
  for (const name of readdirSync(media)) {
    if (!idOfImage.has(name) && existsSync(path.join(media, name, "prepared.json"))) rmSync(path.join(media, name), { recursive: true });
  }
  return assets;
}

// ─── the scene ───────────────────────────────────────────────────────────

/** The order panoramas appear in: each stop's main view, its gallery, then what its hotspots open; retired stops last. */
function entityOrder() {
  const order = [];
  const add = id => { const entity = entityOf.get(String(id)); if (entity && !order.includes(entity)) order.push(entity); };
  for (const stopId of stopOrder) {
    const stop = stopById.get(stopId);
    add(stop.main_media_id);
    for (const item of stop.panoramas) add(item.id);
    for (const item of stop.panoramas) for (const hotspot of panorama(item.id).hotspots) add(hotspot.target);
  }
  for (const id of [...idOfImage.values()].map(image => image.key).sort()) add(id);
  return order;
}

function buildScene(assets) {
  const order = entityOrder();
  const titleOf = entityId => idOfImage.get(entityId).placement.title;
  const mainOf = stopId => entityOf.get(String(stopById.get(stopId).main_media_id));
  const stopNumber = stopId => stopOrder.indexOf(stopId) + 1;
  const stopTitle = stopId => plain(stopById.get(stopId).title);

  const offsets = markerOffsets(order, entityId => idOfImage.get(entityId).placement.capture);
  const markerOf = entityId => {
    const { placement } = idOfImage.get(entityId);
    const { eastM, northM } = offsets.get(entityId);
    return { mode: "ground-relative", eastM, northM, offsetM: 25, radiusMeters: 3, ...placement.marker };
  };

  const entities = order.map(entityId => {
    const { ids, placement } = idOfImage.get(entityId);
    const pose = { headingDeg: placement.pose.headingDeg, pitchDeg: placement.pose.pitchDeg, rollDeg: placement.pose.rollDeg };
    const sources = ids.map(id => panoramas.get(id)).filter(Boolean);
    const stopsOf = [...new Set(sources.flatMap(source => source.stops))].sort((a, b) => stopNumber(a) - stopNumber(b));
    const retired = ids.map(id => locations.get(id)).find(row => row?.roles.includes("retired stop main"));
    // YouVisit's description, or a sentence it used as a title; not a line that only repeats the name.
    const description = [...sources.map(source => source.description), ...sources.map(source => source.title)]
      .find(text => text && text.length >= 40 && text !== placement.title);

    const links = [];
    const linked = new Set([entityId]);
    // YouVisit's hotspots: they open another panorama and point at it.
    for (const source of sources) {
      for (const hotspot of source.hotspots) {
        const target = entityOf.get(hotspot.target);
        if (!target || linked.has(target) || !hotspot.coordinates?.length) continue;
        linked.add(target);
        const direction = toWorld(hotspotDirection(hotspot.coordinates[0]), pose);
        links.push({ id: `hotspot-${hotspot.id}`, target, label: titleOf(target), direction });
      }
    }
    // The rest of each stop, from its main view, and the way back to it from the others.
    for (const stopId of stopsOf) {
      const main = mainOf(stopId);
      if (main === entityId) {
        for (const item of stopById.get(stopId).panoramas) {
          const target = entityOf.get(String(item.id));
          if (linked.has(target)) continue;
          linked.add(target);
          links.push({ id: `stop-${stopId}-${target}`, target, label: titleOf(target) });
        }
      } else if (!linked.has(main)) {
        linked.add(main);
        links.push({ id: `stop-${stopId}`, target: main, label: `Back to ${titleOf(main)}` });
      }
    }
    // The tour's order, as YouVisit's Next and Previous buttons.
    for (const stopId of stopsOf.filter(stopId => mainOf(stopId) === entityId)) {
      const index = stopOrder.indexOf(stopId);
      if (index + 1 < stopOrder.length) links.push({ id: "next-stop", target: mainOf(stopOrder[index + 1]), label: `Next stop: ${stopTitle(stopOrder[index + 1])}` });
      if (index > 0) links.push({ id: "previous-stop", target: mainOf(stopOrder[index - 1]), label: `Previous stop: ${stopTitle(stopOrder[index - 1])}` });
    }

    // Only a start view someone chose; YouVisit's default (180°, 0°, no field of view) is not one.
    const authored = sources.map(source => source.start).find(start => start && (start.fov !== null || start.lon !== 180 || start.lat !== 0));
    const initialView = authored ? { ...toWorld(startDirection(authored), pose), verticalFovDeg: authored.fov ?? 100 } : undefined;

    return {
      id: entityId,
      type: "panorama",
      assetId: entityId,
      title: placement.title,
      ...(description ? { description } : {}),
      capture: {
        longitudeDeg: placement.capture.longitudeDeg,
        latitudeDeg: placement.capture.latitudeDeg,
        height: null,
        ...(placement.capture.horizontalAccuracyMeters ? { horizontalAccuracyMeters: placement.capture.horizontalAccuracyMeters } : {}),
      },
      imagePose: { ...pose, aligned: placement.pose.aligned === true },
      marker: markerOf(entityId),
      ...(initialView ? { initialView } : {}),
      ...(links.length ? { links } : {}),
      extensions: {
        [EXTENSION]: {
          youvisit: { panoramas: ids.map(Number), stops: stopsOf, ...(retired ? { retiredStop: retired.stop } : {}) },
          capture: placement.capture.source,
          north: { provenance: placement.pose.provenance },
        },
      },
    };
  });

  const mapLayers = authored => {
    const members = { outdoor: [], indoor: [] };
    for (const entity of authored) {
      const layer = idOfImage.get(entity.id).placement.layer;
      if (layer !== "outdoor" && layer !== "indoor") throw new Error(`placements.json: ${entity.id} needs "layer": "indoor" or "outdoor"`);
      members[layer].push(entity.id);
    }
    const images = (id, title) => ({
      id, title, visible: true,
      layers: [{ id: `${id}-360`, title: "360 images", kind: "panoramas", visible: true, members: members[id] }],
    });
    return [images("outdoor", "Outdoor"), images("indoor", "Indoor")];
  };
  const slug = text => text.toLowerCase().replace(/\(.*?\)/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const groups = stopOrder.map(stopId => {
    const stop = stopById.get(stopId);
    const members = [];
    const add = id => { const entity = entityOf.get(String(id)); if (entity && !members.includes(entity)) members.push(entity); };
    add(stop.main_media_id);
    for (const item of stop.panoramas) add(item.id);
    for (const item of stop.panoramas) for (const hotspot of panorama(item.id).hotspots) add(hotspot.target);
    return { id: slug(stopTitle(stopId)), title: `${stopNumber(stopId)}. ${stopTitle(stopId)}`, members, extensions: { [EXTENSION]: { youvisitStop: stopId, number: stopNumber(stopId) } } };
  });
  const retiredMembers = order.filter(entityId => idOfImage.get(entityId).ids.some(id => locations.get(id)?.roles.includes("retired stop main")));
  groups.push({
    id: "earlier-tour-stops",
    title: "Earlier tour stops",
    members: retiredMembers,
    extensions: { [EXTENSION]: { note: "Main views of stops YouVisit's tour no longer visits; they appear only on its map.", youvisitStops: retiredMembers.map(entityId => idOfImage.get(entityId).ids.map(id => locations.get(id)).find(row => row?.roles.includes("retired stop main")).stop) } },
  });

  const assetList = order.map(entityId => assets.get(entityId));
  const scene = {
    format: "foss-earth-scene",
    version: 1,
    id: "umn-twin-cities",
    revision: "",
    title: "University of Minnesota Twin Cities: campus tour",
    requiredExtensions: [],
    extensions: {
      [EXTENSION]: {
        source: `YouVisit tour 60288 (location 80239, tour3), backed up ${path.basename(backup).replace("snapshot-", "")}`,
        build: "tools/twin-cities/build-scene.mjs",
        placements: "tools/twin-cities/placements.json",
        positions: "Capture positions are approximate. They come from YouVisit's one point per stop, or from the centre of the building a panorama shows; each panorama says which. Building centres are from OpenStreetMap, © OpenStreetMap contributors, ODbL 1.0.",
        north: `${entities.filter(entity => entity.imagePose.aligned).length} of ${entities.length} panoramas have north set; the others face an arbitrary direction.`,
      },
    },
    assets: assetList,
    entities,
    groups,
    layers: mapLayers(entities),
    initialPanorama: mainOf(stopOrder[0]),
    // Both campuses, the river and downtown's edge, from the south.
    overview: { target: { longitudeDeg: -93.2215, latitudeDeg: 44.98, height: null }, distanceMeters: 5000, headingDeg: 0, pitchDeg: -50, verticalFovDeg: 60 },
    markerStyle: { outline: { color: "#ffcc33", widthPx: 2 }, hover: { scale: 1.3 } },
  };
  return scene;
}

/** The scene with every panorama's `sheetSize` preview cube in one image, written beside the others; the sheet's file is part of what the revision covers. */
async function withPreviewSheet(scene) {
  for (const name of readdirSync(media)) if (/^previews-\d+(-\d+)?\.jpg$/.test(name)) rmSync(path.join(media, name));
  if (sheetSize === null) return scene;
  const { addPreviewSheets } = await import(pathToFileURL(path.join(fossEarth, "scripts", "lib", "previewSheet.mjs")).href);
  const added = addPreviewSheets(scene, { faceSize: sheetSize, quality, read: url => (existsSync(path.join(out, url)) ? readFileSync(path.join(out, url)) : null) });
  for (const { url, bytes } of added.files) writeFileSync(path.join(out, url), bytes);
  console.log(added.files.length
    ? `Put ${added.cubes} ${sheetSize} px preview cubes in ${added.files.map(file => `${file.url} (${(file.bytes.length / 1024).toFixed(0)} KiB)`).join(", ")}.`
    : `No ${sheetSize} px preview cubes to put in a sheet.`);
  return added.document;
}

// ─── main ────────────────────────────────────────────────────────────────

const assets = await prepareAll();
const scene = await withPreviewSheet(buildScene(assets));
scene.revision = sha256(Buffer.from(JSON.stringify({ ...scene, revision: "" }))).slice(0, 12);
writeFileSync(path.join(out, "scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
console.log(`Wrote ${path.relative(repo, path.join(out, "scene.json"))}: ${scene.entities.length} panoramas in ${scene.groups.length} groups, revision ${scene.revision}.`);
const check = await run(process.execPath, [path.join(fossEarth, "scripts", "check-scene.mjs"), path.join(out, "scene.json"), "--base-url", PUBLISHED]).catch(error => { console.error(error.message); process.exit(1); });
console.log(check.trim());
