/**
 * Applies an exported pose-override file to tools/twin-cities/placements.json.
 * The default is a dry run. --write replaces that file only after the whole
 * export is valid. It does not rebuild scenes or deploy.
 *
 *   node tools/twin-cities/import-poses.mjs --input build/phone-poses.json
 *   node tools/twin-cities/import-poses.mjs --input build/phone-poses.json --reference "Campus landmarks checked on the map" --write
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FORMAT = "foss-earth-pose-overrides";
const VERSION = 1;
const SCENE_IDS = new Set(["umn-twin-cities", "umn-minneapolis", "umn-st-paul"]);
const OFFSET_MIN = -100_000;
const OFFSET_MAX = 1_000_000;

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const lonClose = (a, b) => Math.abs(a - b) <= 1e-8 || Math.abs(Math.abs(a - b) - 360) <= 1e-8;
const headingClose = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) <= 1e-4; };
const angleClose = (a, b) => Math.abs(a - b) <= 1e-4;
const metersClose = (a, b) => Math.abs(a - b) <= 1e-3;
const heightClose = (a, b) => a === null || b === null ? a === b : metersClose(a, b);
const alignedClose = (a, b) => (a === true) === (b === true);

function fail(message) {
  return { ok: false, message };
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function iso(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

function nonempty(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function sceneUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function inRange(value, min, max, exclusiveMax = false) {
  return value >= min && (exclusiveMax ? value < max : value <= max);
}

function readNumber(value, digits, min, max, exclusiveMax = false) {
  if (!finite(value) || !inRange(value, min, max, exclusiveMax)) return null;
  const rounded = round(value, digits);
  return inRange(rounded, min, max, exclusiveMax) ? rounded : null;
}

function normalizeEdit(edit) {
  if (!edit || typeof edit !== "object" || Array.isArray(edit)) return fail("An edit is not an object.");
  if (!nonempty(edit.entityId) || !nonempty(edit.title) || !nonempty(edit.authoredRevision) || !iso(edit.updatedAt)) return fail(`${edit.entityId ?? "An edit"} is missing its id, title, revision, or time.`);
  if (edit.mode !== "ground-relative" && edit.mode !== "capture-relative") return fail(`${edit.entityId} uses ${edit.mode ?? "no"} placement mode. This importer accepts capture-relative photographs with a fixed height, and ground-relative ones with none.`);
  const capture = edit.capture ?? {};
  const pose = edit.imagePose ?? {};
  const marker = edit.marker ?? {};
  const authored = edit.authored ?? {};
  if (edit.mode === "ground-relative" && capture.heightMeters !== null) return fail(`${edit.entityId} is ground-relative but has a capture height.`);
  const heightMeters = edit.mode === "capture-relative" ? readNumber(capture.heightMeters, 3, -500, 9000) : null;
  if (edit.mode === "capture-relative" && heightMeters === null) return fail(`${edit.entityId} is capture-relative without a usable capture height.`);
  const longitudeDeg = readNumber(capture.longitudeDeg, 8, -180, 180, true);
  const latitudeDeg = readNumber(capture.latitudeDeg, 8, -90, 90);
  const headingDeg = readNumber(pose.headingDeg, 4, 0, 360, true);
  const pitchDeg = readNumber(pose.pitchDeg, 4, -90, 90);
  const offsetM = readNumber(marker.offsetM, 3, OFFSET_MIN, OFFSET_MAX);
  const rollDeg = readNumber(authored.rollDeg, 4, -180, 180);
  // Exports from before roll was editable carry no image roll; the authored roll stands in.
  const poseRollDeg = pose.rollDeg === undefined ? rollDeg : readNumber(pose.rollDeg, 4, -180, 180);
  if ([longitudeDeg, latitudeDeg, headingDeg, pitchDeg, offsetM, rollDeg, poseRollDeg].some(value => value === null)) return fail(`${edit.entityId} has a number outside the range a placement can store.`);
  if (typeof pose.aligned !== "boolean") return fail(`${edit.entityId} needs an explicit aligned true or false.`);
  const orientation = edit.verification?.orientation ?? null;
  if (orientation) {
    if (!iso(orientation.checkedAt) || !nonempty(orientation.checkedAgainst)) return fail(`${edit.entityId} has a confirmation without a time or a reference.`);
  }
  if (pose.aligned === false && orientation) return fail(`${edit.entityId} keeps a north confirmation while aligned is false.`);
  const authoredNumbers = {
    mode: authored.mode,
    longitudeDeg: readNumber(authored.longitudeDeg, 8, -180, 180, true),
    latitudeDeg: readNumber(authored.latitudeDeg, 8, -90, 90),
    heightMeters: authored.heightMeters === null ? null : readNumber(authored.heightMeters, 3, -1e9, 1e9),
    headingDeg: readNumber(authored.headingDeg, 4, 0, 360, true),
    pitchDeg: readNumber(authored.pitchDeg, 4, -90, 90),
    offsetM: readNumber(authored.offsetM, 3, OFFSET_MIN, OFFSET_MAX),
    aligned: authored.aligned === true ? true : authored.aligned === false || authored.aligned === null ? authored.aligned : null,
  };
  if (authored.mode !== "ground-relative" && authored.mode !== "capture-relative") return fail(`${edit.entityId} records an unknown authored placement mode.`);
  const badNumber = [authoredNumbers.longitudeDeg, authoredNumbers.latitudeDeg, authoredNumbers.headingDeg, authoredNumbers.pitchDeg, authoredNumbers.offsetM].some(value => value === null);
  const badHeight = authored.heightMeters !== null && authoredNumbers.heightMeters === null;
  if (badNumber || badHeight || (authoredNumbers.aligned === null && authored.aligned !== null)) return fail(`${edit.entityId} has an authored baseline this importer cannot compare.`);
  if (authored.aligned !== true && authored.aligned !== false && authored.aligned !== null) return fail(`${edit.entityId} has an authored alignment this importer cannot compare.`);
  if (pose.aligned === true && !orientation) {
    const inherited = authoredNumbers.aligned === true
      && authoredNumbers.mode === edit.mode
      && authoredNumbers.longitudeDeg === longitudeDeg
      && authoredNumbers.latitudeDeg === latitudeDeg
      && heightClose(authoredNumbers.heightMeters, heightMeters)
      && authoredNumbers.headingDeg === headingDeg
      && authoredNumbers.pitchDeg === pitchDeg
      && angleClose(rollDeg, poseRollDeg);
    if (!inherited) return fail(`${edit.entityId} says north is checked without a confirmation or an inherited check.`);
  }
  return {
    ok: true,
    edit: {
      entityId: edit.entityId, title: edit.title, mode: edit.mode, authoredRevision: edit.authoredRevision, updatedAt: edit.updatedAt,
      capture: { longitudeDeg, latitudeDeg, heightMeters },
      imagePose: { headingDeg, pitchDeg, rollDeg: poseRollDeg, aligned: pose.aligned },
      marker: { offsetM },
      authored: { ...authoredNumbers, rollDeg },
      verification: { orientation: orientation ? { checkedAt: orientation.checkedAt, checkedAgainst: orientation.checkedAgainst } : null },
    },
  };
}

function desiredKey(edit) {
  const orientation = edit.verification.orientation;
  return JSON.stringify({
    capture: edit.capture, heading: edit.imagePose.headingDeg, pitch: edit.imagePose.pitchDeg, roll: edit.imagePose.rollDeg, aligned: edit.imagePose.aligned,
    offset: edit.marker.offsetM, authored: edit.authored, checked: orientation?.checkedAgainst ?? null, hasCheck: Boolean(orientation),
  });
}

function publishedOf(placement) {
  const marker = placement.marker ?? {};
  const height = placement.capture.height ?? null;
  return {
    // The scene builders publish a placement with a fixed height as capture-relative.
    mode: marker.mode ?? (height ? "capture-relative" : "ground-relative"),
    longitudeDeg: placement.capture.longitudeDeg,
    latitudeDeg: placement.capture.latitudeDeg,
    heightMeters: height ? height.meters : null,
    headingDeg: placement.pose.headingDeg,
    pitchDeg: placement.pose.pitchDeg,
    rollDeg: placement.pose.rollDeg,
    offsetM: marker.offsetM ?? 25,
    aligned: placement.pose.aligned === true,
  };
}

function samePlace(left, right) {
  return left.mode === right.mode
    && lonClose(left.longitudeDeg, right.longitudeDeg)
    && Math.abs(left.latitudeDeg - right.latitudeDeg) <= 1e-8
    && heightClose(left.heightMeters, right.heightMeters)
    && headingClose(left.headingDeg, right.headingDeg)
    && angleClose(left.pitchDeg, right.pitchDeg)
    && angleClose(left.rollDeg, right.rollDeg)
    && metersClose(left.offsetM, right.offsetM)
    && alignedClose(left.aligned, right.aligned);
}

function conflictList(authored, current, proposed) {
  const fields = [
    ["mode", authored.mode, current.mode, proposed.mode, (a, b) => a === b],
    ["longitudeDeg", authored.longitudeDeg, current.longitudeDeg, proposed.longitudeDeg, lonClose],
    ["latitudeDeg", authored.latitudeDeg, current.latitudeDeg, proposed.latitudeDeg, (a, b) => Math.abs(a - b) <= 1e-8],
    ["heightMeters", authored.heightMeters, current.heightMeters, proposed.heightMeters, heightClose],
    ["headingDeg", authored.headingDeg, current.headingDeg, proposed.headingDeg, headingClose],
    ["pitchDeg", authored.pitchDeg, current.pitchDeg, proposed.pitchDeg, angleClose],
    ["rollDeg", authored.rollDeg, current.rollDeg, proposed.rollDeg, angleClose],
    ["offsetM", authored.offsetM, current.offsetM, proposed.offsetM, metersClose],
    ["aligned", authored.aligned, current.aligned === true ? true : current.aligned === false ? false : null, proposed.aligned, alignedClose],
  ];
  return fields.filter(([, authoredValue, currentValue, , close]) => !close(authoredValue, currentValue))
    .map(([field, authoredValue, currentValue, proposedValue]) => ({ field, authored: authoredValue, current: currentValue, proposed: proposedValue }));
}

function dateOf(isoText) {
  return isoText.slice(0, 10);
}

function withHistory(previous, claim) {
  if (!previous || previous === claim) return claim;
  return `${claim} Earlier: ${previous}`;
}

function applyOne(placement, edit, reference) {
  const current = publishedOf(placement);
  const proposed = {
    ...current,
    mode: edit.mode,
    longitudeDeg: edit.capture.longitudeDeg,
    latitudeDeg: edit.capture.latitudeDeg,
    heightMeters: edit.capture.heightMeters,
    headingDeg: edit.imagePose.headingDeg,
    pitchDeg: edit.imagePose.pitchDeg,
    offsetM: edit.marker.offsetM,
    aligned: edit.imagePose.aligned,
    rollDeg: edit.imagePose.rollDeg,
  };
  if (samePlace(current, proposed)) {
    return { status: "already-applied", before: current, after: current, note: "Already applied." };
  }
  const conflicts = conflictList(edit.authored, current, proposed);
  if (!conflicts.length && proposed.mode !== current.mode) conflicts.push({ field: "mode", authored: edit.authored.mode, current: current.mode, proposed: proposed.mode });
  if (conflicts.length) return { status: "conflicting", before: current, after: proposed, conflicts, note: conflicts.map(item => `${item.field}: authored ${item.authored}, current ${item.current}, proposed ${item.proposed}`).join("; ") };
  const coordinates = !lonClose(current.longitudeDeg, proposed.longitudeDeg) || Math.abs(current.latitudeDeg - proposed.latitudeDeg) > 1e-8;
  const height = !heightClose(current.heightMeters, proposed.heightMeters);
  const orientation = !headingClose(current.headingDeg, proposed.headingDeg) || !angleClose(current.pitchDeg, proposed.pitchDeg) || !angleClose(current.rollDeg, proposed.rollDeg) || !alignedClose(current.aligned, proposed.aligned);
  const numeric = coordinates || height
    || !headingClose(current.headingDeg, proposed.headingDeg)
    || !angleClose(current.pitchDeg, proposed.pitchDeg)
    || !angleClose(current.rollDeg, proposed.rollDeg)
    || !metersClose(current.offsetM, proposed.offsetM);
  if (numeric && !reference) {
    return { status: "needs-reference", before: current, after: proposed, note: "A --reference is required to write this correction." };
  }
  const next = structuredClone(placement);
  next.capture.longitudeDeg = proposed.longitudeDeg;
  next.capture.latitudeDeg = proposed.latitudeDeg;
  next.pose.headingDeg = proposed.headingDeg;
  next.pose.pitchDeg = proposed.pitchDeg;
  next.pose.aligned = proposed.aligned;
  next.pose.rollDeg = proposed.rollDeg;
  if (proposed.offsetM !== 25 || placement.marker) {
    next.marker = { ...placement.marker, offsetM: proposed.offsetM };
  }
  if (coordinates) {
    next.capture.source = withHistory(placement.capture.source, `Capture corrected in the FOSS Earth placement editor on ${dateOf(edit.updatedAt)} (${reference}).`);
  }
  if (height) {
    // Someone chose this height while looking at it; height preparation never replaces it.
    const previous = placement.capture.height;
    next.capture.height = {
      meters: proposed.heightMeters, datum: "WGS84-ellipsoid",
      source: withHistory(previous?.source, `Set to ${proposed.heightMeters} m in the FOSS Earth placement editor on ${dateOf(edit.updatedAt)} (${reference}); uncertainty is the earlier preparation's.`),
      uncertaintyMeters: previous?.uncertaintyMeters ?? 0,
    };
    next.capture.heightPreparation = { provider: "editor", setOn: dateOf(edit.updatedAt), reference, longitudeDeg: proposed.longitudeDeg, latitudeDeg: proposed.latitudeDeg };
  }
  if (orientation) {
    const confirmation = edit.verification.orientation;
    const alignmentChanged = !alignedClose(current.aligned, proposed.aligned);
    const claim = confirmation
      ? `North checked against ${confirmation.checkedAgainst} on ${dateOf(confirmation.checkedAt)} in the FOSS Earth placement editor.`
      : alignmentChanged && !proposed.aligned
        ? `North alignment was cleared in the FOSS Earth placement editor on ${dateOf(edit.updatedAt)}, not checked.`
        : `Orientation corrected in the FOSS Earth placement editor on ${dateOf(edit.updatedAt)} (${reference}).`;
    next.pose.provenance = withHistory(placement.pose.provenance, claim);
  }
  const offsetOnly = !coordinates && !height && !orientation && !metersClose(current.offsetM, proposed.offsetM);
  const stale = coordinates && !height && next.capture.heightPreparation && next.capture.heightPreparation.provider !== "editor" && next.capture.heightPreparation.provider !== "manual";
  const movement = offsetOnly ? "Display offset only; the capture did not move."
    : coordinates ? `Capture coordinates change. The recorded horizontal accuracy is unchanged and should be reviewed.${stale ? " Its prepared height is for the old coordinate: run npm run prepare:heights." : ""}`
      : height ? "Capture height changes." : "Orientation changes.";
  return { status: "accepted", before: current, after: proposed, placement: next, note: movement };
}

function indexPlacements(document) {
  const byId = new Map();
  const duplicates = [];
  for (const [key, placement] of Object.entries(document.panoramas ?? {})) {
    if (!placement?.id) return fail(`placements entry ${key} has no id`);
    if (byId.has(placement.id)) duplicates.push(placement.id);
    byId.set(placement.id, { key, placement });
  }
  if (duplicates.length) return fail(`placements.json uses ${[...new Set(duplicates)].join(", ")} more than once`);
  return { ok: true, byId };
}

/**
 * Plans an import. `campuses` maps a scene id to the placement ids that scene may name.
 * The returned placements object is present only when every row is accepted or already applied.
 */
