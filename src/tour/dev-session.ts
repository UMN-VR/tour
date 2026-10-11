import { wantsDev, type DevError } from "@foss-earth/dev";
import type { SceneController } from "@foss-earth/scenes/browser";
import { createCampusDevRelay } from "./dev-host";
import type { CampusDiagnostics } from "./dev";

export interface CampusDevBindings {
  search: string;
  document: Document;
  controller: Pick<SceneController, "state" | "subscribe">;
  release: CampusDiagnostics["release"];
  registerTab: Parameters<typeof import("@foss-earth/dev/browser").createDevBrowserHost>[0]["registerTab"];
  createAbortController(): AbortController;
  onError(error: DevError): void;
  signal: AbortSignal;
}

/** Bind the opt-in view to the existing tab registry and committed controller. */
export async function createCampusDevSession(bindings: CampusDevBindings) {
  if (new URLSearchParams(bindings.search).has("report") || !wantsDev(bindings.search) || bindings.signal.aborted) return null;
  const [{ createDevSession }, { createDevBrowserHost }] = await Promise.all([
    import("@foss-earth/dev"), import("@foss-earth/dev/browser"), import("@foss-earth/dev/panel.css"),
  ]);
  if (bindings.signal.aborted) return null;
  const relay = createCampusDevRelay(bindings.release);
  relay.attach(bindings.controller);
  try {
    const browser = createDevBrowserHost({ document: bindings.document, registerTab: bindings.registerTab });
    const session = createDevSession({
      search: bindings.search, ports: { document: bindings.document }, host: browser.host,
      contributions: [relay.contribution],
      createAbortController: () => bindings.createAbortController(),
      onError: error => bindings.onError(error),
    });
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      bindings.signal.removeEventListener("abort", dispose);
      try { session.dispose(); } finally { relay.dispose(); }
    };
    bindings.signal.addEventListener("abort", dispose, { once: true });
    if (bindings.signal.aborted) dispose();
    return {
      element: browser.element, session, dispose,
      whenSettled: () => session.whenSettled(),
    };
  } catch (error) {
    relay.dispose();
    throw error;
  }
}
