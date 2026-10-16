import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { commitPlacements, planPoseImport } from "./import-poses.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const campuses = {
  "umn-twin-cities": new Set(["northrop-mall", "saint-paul-campus"]),
  "umn-minneapolis": new Set(["northrop-mall"]),
  "umn-st-paul": new Set(["saint-paul-campus"]),
};

function placement(id, pose = {}) {
  return {
    id, title: id,
    capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, horizontalAccuracyMeters: 65, source: "Not placed: somewhere near the stop." },
    pose: { headingDeg: 0, pitchDeg: 0, rollDeg: 1, aligned: false, provenance: "Not aligned: north is unknown.", ...pose },
  };
}

function document() {
  return { about: "fixture", panoramas: { "363729": placement("northrop-mall"), "999": placement("saint-paul-campus", { headingDeg: 20 }) } };
}

function edit(over = {}) {
  return {
    entityId: "northrop-mall", title: "Northrop Mall", mode: "ground-relative", authoredRevision: "rev-1", updatedAt: "2026-10-14T22:28:00.000Z",
    capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, heightMeters: null },
    imagePose: { headingDeg: 12, pitchDeg: 0, aligned: false },
    marker: { offsetM: 25 },
    authored: { mode: "ground-relative", longitudeDeg: -93.2, latitudeDeg: 44.9, heightMeters: null, headingDeg: 0, pitchDeg: 0, rollDeg: 1, offsetM: 25, aligned: false },
    verification: { orientation: null },
    ...over,
  };
}

function exported(edits, sceneId = "umn-twin-cities", sceneUrl = "https://umn-vr.github.io/tour/twin-cities/scene.json") {
  return { format: "foss-earth-pose-overrides", version: 1, exportedAt: "2026-10-15T00:00:00.000Z", scenes: [{ sceneId, sceneUrl, edits }] };
}

