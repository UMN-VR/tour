import { describe, expect, it, vi } from "vitest";
import type { SurfaceHit } from "@foss-earth/engine";
import type { ResolvedPanorama } from "@foss-earth/scenes";
import { createCampusWorld } from "./world";

function panorama(): ResolvedPanorama {
  return {
    id: "northrop", type: "panorama", assetId: "photo", title: "Northrop Mall",
    capture: { longitudeDeg: -93.235, latitudeDeg: 44.976, height: null },
    imagePose: { headingDeg: 0, pitchDeg: 0, rollDeg: 0, aligned: false },
    marker: { mode: "ground-relative", eastM: 0, northM: 0, offsetM: 2 },
    markerStyle: { outline: null, hoverScale: 1 }, links: [],
  };
}

function harness() {
  let hit: SurfaceHit | null = null;
  let frozen = false;
  const listeners = new Set<() => void>();
  const sample = vi.fn(() => hit);
  const showOverview = vi.fn(async () => ({ ok: true as const, state: "applied" as const }));
  const world = createCampusWorld({
    surface: { sample },
    frames: { subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    isPlacementFrozen: () => frozen, showOverview,
  });
  return {
    world, sample, listeners, showOverview,
    freeze(value: boolean) { frozen = value; },
    height(value: number | null) {
      hit = value === null ? null : { point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 0, z: 1 }, distanceMeters: 1, heightMeters: value, meshId: "displayed", revision: 1, quality: 1 };
    },
    frame() { for (const listener of [...listeners]) listener(); },
  };
}

describe("Campus placement on the actual displayed surface", () => {
  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])("keeps missing/nonfinite ground pending (%s), never at a guessed zero", height => {
    const h = harness(); h.height(height);
    const placement = h.world.resolvePlacement(panorama(), { radiusMeters: 4 });
    expect(placement.state).toBe("pending");
    expect(placement.placement.marker).toBeNull();
  });

  it("uses authored capture height without querying terrain and leaves unknown capture height unavailable", () => {
    const h = harness();
    const entity = panorama(); entity.marker.mode = "capture-relative";
    expect(h.world.resolvePlacement(entity, { radiusMeters: 4 }).state).toBe("unavailable");
    entity.capture.height = { datum: "WGS84-ellipsoid", meters: 260 };
    const known = h.world.resolvePlacement(entity, { radiusMeters: 4 });
    expect(known.state).toBe("placed");
    expect(known.placement.marker?.every(Number.isFinite)).toBe(true);
    expect(h.sample).not.toHaveBeenCalled();
  });

  it("updates once when ground changes, respects frozen transition placement and releases its borrowed frame subscription", () => {
    const h = harness();
    const changed = vi.fn();
    h.world.resolvePlacement(panorama(), { radiusMeters: 4 });
    const stop = h.world.watchPlacement!(panorama(), { radiusMeters: 4 }, changed);
    h.height(260); h.freeze(true); h.frame();
    expect(changed).not.toHaveBeenCalled();
    expect(h.sample).toHaveBeenCalledOnce();
    h.freeze(false); h.frame(); h.frame();
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].state).toBe("placed");
    h.height(null); h.frame();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed.mock.calls[1][0].placement.marker).toBeNull();
    stop(); expect(h.listeners.size).toBe(0);
    h.height(280); h.frame(); expect(changed).toHaveBeenCalledTimes(2);
  });

  it("reconciles ground that changed during asynchronous image preparation before the watcher was installed", () => {
    const h = harness(); const entity = panorama();
    h.height(260);
    const prepared = h.world.resolvePlacement(entity, { radiusMeters: 4 });
    h.height(280);
    const changed = vi.fn();
    const stop = h.world.watchPlacement!(entity, { radiusMeters: 4 }, changed);
    h.frame(); h.frame();
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].placement.marker).not.toEqual(prepared.placement.marker);
    stop();
  });

  it("delegates overview navigation and cancellation to the shared camera authority", async () => {
    const h = harness();
    const overview = { target: { longitudeDeg: -93.235, latitudeDeg: 44.976, height: null }, distanceMeters: 200, headingDeg: 0, pitchDeg: -45, verticalFovDeg: 60 };
    const options = { signal: new AbortController().signal };
    await h.world.showOverview(overview, options);
    expect(h.showOverview).toHaveBeenCalledWith(overview, options);
    expect(h.sample).not.toHaveBeenCalled();
  });
});
