// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createCampusTabVisibility } from "./tab-visibility";

it("refreshes About on actual visibility transitions and stops after owner cleanup", () => {
  const visibility = createCampusTabVisibility();
  const shown = vi.fn();
  const stop = visibility.whenShown("about")(document.createElement("section"), shown);
  visibility.setVisible("scenes", true);
  visibility.setVisible("about", false);
  expect(shown).not.toHaveBeenCalled();
  visibility.setVisible("about", true);
  visibility.setVisible("about", true);
  expect(shown).toHaveBeenCalledOnce();
  visibility.setVisible("about", false);
  visibility.setVisible("about", true);
  expect(shown).toHaveBeenCalledTimes(2);
  stop();
  visibility.setVisible("about", false);
  visibility.setVisible("about", true);
  expect(shown).toHaveBeenCalledTimes(2);
  visibility.dispose();
  expect(visibility.isVisible("about")).toBe(false);
});

it("shows a newly attached About observer immediately when its real tab is visible", () => {
  const visibility = createCampusTabVisibility();
  visibility.setVisible("about", true);
  const shown = vi.fn();
  visibility.whenShown("about")(document.createElement("section"), shown);
  expect(shown).toHaveBeenCalledOnce();
  visibility.dispose();
  visibility.setVisible("about", true);
  expect(shown).toHaveBeenCalledOnce();
});

it("notifies launcher observers without retaining a removed listener", () => {
  const visibility = createCampusTabVisibility();
  const readings: boolean[] = [];
  const stop = visibility.subscribe(() => { readings.push(visibility.isVisible("map")); });
  visibility.setVisible("map", true);
  visibility.setVisible("map", false);
  stop();
  visibility.setVisible("map", true);
  expect(readings).toEqual([true, false]);
  visibility.dispose();
});