export function planPoseImport(placementsDocument, exported, campuses, options = {}) {
  const rows = [];
  const messages = [];
  if (!exported || exported.format !== FORMAT || exported.version !== VERSION || !Array.isArray(exported.scenes)) {
    return { ok: false, clean: false, rows, messages: ["The export is not foss-earth pose overrides version 1."], counts: emptyCounts(), needsReference: false, placements: null };
  }
  const indexed = indexPlacements(placementsDocument);
  if (!indexed.ok) return { ok: false, clean: false, rows, messages: [indexed.message], counts: emptyCounts(), needsReference: false, placements: null };
  const seenScenes = new Set();
  const grouped = new Map();
  let invalid = false;
  for (const scene of exported.scenes) {
    const identity = `${scene?.sceneId}\n${scene?.sceneUrl}`;
    if (!SCENE_IDS.has(scene?.sceneId) || !sceneUrl(scene?.sceneUrl)) {
      invalid = true;
      rows.push({ id: scene?.sceneId ?? "", status: "invalid", note: "A scene must be umn-twin-cities, umn-minneapolis, or umn-st-paul, with an http(s) URL and no query." });
      continue;
    }
    if (seenScenes.has(identity)) {
      invalid = true;
      rows.push({ id: scene.sceneId, status: "invalid", note: `${scene.sceneId} is listed twice for ${scene.sceneUrl}.` });
      continue;
    }
    seenScenes.add(identity);
    const members = campuses[scene.sceneId];
    const seenEntities = new Set();
    for (const raw of scene.edits ?? []) {
      const parsed = normalizeEdit(raw);
      if (!parsed.ok) { invalid = true; rows.push({ id: raw?.entityId ?? "", status: "invalid", note: parsed.message }); continue; }
      const edit = parsed.edit;
      if (seenEntities.has(edit.entityId)) { invalid = true; rows.push({ id: edit.entityId, status: "invalid", note: `${edit.entityId} is listed twice in ${scene.sceneId}.` }); continue; }
      seenEntities.add(edit.entityId);
      if (!indexed.byId.has(edit.entityId)) { invalid = true; rows.push({ id: edit.entityId, status: "unknown", note: `${edit.entityId} is not a placement id.` }); continue; }
      if (!members?.has(edit.entityId)) { invalid = true; rows.push({ id: edit.entityId, status: "invalid", note: `${edit.entityId} is not in ${scene.sceneId}.` }); continue; }
      const bucket = grouped.get(edit.entityId) ?? [];
      bucket.push({ edit, sceneId: scene.sceneId, sceneUrl: scene.sceneUrl });
      grouped.set(edit.entityId, bucket);
    }
  }
  const next = structuredClone(placementsDocument);
  let needsReference = false;
  for (const [id, copies] of grouped) {
    const keys = new Set(copies.map(copy => desiredKey(copy.edit)));
    if (keys.size > 1) {
      invalid = true;
      rows.push({ id, status: "conflicting", note: `${id} has different corrections in ${copies.map(copy => copy.sceneId).join(" and ")}. None were chosen.` });
      continue;
    }
    const chosen = copies.reduce((best, copy) => {
      const confirmation = copy.edit.verification.orientation?.checkedAt ?? "";
      const bestConfirmation = best.edit.verification.orientation?.checkedAt ?? "";
      const earlier = confirmation && (!bestConfirmation || confirmation < bestConfirmation);
      const later = copy.edit.updatedAt > best.edit.updatedAt;
      return {
        edit: { ...copy.edit, updatedAt: later ? copy.edit.updatedAt : best.edit.updatedAt, verification: earlier ? copy.edit.verification : best.edit.verification },
        sceneId: copy.sceneId, sceneUrl: copy.sceneUrl,
      };
    });
    const located = indexed.byId.get(id);
    const outcome = applyOne(located.placement, chosen.edit, options.reference?.trim() || "");
    if (outcome.status === "needs-reference") { needsReference = true; messages.push(`${id}: ${outcome.note}`); }
    if (outcome.status === "conflicting") invalid = true;
    rows.push({ id, status: outcome.status, before: outcome.before, after: outcome.after, note: outcome.note, scenes: copies.map(copy => copy.sceneId) });
    if (outcome.placement) next.panoramas[located.key] = outcome.placement;
  }
  const counts = {
    accepted: rows.filter(row => row.status === "accepted").length,
    alreadyApplied: rows.filter(row => row.status === "already-applied").length,
    invalid: rows.filter(row => row.status === "invalid").length,
    conflicting: rows.filter(row => row.status === "conflicting").length,
    unknown: rows.filter(row => row.status === "unknown").length,
  };
  const clean = !invalid;
  return { ok: clean && !needsReference, clean, rows, messages, counts, needsReference, placements: clean && !needsReference ? next : null };
}

