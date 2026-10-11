import type { DevContribution } from "@foss-earth/dev";
import type { SceneControllerState, SceneViewerImageDetail } from "@foss-earth/scenes/browser";

/** Read-only campus observations supplied by the mounted host, never fetched twice. */
export interface CampusDiagnostics {
  scene?: { id: string; title: string; revision: string; phase: string; generation: number };
  entity?: { id: string; title: string };
  /** Actual loaded address is distinct from the configured default release address. */
  loadedManifestUrl?: string;
  release: { configuredManifestUrl: string; revision?: string; manifestSha256?: string; validationEvidence?: string };
  placements?: { captureSource?: string; northSource?: string; accuracy?: string; alignment?: string; placementsSha256?: string };
  /** The supplied 360 viewer's displayed measurement, never a requested target. */
  immersionDetail?: SceneViewerImageDetail;
  errors?: readonly string[];
  warnings?: readonly string[];
}

export interface CampusDevPorts {
  document: Document;
  read(): CampusDiagnostics;
  /** Changes to already loaded host observations; no polling or preparation is started. */
  subscribe(listener: () => void): () => void;
}

/** Adapt committed public scene facts; pending addresses are not loaded provenance. */
export function campusDiagnostics(state: SceneControllerState, release: CampusDiagnostics["release"]): CampusDiagnostics {
  const status = state.status;
  const active = status?.entries.find(entry => entry.id === status.active);
  const errors = state.errors.map(error => error.path === "$" ? error.message : `${error.path}: ${error.message}`);
  if (status?.lastError) errors.push(status.lastError);
  return {
    release: { ...release },
    ...(status ? { scene: { id: status.sceneId, title: status.title, revision: status.revision, phase: status.phase, generation: status.generation } } : {}),
    ...(active ? { entity: { id: active.id, title: active.title } } : {}),
    ...(active?.capture || active?.pose ? { placements: {
      ...(active.capture?.horizontalAccuracyMeters != null ? { accuracy: `${active.capture.horizontalAccuracyMeters} m` } : {}),
      ...(active.pose?.aligned != null ? { alignment: active.pose.aligned ? "Aligned" : "Not aligned" } : {}),
    } } : {}),
    ...(status?.immersionDetail ? { immersionDetail: {
      ...status.immersionDetail,
      ...(status.immersionDetail.progress ? { progress: [...status.immersionDetail.progress] } : {}),
    } } : {}),
    errors,
    ...(status ? { warnings: status.warnings.map(warning => warning.path === "$" ? warning.message : `${warning.path}: ${warning.message}`) } : {}),
  };
}

/** One campus view in the shared Dev tab; the shared session owns activation/lifecycle. */
export function campusDevContribution(): DevContribution<CampusDevPorts, HTMLElement> {
  return {
    id: "campus.tour", title: "Campus tour", owner: "UMN-VR/tour",
    description: "Loaded campus scene, content release and placement provenance. Read-only observations; missing facts remain unavailable.",
    mount({ ports, signal }) {
      const view = ports.document.createElement("div");
      const render = (): void => {
        const data = ports.read();
        const list = ports.document.createElement("dl");
        const row = (label: string, value: string | undefined): void => {
          const term = ports.document.createElement("dt"); term.textContent = label;
          const detail = ports.document.createElement("dd"); detail.textContent = value ?? "Unavailable from this host";
          list.append(term, detail);
        };
        row("Loaded scene", data.scene ? `${data.scene.title} (${data.scene.id})` : undefined);
        row("Loaded revision", data.scene?.revision);
        row("Scene phase", data.scene?.phase);
        row("Scene generation", data.scene?.generation.toString());
        row("Selected entity", data.entity ? `${data.entity.title} (${data.entity.id})` : undefined);
        row("Actual loaded manifest URL", data.loadedManifestUrl);
        row("Configured release manifest URL", data.release.configuredManifestUrl);
        row("Pinned release revision", data.release.revision);
        row("Pinned manifest SHA-256", data.release.manifestSha256);
        row("Validation evidence", data.release.validationEvidence);
        row("Capture source", data.placements?.captureSource);
        row("North source", data.placements?.northSource);
        row("Placement accuracy", data.placements?.accuracy);
        row("North alignment", data.placements?.alignment);
        row("Placements SHA-256", data.placements?.placementsSha256);
        row("Displayed 360 representation", data.immersionDetail?.representation);
        row("360 loading", data.immersionDetail ? data.immersionDetail.loading ?? "No loading reported" : undefined);
        row("360 limit", data.immersionDetail ? data.immersionDetail.limitation ?? "No limit reported" : undefined);
        row("360 progress", data.immersionDetail?.progress?.join("; "));
        row("Scene errors", data.errors === undefined ? undefined : data.errors.join("; ") || "None reported by this host");
        row("Scene warnings", data.warnings === undefined ? undefined : data.warnings.join("; ") || "None reported by this host");
        view.replaceChildren(list);
      };
      let disposed = false;
      let unsubscribe = (): void => {};
      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener("abort", dispose);
        unsubscribe();
      };
      if (!signal.aborted) {
        render();
        unsubscribe = ports.subscribe(() => { if (!disposed && !signal.aborted) render(); });
        signal.addEventListener("abort", dispose, { once: true });
        if (signal.aborted) dispose();
      }
      return { view, dispose };
    },
  };
}
