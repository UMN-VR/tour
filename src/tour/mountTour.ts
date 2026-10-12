import { mountGlobeApp } from "foss-earth";
import { getAppSettings } from "foss-earth/settings";
import type { SceneExample } from "foss-earth/scenes";
import { applyCampusSunTime } from "./campusSunTime";

/** FOSS Earth's globe as it is, offering one campus tour's scene and opening it. */
export function mountTour(scene: SceneExample): void {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error('Expected to find a root element with id "root".');
  }

  // Before the globe reads the clock, so the first frame already has this Sun.
  applyCampusSunTime(getAppSettings());

  mountGlobeApp(rootElement, { scenes: [scene], initialScene: scene.id }).catch((error: unknown) => {
    console.error("The tour could not start.", error);
    rootElement.innerHTML = '<div class="boot-error">The tour could not start.</div>';
  });
}
