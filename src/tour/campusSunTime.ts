import type { SettingsRegistry } from "foss-earth/settings";
import { fixedTimeValues, utcForSolarClockMs } from "foss-earth/sky";

/**
 * The Minneapolis map's opening place. The Date and time dials read a sundial
 * there. Saint Paul and the Twin Cities overview are within a quarter of a
 * minute of it, so they show the same minute.
 */
export const CAMPUS_SUN_LONGITUDE_DEG = -93.243218;

/**
 * 16:20 solar time on 2026-04-20, 4:20 in the afternoon. The Sun then lines
 * up with the shadows in the campus's Google 3D Tiles. The dial is a
 * 24-hour solar clock, so 4:20 in the afternoon reads 16:20.
 */
const SOLAR_MS = Date.UTC(2026, 3, 20, 16, 20);

/** The set time those dials show, stored as the UTC instant the sky uses. */
export const CAMPUS_SUN_TIME = fixedTimeValues(utcForSolarClockMs(SOLAR_MS, CAMPUS_SUN_LONGITUDE_DEG));

const CAMPUS_SUN_REASON = "The Sun lines up with the shadows in the campus's Google 3D Tiles.";

/**
 * Sets that time whenever a campus tour loads, in place of a time saved on
 * this device. A time named in the address is kept for that visit.
 */
export function applyCampusSunTime(settings: SettingsRegistry): void {
  for (const id of ["sky.time.mode", "sky.time.date", "sky.time.utcHours"] as const) {
    settings.setHostDefault(id, CAMPUS_SUN_TIME[id], CAMPUS_SUN_REASON);
    if (settings.inspect(id).layers.url === undefined) settings.reset(id);
  }
}
