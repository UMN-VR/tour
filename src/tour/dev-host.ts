import type { DevContribution } from "@foss-earth/dev";
import type { SceneController } from "@foss-earth/scenes/browser";
import type { CampusDiagnostics } from "./dev";

type HostContribution = DevContribution<{ document: Document }, HTMLElement>;
type SceneObservations = Pick<SceneController, "state" | "subscribe">;

/** Campus observations borrow the existing host controller; no loader or frame loop. */
export function createCampusDevRelay(release: CampusDiagnostics["release"]) {
  let controller: SceneObservations | null = null;
  let stop: (() => void) | null = null;
  let observing = false;
  let disposed = false;
  const listeners = new Set<() => void>();

  const stopObserving = (): void => {
    observing = false;
    const previous = stop;
    stop = null;
    previous?.();
  };
  const observe = (): void => {
    if (disposed || observing || !controller || listeners.size === 0) return;
    const source = controller;
    observing = true;
    // The public controller immediately reports current state. A callback may
    // close/dispose the view before subscribe returns its cleanup function.
    const unsubscribe = source.subscribe(() => {
      for (const listener of [...listeners]) {
        try { listener(); }
        catch (error) {
          // A failed view must not prevent the synchronous subscription from
          // returning its cleanup, or prevent other mounted observers updating.
          console.error("Campus Dev observations could not update.", error);
        }
      }
    });
    if (!observing || disposed || controller !== source || listeners.size === 0) unsubscribe();
    else stop = unsubscribe;
  };
  const subscribe = (listener: () => void): (() => void) => {
    if (disposed) return () => {};
    listeners.add(listener);
    observe();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stopObserving();
    };
  };

  const contribution: HostContribution = {
    id: "campus.tour", title: "Campus tour", owner: "UMN-VR/tour",
    description: "Loaded campus scene and selected entity. Missing loaded addresses and owner provenance remain unavailable.",
    async mount({ ports, signal }) {
      const { campusDevContribution, campusDiagnostics } = await import("./dev");
      return campusDevContribution().mount({
        signal,
        ports: {
          document: ports.document,
          read: () => controller ? campusDiagnostics(controller.state(), release) : { release: { ...release } },
          subscribe,
        },
      });
    },
  };

  return {
    contribution,
    attach(source: SceneObservations): void {
      if (disposed || controller === source) return;
      stopObserving();
      controller = source;
      observe();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stopObserving();
      listeners.clear();
      controller = null;
    },
  };
}
