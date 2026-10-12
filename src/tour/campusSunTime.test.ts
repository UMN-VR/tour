import { createSettingsRegistry, FOSS_EARTH_PARAMETERS, SETTINGS_STORAGE_KEY, type SettingsStorage } from "foss-earth/settings";
import { clockTime, HOUR_MS, instantInUse, isoDate, solarClockMs, solarDayStartMs } from "foss-earth/sky";
import { describe, expect, it } from "vitest";
import { applyCampusSunTime, CAMPUS_SUN_LONGITUDE_DEG, CAMPUS_SUN_TIME } from "./campusSunTime";

function memory(seed?: string): SettingsStorage {
  const items = new Map<string, string>();
  if (seed !== undefined) items.set(SETTINGS_STORAGE_KEY, seed);
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
  };
}

function registry(storage: SettingsStorage | null = memory(), search = "") {
  const settings = createSettingsRegistry({ storage, searchParams: new URLSearchParams(search) });
  settings.register(FOSS_EARTH_PARAMETERS.filter(spec => spec.id.startsWith("sky.time.")));
  return settings;
}

describe("the campus tour's sun", () => {
  it("is 16:20 solar time on 2026-04-20 at the campus", () => {
    const instant = instantInUse({ get: id => CAMPUS_SUN_TIME[id as keyof typeof CAMPUS_SUN_TIME] }, () => 0);
    const solar = solarClockMs(instant.utcMs, CAMPUS_SUN_LONGITUDE_DEG);
    const day = solarDayStartMs(solar);
    expect(isoDate(day)).toBe("2026-04-20");
    expect(clockTime((solar - day) / HOUR_MS)).toBe("16:20");
    // Saint Paul is the farthest campus east, by about a quarter of a minute.
    const saintPaul = solarClockMs(instant.utcMs, -93.18471);
    const saintPaulDay = solarDayStartMs(saintPaul);
    expect(clockTime((saintPaul - saintPaulDay) / HOUR_MS)).toBe("16:20");
  });

  it("replaces a saved time when the tour loads", () => {
    const storage = memory();
    const first = registry(storage);
    first.setMany({ "sky.time.mode": "now", "sky.time.date": "2026-01-01", "sky.time.utcHours": 8 });
    const reloaded = registry(storage);
    applyCampusSunTime(reloaded);
    expect(reloaded.get("sky.time.mode")).toBe("fixed");
    expect(reloaded.get("sky.time.date")).toBe(CAMPUS_SUN_TIME["sky.time.date"]);
    expect(reloaded.get("sky.time.utcHours")).toBe(CAMPUS_SUN_TIME["sky.time.utcHours"]);
    expect(reloaded.inspect("sky.time.mode").provenance).toBe("host-default");
  });

  it("keeps a time named in the address", () => {
    const settings = registry(memory(), "set.sky.time.mode=now&set.sky.time.date=2026-01-01");
    applyCampusSunTime(settings);
    expect(settings.get("sky.time.mode")).toBe("now");
    expect(settings.get("sky.time.date")).toBe("2026-01-01");
    expect(settings.get("sky.time.utcHours")).toBe(CAMPUS_SUN_TIME["sky.time.utcHours"]);
  });
});
