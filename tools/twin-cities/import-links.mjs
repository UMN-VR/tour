/** Imports editor additions into placements, preserving the original tour graph. Dry run by default. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commitPlacements } from "./import-poses.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sceneIds = new Set(["umn-twin-cities", "umn-minneapolis", "umn-st-paul"]);
const text = value => typeof value === "string" && value.trim() === value && value.length > 0;
const validIso = value => typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

export function planLinkImport(placements, exported, campuses) {
  const rows = [], next = structuredClone(placements);
  const byId = new Map(Object.entries(next.panoramas).map(([key, placement]) => [placement.id, key]));
  if (exported?.format !== "foss-earth-link-overrides" || exported.version !== 1 || !Array.isArray(exported.scenes)) return { ok: false, rows: ["Expected foss-earth link overrides version 1."], placements: null };
  const scenes = new Set();
  let ok = true;
  for (const scene of exported.scenes) {
    let url;
    try { url = new URL(scene.sceneUrl); } catch { /* Report invalid scene below. */ }
    const identity = `${scene?.sceneId}\n${scene?.sceneUrl}`;
    if (!sceneIds.has(scene?.sceneId) || !url || !["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password || !Array.isArray(scene.edits) || scenes.has(identity)) { ok = false; rows.push("Invalid or duplicate scene in link export."); continue; }
    scenes.add(identity);
    const members = campuses[scene.sceneId], sources = new Set();
    for (const edit of scene.edits) {
      if (!edit || !byId.has(edit.entityId) || !members?.has(edit.entityId) || sources.has(edit.entityId) || !text(edit.authoredRevision) || !validIso(edit.updatedAt) || !Array.isArray(edit.links)) { ok = false; rows.push(`Invalid or duplicate source: ${edit?.entityId ?? "unknown"}.`); continue; }
      sources.add(edit.entityId);
      const placement = next.panoramas[byId.get(edit.entityId)], targets = new Set();
      for (const link of edit.links) {
        const d = link?.direction;
        if (!link || link.target === edit.entityId || !byId.has(link.target) || !members.has(link.target) || targets.has(link.target) || !text(link.label) || d !== undefined && (!d || !Number.isFinite(d.headingDeg) || d.headingDeg < 0 || d.headingDeg >= 360 || !Number.isFinite(d.pitchDeg) || Math.abs(d.pitchDeg) > 90)) { ok = false; rows.push(`Invalid link from ${edit.entityId} to ${link?.target ?? "unknown"}.`); continue; }
        targets.add(link.target);
        if (placement.links?.includes(link.target)) rows.push(`Already applied: ${edit.entityId} → ${link.target}.`);
        else { placement.links = [...(placement.links ?? []), link.target]; rows.push(`Accepted: ${edit.entityId} → ${link.target}.`); }
      }
    }
  }
  return { ok, rows, placements: ok ? next : null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf("--input"), input = flag >= 0 ? process.argv[flag + 1] : null;
  if (!input || input.startsWith("--")) throw new Error("Pass --input <exported-links.json> [--write].");
  const file = path.join(here, "placements.json"), original = readFileSync(file, "utf8"), placements = JSON.parse(original);
  const campus = name => new Set(JSON.parse(readFileSync(path.resolve(here, `../../../${name}/campus.json`), "utf8")).panoramas);
  const campuses = { "umn-twin-cities": new Set(Object.values(placements.panoramas).map(p => p.id)), "umn-minneapolis": campus("minneapolis"), "umn-st-paul": campus("st-paul") };
  const plan = planLinkImport(placements, JSON.parse(readFileSync(input, "utf8")), campuses);
  console.log(plan.rows.join("\n") || "No links to apply.");
  if (!plan.ok) process.exitCode = 1;
  else if (process.argv.includes("--write")) { commitPlacements(file, original, plan.placements); console.log("Wrote placements. Rebuild with build:scene -- --poses-only, then campus-scenes."); }
}