describe("pose import", () => {
  it("writes a numeric correction from the edit date and keeps roll", () => {
    const plan = planPoseImport(document(), exported([edit({ capture: { longitudeDeg: -93.25, latitudeDeg: 44.91, heightMeters: null } })]), campuses, { reference: "Campus landmarks checked on the map" });
    expect(plan.ok).toBe(true);
    const next = plan.placements.panoramas["363729"];
    expect(next.capture.longitudeDeg).toBe(-93.25);
    expect(next.pose.headingDeg).toBe(12);
    expect(next.pose.rollDeg).toBe(1);
    expect(next.pose.aligned).toBe(false);
    expect(next.capture.source).toMatch(/^Capture corrected in the FOSS Earth placement editor on 2026-10-14 \(Campus landmarks checked on the map\)/);
    expect(next.capture.source).toMatch(/Earlier: Not placed/);
    expect(next.capture.horizontalAccuracyMeters).toBe(65);
    expect(next.secret).toBeUndefined();
    expect(plan.rows[0].note).toMatch(/horizontal accuracy/);
  });

  it("writes an edited roll", () => {
    const plan = planPoseImport(document(), exported([edit({ imagePose: { headingDeg: 0, pitchDeg: 0, rollDeg: -2.5, aligned: false } })]), campuses, { reference: "Horizon checked level" });
    expect(plan.ok).toBe(true);
    expect(plan.placements.panoramas["363729"].pose.rollDeg).toBe(-2.5);
  });

  it("requires a reference before a numeric write and still reports the change", () => {
    const plan = planPoseImport(document(), exported([edit()]), campuses, {});
    expect(plan.clean).toBe(true);
    expect(plan.needsReference).toBe(true);
    expect(plan.placements).toBeNull();
    expect(plan.rows[0].after.headingDeg).toBe(12);
  });

  it("confirms alignment without a write-time reference and says when alignment was cleared", () => {
    const confirmed = edit({
      imagePose: { headingDeg: 0, pitchDeg: 0, aligned: true },
      verification: { orientation: { checkedAt: "2026-10-14T22:40:00.000Z", checkedAgainst: "The mall's east front" } },
    });
    const plan = planPoseImport(document(), exported([confirmed]), campuses, {});
    expect(plan.ok).toBe(true);
    expect(plan.placements.panoramas["363729"].pose.aligned).toBe(true);
    expect(plan.placements.panoramas["363729"].pose.provenance).toMatch(/North checked against The mall's east front on 2026-10-14/);
    expect(plan.placements.panoramas["363729"].pose.provenance).not.toMatch(/^Not aligned/);
    const cleared = planPoseImport(plan.placements, exported([edit({ imagePose: { headingDeg: 0, pitchDeg: 0, aligned: false }, authored: { ...edit().authored, aligned: true } })]), campuses, {});
    expect(cleared.placements.panoramas["363729"].pose.provenance).toMatch(/cleared/);
    expect(cleared.placements.panoramas["363729"].pose.provenance).toMatch(/not checked/);
  });

  it("treats an offset change as display placement and leaves the capture source", () => {
    const plan = planPoseImport(document(), exported([edit({ imagePose: { headingDeg: 0, pitchDeg: 0, aligned: false }, marker: { offsetM: 40 } })]), campuses, { reference: "Moved the orb" });
    const next = plan.placements.panoramas["363729"];
    expect(next.marker.offsetM).toBe(40);
    expect(next.capture.source).toBe("Not placed: somewhere near the stop.");
    expect(next.capture.longitudeDeg).toBe(-93.2);
    expect(plan.rows[0].note).toMatch(/did not move/);
  });

  it("is already applied without rewriting provenance", () => {
    const plan = planPoseImport(document(), exported([edit({ imagePose: { headingDeg: 0, pitchDeg: 0, aligned: false } })]), campuses, { reference: "unused" });
    expect(plan.counts.alreadyApplied).toBe(1);
    expect(plan.placements.panoramas["363729"].pose.provenance).toBe("Not aligned: north is unknown.");
  });

  it("rejects a conflict, a changed roll, a campus mismatch, and an unknown id without applying the valid row", () => {
    const conflict = planPoseImport(document(), exported([edit({ authored: { ...edit().authored, headingDeg: 4 } })]), campuses, { reference: "map" });
    expect(conflict.ok).toBe(false);
    expect(conflict.rows[0].note).toMatch(/headingDeg/);
    expect(conflict.placements).toBeNull();
    const roll = planPoseImport(document(), exported([edit({ authored: { ...edit().authored, rollDeg: 2 } })]), campuses, { reference: "map" });
    expect(roll.rows[0].status).toBe("conflicting");
    expect(roll.rows[0].note).toMatch(/rollDeg/);
    const campus = planPoseImport(document(), exported([edit({ entityId: "saint-paul-campus", title: "Saint Paul" })], "umn-minneapolis"), campuses, { reference: "map" });
    expect(campus.rows[0].status).toBe("invalid");
    const mixed = planPoseImport(document(), exported([edit(), edit({ entityId: "missing", title: "Missing" })]), campuses, { reference: "map" });
    expect(mixed.counts.unknown).toBe(1);
    expect(mixed.placements).toBeNull();
  });

  it("collapses agreeing duplicates and rejects different corrections", () => {
    const first = edit({ verification: { orientation: null }, updatedAt: "2026-10-14T22:28:00.000Z" });
    const second = edit({ updatedAt: "2026-10-14T23:00:00.000Z", authoredRevision: "other" });
    const agreed = planPoseImport(document(), {
      format: "foss-earth-pose-overrides", version: 1, exportedAt: "2026-10-15T00:00:00.000Z",
      scenes: [
        { sceneId: "umn-twin-cities", sceneUrl: "https://umn-vr.github.io/tour/twin-cities/scene.json", edits: [first] },
        { sceneId: "umn-minneapolis", sceneUrl: "https://umn-vr.github.io/tour/minneapolis/scene.json", edits: [second] },
      ],
    }, campuses, { reference: "map" });
    expect(agreed.ok).toBe(true);
    expect(agreed.placements.panoramas["363729"].pose.provenance).toMatch(/2026-10-14/);
    const disagreed = planPoseImport(document(), {
      format: "foss-earth-pose-overrides", version: 1, exportedAt: "2026-10-15T00:00:00.000Z",
      scenes: [
        { sceneId: "umn-twin-cities", sceneUrl: "https://umn-vr.github.io/tour/twin-cities/scene.json", edits: [edit()] },
        { sceneId: "umn-minneapolis", sceneUrl: "https://umn-vr.github.io/tour/minneapolis/scene.json", edits: [edit({ imagePose: { headingDeg: 30, pitchDeg: 0, aligned: false } })] },
      ],
    }, campuses, { reference: "map" });
    expect(disagreed.rows[0].status).toBe("conflicting");
    expect(disagreed.placements).toBeNull();
  });

  it("rejects a future export, a ground-relative edit with a height, and does not copy unknown fields", () => {
    expect(planPoseImport(document(), { format: "foss-earth-pose-overrides", version: 2, scenes: [] }, campuses).ok).toBe(false);
    const height = planPoseImport(document(), exported([edit({ capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, heightMeters: 12 } })]), campuses, { reference: "map" });
    expect(height.rows[0].status).toBe("invalid");
    const extra = edit();
    extra.file = "/tmp/secret.json";
    const plan = planPoseImport(document(), exported([extra]), campuses, { reference: "map" });
    expect(JSON.stringify(plan.placements)).not.toContain("secret");
  });

  it("leaves a dry-run file untouched and refuses a file that changed before writing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pose-import-"));
    const file = path.join(root, "placements.json");
    const input = path.join(root, "poses.json");
    const original = `${JSON.stringify(document(), null, 2)}\n`;
    writeFileSync(file, original);
    writeFileSync(input, JSON.stringify(exported([edit()])));
    const dry = spawnSync(process.execPath, ["tools/twin-cities/import-poses.mjs", "--input", input, "--placements", file, "--reference", "map"], { cwd: path.resolve(here, "../.."), encoding: "utf8" });
    expect(dry.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(dry.stdout).toMatch(/heading 0 → 12/);
    const text = readFileSync(file, "utf8");
    const plan = planPoseImport(JSON.parse(text), JSON.parse(readFileSync(input, "utf8")), campuses, { reference: "map" });
    writeFileSync(file, `${text}\n`);
    expect(() => commitPlacements(file, text, plan.placements)).toThrow(/changed/);
    expect(readFileSync(file, "utf8")).toBe(`${text}\n`);
  });
});

