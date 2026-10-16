import { mountGlobeApp } from "foss-earth";
import { getAppSettings } from "foss-earth/settings";
import { describeError } from "foss-earth/diagnostics";
import type { SceneExample } from "foss-earth/scenes";
import { isBrowserRecoveryPage, markBrowserAppReady, reportBrowserAppFailure } from "@foss-earth/ui/browser";
import { applyCampusSunTime } from "./campusSunTime";

/** FOSS Earth's globe as it is, offering one campus tour's scene and opening it. */
export function mountTour(scene: SceneExample): void {
  if (isBrowserRecoveryPage(document)) return;
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    reportBrowserAppFailure(document, "The tour could not start.");
    throw new Error('Expected to find a root element with id "root".');
  }

  // Before the globe reads the clock, so the first frame already has this Sun.
  applyCampusSunTime(getAppSettings());

  void mountGlobeApp(rootElement, { scenes: [scene], initialScene: scene.id, poseExportPrefix: "umn-tour-poses", layerExportPrefix: "umn-tour-layers" }).then(() => {
    markBrowserAppReady(document);
  }).catch((error: unknown) => {
    console.error("The tour could not start.", error);
    rootElement.innerHTML = '<div class="boot-error">The tour could not start.</div>';
    // The error goes into the crash log the recovery offer downloads; the page says only that the tour stopped.
    reportBrowserAppFailure(document, `The tour could not start. ${describeError(error).message}`);
  });
}