function emptyCounts() {
  return { accepted: 0, alreadyApplied: 0, invalid: 0, conflicting: 0, unknown: 0 };
}

export function formatPoseReport(plan) {
  const lines = [];
  for (const row of plan.rows) {
    const before = row.before ? ` heading ${row.before.headingDeg} → ${row.after?.headingDeg}` : "";
    lines.push(`${row.status}: ${row.id}${before}. ${row.note ?? ""}`.trim());
  }
  lines.push(`${plan.counts.accepted} accepted, ${plan.counts.alreadyApplied} already applied, ${plan.counts.invalid} invalid, ${plan.counts.conflicting} conflicting, ${plan.counts.unknown} unknown.`);
  lines.push(...plan.messages);
  return lines.join("\n");
}

export function commitPlacements(file, originalText, placements) {
  if (readFileSync(file, "utf8") !== originalText) throw new Error(`${file} changed since it was read. Nothing was written.`);
  const temporary = `${file}.${process.pid}.tmp`;
  const text = `${JSON.stringify(placements, null, 2)}\n`;
  writeFileSync(temporary, text);
  try { renameSync(temporary, file); }
  catch (error) { rmSync(temporary, { force: true }); throw error; }
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const [name, inline] = arg.slice(2).split("=", 2);
    if (name === "write" || name === "help") { options[name] = inline ?? true; continue; }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    options[name] = value;
  }
  return options;
}

