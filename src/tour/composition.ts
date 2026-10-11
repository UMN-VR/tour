import type { DevTabRegistration } from "@foss-earth/dev";
import { createCampusContentHost, type CampusContentBindings } from "./content-host";
import { createCampusDevSession, type CampusDevBindings } from "./dev-session";
import { createCampusShell, type CampusShellBindings, type CampusTabId } from "./shell";
import { createCampusTabVisibility } from "./tab-visibility";
import { TWIN_CITIES } from "./scenes";

type ContentTabId = "scenes" | "about" | "panorama" | "panorama-settings";
/** Existing address-bar scene selection is a catalogue ID, never an arbitrary URL. */
export function campusInitialSceneId(search: string): string {
  return new URLSearchParams(search).get("scene") ?? TWIN_CITIES.id;
}
export interface CampusCompositionBindings extends Omit<CampusContentBindings, "about"> {
  container: HTMLElement;
  search: string;
  signal: AbortSignal;
  basePanels: Readonly<Record<Exclude<CampusTabId, ContentTabId>, HTMLElement>>;
  shell: Omit<CampusShellBindings, "panels" | "viewerTabs" | "visibility" | "dev">;
  about: Omit<CampusContentBindings["about"], "document" | "whenShown">;
  dev: Pick<CampusDevBindings, "createAbortController" | "onError">;
}

/**
 * Complete Campus-owned composition over already booted public owner ports.
 * The entry must handle report-only before starting its runtime. This additional
 * guard prevents content/session work if a report-only host calls us anyway.
 */
export async function createCampusComposition(bindings: CampusCompositionBindings) {
  if (new URLSearchParams(bindings.search).has("report")) return null;
  if (bindings.signal.aborted) throw new Error("Campus composition was cancelled.");
  const visibility = createCampusTabVisibility();
  const content = createCampusContentHost({
    ...bindings, scene: { ...bindings.scene, signal: bindings.signal },
    about: { ...bindings.about, whenShown: visibility.whenShown("about") },
  });
  let shell: ReturnType<typeof createCampusShell> | null = null;
  let dev: Awaited<ReturnType<typeof createCampusDevSession>> = null;
  let devTab: (DevTabRegistration & { element: HTMLElement }) | undefined;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    bindings.signal.removeEventListener("abort", dispose);
    const errors: unknown[] = [];
    // UI reports final false visibility while Dev and About still own their
    // observers. Dev unregister happens only after this fixed shell is gone.
    for (const cleanup of [() => shell?.dispose(), () => dev?.dispose(), () => content.dispose(), () => visibility.dispose()]) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Campus composition cleanup failed");
  };
  bindings.signal.addEventListener("abort", dispose, { once: true });
  try {
    dev = await createCampusDevSession({
      ...bindings.dev, search: bindings.search, document: bindings.document, signal: bindings.signal,
      controller: content.controller, release: { configuredManifestUrl: TWIN_CITIES.url },
      registerTab(tab) {
        if (disposed || devTab) throw new Error("Campus Dev must register once before shell mount.");
        devTab = tab;
        return () => { if (devTab === tab) devTab = undefined; };
      },
    });
    if (disposed || bindings.signal.aborted) {
      dev?.dispose();
      throw new Error("Campus composition was cancelled.");
    }
    shell = createCampusShell(bindings.container, {
      ...bindings.shell, panels: { ...bindings.basePanels, ...content.panels },
      viewerTabs: content.viewerTabs, visibility, dev: devTab,
    });
    const initialScene = content.loadInitialScene(campusInitialSceneId(bindings.search));
    return {
      content, shell, initialScene, dispose,
      async whenSettled(): Promise<void> { await Promise.all([content.whenSettled(), dev?.whenSettled()]); },
    };
  } catch (error) {
    try { dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Campus composition could not mount"); }
    throw error;
  }
}