describe("pose import with fixed heights", () => {
  const prepared = { meters: 236.303, datum: "WGS84-ellipsoid", uncertaintyMeters: 2.01, source: "Build-time Google Photorealistic 3D Tiles." };
  const preparation = { provider: "google-photorealistic-3d-tiles", sampledOn: "2026-10-15", longitudeDeg: -93.2, latitudeDeg: 44.9, surface: "top of mesh", geometricErrorMeters: 2.006, tileDepth: 25 };
  function heightDocument() {
    const next = document();
    for (const row of Object.values(next.panoramas)) Object.assign(row.capture, { height: { ...prepared }, heightPreparation: { ...preparation } });
    return next;
  }
  function fixed(over = {}) {
    return edit({
      mode: "capture-relative",
      capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, heightMeters: 236.303 },
      authored: { ...edit().authored, mode: "capture-relative", heightMeters: 236.303 },
      ...over,
    });
  }

  it("applies an orientation change and keeps the prepared height and its provenance", () => {
    const plan = planPoseImport(heightDocument(), exported([fixed()]), campuses, { reference: "map" });
    expect(plan.ok).toBe(true);
    const next = plan.placements.panoramas["363729"];
    expect(next.pose.headingDeg).toBe(12);
    expect(next.capture.height).toEqual(prepared);
    expect(next.capture.heightPreparation).toEqual(preparation);
  });

  it("records a height chosen in the editor so preparation never replaces it", () => {
    const changed = fixed({ capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, heightMeters: 240.5 }, imagePose: { headingDeg: 0, pitchDeg: 0, aligned: false } });
    expect(planPoseImport(heightDocument(), exported([changed]), campuses, {}).needsReference).toBe(true);
    const plan = planPoseImport(heightDocument(), exported([changed]), campuses, { reference: "Matched the lobby floor" });
    const next = plan.placements.panoramas["363729"];
    expect(next.capture.height).toMatchObject({ meters: 240.5, datum: "WGS84-ellipsoid", uncertaintyMeters: 2.01 });
    expect(next.capture.height.source).toMatch(/^Set to 240.5 m in the FOSS Earth placement editor on 2026-10-14 \(Matched the lobby floor\).*Earlier: Build-time Google/);
    expect(next.capture.heightPreparation).toMatchObject({ provider: "editor", reference: "Matched the lobby floor", longitudeDeg: -93.2 });
    expect(plan.rows[0].note).toMatch(/height changes/);
    const again = planPoseImport(plan.placements, exported([changed]), campuses, {});
    expect(again.counts.alreadyApplied).toBe(1);
  });

  it("says a moved capture needs its height prepared again", () => {
    const moved = fixed({ capture: { longitudeDeg: -93.21, latitudeDeg: 44.9, heightMeters: 236.303 }, imagePose: { headingDeg: 0, pitchDeg: 0, aligned: false } });
    const plan = planPoseImport(heightDocument(), exported([moved]), campuses, { reference: "map" });
    expect(plan.ok).toBe(true);
    expect(plan.placements.panoramas["363729"].capture.heightPreparation.longitudeDeg).toBe(-93.2);
    expect(plan.rows[0].note).toMatch(/npm run prepare:heights/);
  });

  it("refuses an export made before heights were prepared, and a capture-relative edit with no height", () => {
    const old = planPoseImport(heightDocument(), exported([edit()]), campuses, { reference: "map" });
    expect(old.rows[0].status).toBe("conflicting");
    expect(old.rows[0].note).toMatch(/mode: authored ground-relative, current capture-relative/);
    expect(old.placements).toBeNull();
    const missing = planPoseImport(heightDocument(), exported([fixed({ capture: { longitudeDeg: -93.2, latitudeDeg: 44.9, heightMeters: null } })]), campuses, { reference: "map" });
    expect(missing.rows[0].status).toBe("invalid");
  });
});