function loadCampuses() {
  const read = name => new Set(JSON.parse(readFileSync(new URL(`../../../${name}/campus.json`, import.meta.url), "utf8")).panoramas);
  const minneapolis = read("minneapolis");
  const stPaul = read("st-paul");
  return { "umn-twin-cities": null, "umn-minneapolis": minneapolis, "umn-st-paul": stPaul };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    console.log("node tools/twin-cities/import-poses.mjs --input <export.json> [--placements <placements.json>] [--reference <text>] [--write]");
    process.exit(options.help ? 0 : 1);
  }
  const placementsPath = path.resolve(options.placements ?? path.join(here, "placements.json"));
  const originalText = readFileSync(placementsPath, "utf8");
  const placements = JSON.parse(originalText);
  const exported = JSON.parse(readFileSync(path.resolve(options.input), "utf8"));
  const campuses = loadCampuses();
  const indexed = indexPlacements(placements);
  if (indexed.ok) campuses["umn-twin-cities"] = new Set(indexed.byId.keys());
  const plan = planPoseImport(placements, exported, campuses, { reference: options.reference });
  console.log(formatPoseReport(plan));
  if (!plan.clean) process.exit(1);
  if (!options.write) {
    if (plan.needsReference) console.log("Pass --reference to write numeric corrections.");
    return;
  }
  if (plan.needsReference || !plan.placements) {
    console.error("Pass --reference to write numeric corrections.");
    process.exit(1);
  }
  commitPlacements(placementsPath, originalText, plan.placements);
  console.log(`Wrote ${placementsPath}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
