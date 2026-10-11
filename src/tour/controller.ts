import { validateViewerAsset, type PublishedImageViewer, type ViewerRepresentation } from "@foss-earth/360";
import { createPreviewSheetsExtensionHook } from "@foss-earth/preview-sheets/scene-extension";
import { createBrowserSceneHistory, createSceneController, loadScene, type LoadSceneOptions } from "@foss-earth/scenes/browser";
import { TWIN_CITIES } from "./scenes";

export interface CampusSceneBindings {
  window: Pick<Window, "history" | "addEventListener" | "removeEventListener">;
  canvas: HTMLElement;
  /** Public domain root for the existing root-relative content layout. */
  baseUrl: string;
  fetch: typeof fetch;
  /** One existing viewer and catalogue; this binding creates no renderer/cache. */
  viewer: PublishedImageViewer;
  representations: readonly ViewerRepresentation[];
  world: LoadSceneOptions["world"];
  frames: NonNullable<LoadSceneOptions["frames"]>;
  sessionId: string;
  markerRadiusMeters(): number;
  dragThresholdPx(): number;
  limits: NonNullable<LoadSceneOptions["limits"]>;
  /** Existing representation-owner metadata; do not erase the image details list. */
  describeImage: NonNullable<LoadSceneOptions["describeImage"]>;
  /** Project authored links through the same live viewer/camera as the photograph. */
  projectLink: NonNullable<LoadSceneOptions["projectLink"]>;
  signal?: AbortSignal;
}

/** The sole campus controller loads through checked Scenes and representation hooks. */
export function createCampusSceneController(bindings: CampusSceneBindings) {
  return createSceneController({
    examples: [TWIN_CITIES], baseUrl: bindings.baseUrl, canvas: bindings.canvas,
    dragThresholdPx: () => bindings.dragThresholdPx(), signal: bindings.signal,
    load: (input, { signal, onFailure, onProgress }) => loadScene(input, {
      baseUrl: bindings.baseUrl, fetch: bindings.fetch, signal, onFailure, onProgress,
      viewer: bindings.viewer, world: bindings.world, frames: bindings.frames,
      markerRadiusMeters: () => bindings.markerRadiusMeters(),
      sessionId: bindings.sessionId,
      history: createBrowserSceneHistory(bindings.window),
      representations: bindings.representations.map(representation => representation.hooks),
      validateImageAsset: validateViewerAsset,
      extensionHooks: [createPreviewSheetsExtensionHook()],
      limits: bindings.limits, projectLink: bindings.projectLink,
      describeImage: id => bindings.describeImage(id),
    }),
  });
}
