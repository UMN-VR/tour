import { createViewerTabs, type ViewerPanelPorts } from "@foss-earth/360/panels";
import { createSceneHotspots, createScenesPanel, type ScenesPanelContribution, type ScenesPanelUi } from "@foss-earth/scenes/panel";
import { createCampusAboutPanel } from "@umn-vr/about/panel";
import "@foss-earth/about/panel.css";
import "@foss-earth/scenes/panel.css";
import { createCampusSceneController, type CampusSceneBindings } from "./controller";
import { createCampusWorld, type CampusWorldBindings } from "./world";
import { TWIN_CITIES } from "./scenes";

export interface CampusContentBindings {
  document: Document;
  scene: Omit<CampusSceneBindings, "world">;
  world: Omit<CampusWorldBindings, "isPlacementFrozen" | "frames">;
  hotspots: HTMLElement;
  scenesUi: ScenesPanelUi;
  sceneContributions?: readonly ScenesPanelContribution[];
  viewerUi: Omit<ViewerPanelPorts, "document" | "viewer" | "image" | "detail">;
  about: Parameters<typeof createCampusAboutPanel>[0];
}

/**
 * Campus composition over borrowed runtime/viewer authorities. The outer host
 * owns boot, its one renderer and all13 tab definitions. No site wrapper is used.
 */
export function createCampusContentHost(bindings: CampusContentBindings) {
  const cleanups: (() => void)[] = [];
  try {
    const controller = createCampusSceneController({ ...bindings.scene, world: createCampusWorld({
      ...bindings.world, frames: bindings.scene.frames,
      isPlacementFrozen: id => bindings.scene.viewer.isPlacementFrozen(id),
    }) });
    cleanups.push(() => controller.destroy());
    const scenePanel = createScenesPanel({
      document: bindings.document, controller, ui: bindings.scenesUi,
      contributions: bindings.sceneContributions,
      externalLinkIcon: bindings.viewerUi.externalLinkIcon,
    });
    cleanups.push(() => scenePanel.destroy());
    const viewer = bindings.scene.viewer;
    const viewerTabs = createViewerTabs({
      ...bindings.viewerUi, document: bindings.document, viewer,
      image: id => viewer.describeImage?.(id) ?? null,
      detail: status => status.immersionDetail ? {
        shown: status.immersionDetail.representation,
        loading: status.immersionDetail.loading,
        limitation: status.immersionDetail.limitation,
        progress: status.immersionDetail.progress,
      } : null,
    });
    cleanups.push(() => viewerTabs.destroy());
    const about = createCampusAboutPanel({ ...bindings.about, document: bindings.document });
    cleanups.push(() => about.dispose());
    const hotspots = createSceneHotspots({ document: bindings.document, controller, container: bindings.hotspots });
    cleanups.push(() => hotspots.destroy());
    let disposed = false;
    return {
      controller, viewerTabs,
      panels: { scenes: scenePanel.element, about: about.element, panorama: viewerTabs.panorama, "panorama-settings": viewerTabs.settings },
      loadInitialScene: (id: string = TWIN_CITIES.id) => id ? controller.load(id, { exampleId: true }) : Promise.resolve(false),
      dispose(): void {
        if (disposed) return;
        disposed = true;
        const errors: unknown[] = [];
        for (const cleanup of cleanups.reverse()) {
          try { cleanup(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, "Campus content cleanup failed");
      },
      whenSettled: () => controller.whenSettled(),
    };
  } catch (error) {
    const errors: unknown[] = [error];
    for (const cleanup of cleanups.reverse()) {
      try { cleanup(); } catch (failure) { errors.push(failure); }
    }
    throw new AggregateError(errors, "Campus content could not mount");
  }
}
