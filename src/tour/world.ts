import { captureRelativeMarker, ecefToEnuMatrix, enuFrame, groundQueryPoint, groundRelativeMarker, type SurfaceQuery } from "@foss-earth/engine";
import { imagePoseMatrix, mulMat3Mat3, transpose3 } from "@foss-earth/images";
import type { ResolvedPanorama } from "@foss-earth/scenes";
import type { ScenePlacement, SceneWorldPorts } from "@foss-earth/scenes/browser";

export interface CampusWorldBindings {
  /** Query the same displayed surface used by the borrowed globe runtime. */
  surface: Pick<SurfaceQuery, "sample">;
  frames: { subscribe(listener: () => void): () => void };
  isPlacementFrozen(id: string): boolean;
  /** Shared navigation owns momentum, cancellation and overview camera limits. */
  showOverview: SceneWorldPorts["showOverview"];
}

/** Campus-authored placements bind public geographic math to the displayed map. */
export function createCampusWorld(bindings: CampusWorldBindings): SceneWorldPorts {
  const resolvePlacement = (entity: ResolvedPanorama, { radiusMeters }: { radiusMeters: number }): ScenePlacement => {
    const { capture, marker, imagePose, markerStyle } = entity;
    const content = mulMat3Mat3(transpose3(imagePoseMatrix(imagePose)), ecefToEnuMatrix(enuFrame(capture.longitudeDeg, capture.latitudeDeg)));
    const placement: ScenePlacement["placement"] = {
      marker: null, content, radiusMeters,
      outline: markerStyle.outline, hoverScale: markerStyle.hoverScale,
    };
    if (marker.mode === "capture-relative") {
      const height = capture.height?.meters;
      if (height == null || !Number.isFinite(height)) return { placement, state: "unavailable", message: "Capture height is unknown." };
      placement.marker = captureRelativeMarker(capture, height, marker.eastM, marker.northM, marker.offsetM);
    } else {
      const query = groundQueryPoint(capture, marker.eastM, marker.northM);
      const hit = bindings.surface.sample(query.latitudeDeg, query.longitudeDeg);
      if (!hit || !Number.isFinite(hit.heightMeters)) return { placement, state: "pending", message: "Waiting for the displayed surface." };
      placement.marker = groundRelativeMarker(query, hit.heightMeters, marker.offsetM);
    }
    return { placement, state: "placed", message: null };
  };
  return {
    resolvePlacement,
    watchPlacement(entity, options, changed) {
      if (entity.marker.mode !== "ground-relative") return () => {};
      // Metadata preparation can span a ground update before this watcher is
      // installed. Reconcile on the first unfrozen frame; sampling a new
      // baseline here would leave the already published marker at its old height.
      let previous: ScenePlacement | null = null;
      return bindings.frames.subscribe(() => {
        if (bindings.isPlacementFrozen(entity.id)) return;
        const next = resolvePlacement(entity, options);
        const oldPoint = previous?.placement.marker;
        const newPoint = next.placement.marker;
        if (previous && previous.state === next.state && previous.message === next.message
          && (oldPoint === newPoint || (oldPoint && newPoint && oldPoint.every((value, index) => value === newPoint[index])))) return;
        previous = next;
        changed(next);
      });
    },
    showOverview: (overview, options) => bindings.showOverview(overview, options),
  };
}
