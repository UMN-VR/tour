import { useLayoutEffect, useReducer, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AdoptedElement, WindowOverlay, type WindowOverlayProps } from "@foss-earth/ui/react";
import type { WindowOverlayHandle, WindowTabDefinition } from "@foss-earth/ui/windowing";
import { bindToolbarLauncher } from "@foss-earth/toolbar/browser";
import type { ViewerTabs } from "@foss-earth/360/panels";
import type { DevTabRegistration } from "@foss-earth/dev";
import type { createCampusTabVisibility } from "./tab-visibility";
import "@foss-earth/ui/styles.css";
import "@foss-earth/ui/windowing.css";
import "@foss-earth/toolbar/styles.css";

export const CAMPUS_TAB_IDS = [
  "location", "controls", "interface", "settings", "map", "renderer", "sky", "time",
  "scenes", "about", "bug-report", "panorama", "panorama-settings",
] as const;
export type CampusTabId = typeof CAMPUS_TAB_IDS[number];
export type CampusShellTabId = CampusTabId | "dev";

const labels: Record<CampusTabId, string> = {
  location: "Location", controls: "Controls", interface: "Interface", settings: "Settings",
  map: "Map", renderer: "Renderer", sky: "Sky", time: "Date and time", scenes: "Scenes",
  about: "About", "bug-report": "Bug report", panorama: "360", "panorama-settings": "360 image settings",
};
const baseOnlyTabs = new Set<CampusShellTabId>(["location", "map", "sky", "time"]);
const contextOnlyTabs = new Set<CampusShellTabId>(["panorama", "panorama-settings"]);

type Overlay = WindowOverlayProps<CampusShellTabId>;
export interface CampusShellBindings {
  /** Every current tab has a real panel; no missing panel silently becomes empty. */
  panels: Readonly<Record<CampusTabId, HTMLElement>>;
  viewerTabs: Pick<ViewerTabs, "getSnapshot" | "subscribe" | "leave">;
  visibility: ReturnType<typeof createCampusTabVisibility>;
  storage: Overlay["storage"];
  geometry: Overlay["geometry"];
  logSize: Overlay["logSize"];
  layoutPort: Overlay["layoutPort"];
  /** Only the exact shared Dev session gate may supply this startup registration. */
  dev?: DevTabRegistration & { element: HTMLElement };
  launchers?: Partial<Record<CampusTabId, HTMLButtonElement>>;
  onBugReportShow(): void;
  onBeforeCloseTab?: Overlay["onBeforeCloseTab"];
  focus?: Overlay["focus"];
}

/**
 * UMN owns its tab content and catalogue. Public UI owns workspace/layout state;
 * public Toolbar owns native launcher events. Runtime/viewer/panels are borrowed.
 * Optional Dev has this shell's lifetime, so unregister follows shell teardown.
 */
export function createCampusShell(container: HTMLElement, bindings: CampusShellBindings) {
  const overlayApiRef: { current: WindowOverlayHandle<CampusShellTabId> | null } = { current: null };
  const restorableTabs = new Set<CampusShellTabId>(CAMPUS_TAB_IDS.filter(id => !contextOnlyTabs.has(id)));
  if (bindings.dev) restorableTabs.add(bindings.dev.id);
  const root = createRoot(container);
  const launcherStops: (() => void)[] = [];
  const pending: { operation: "openOrSelectTab" | "toggleTab"; id: CampusShellTabId }[] = [];
  let disposed = false;
  const subscribeViewer = (listener: () => void): (() => void) => bindings.viewerTabs.subscribe(listener);
  const readViewer = () => bindings.viewerTabs.getSnapshot();
  const invoke = (operation: "openOrSelectTab" | "toggleTab", id: CampusShellTabId): void => {
    if (disposed) return;
    if (overlayApiRef.current) overlayApiRef.current[operation](id);
    else pending.push({ operation, id });
  };
  function CampusWindows() {
    const panorama = useSyncExternalStore(subscribeViewer, readViewer);
    const [, advanceStartup] = useReducer((revision: number) => revision + 1, 0);
    // Child UI layout effects publish their API before this parent effect.
    // Startup actions survive React's asynchronous first commit without a timer.
    useLayoutEffect(() => {
      if (pending.length && overlayApiRef.current) {
        const next = pending.shift()!;
        overlayApiRef.current[next.operation](next.id);
        // toggleTab reads the committed workspace. The next queued command
        // must see the next commit, even when this command was unavailable.
        if (pending.length) advanceStartup();
      }
    });
    const definitions: WindowTabDefinition<CampusShellTabId>[] = CAMPUS_TAB_IDS.map(id => ({
      id, label: id === "panorama" ? panorama.title ?? labels[id] : labels[id],
    }));
    if (bindings.dev) definitions.splice(4, 0, { id: "dev", label: bindings.dev.title });
    return <WindowOverlay<CampusShellTabId>
      tabDefinitions={definitions} restorableTabs={restorableTabs}
      storage={bindings.storage} geometry={bindings.geometry} logSize={bindings.logSize} layoutPort={bindings.layoutPort}
      context={{ active: panorama.title !== null, ready: panorama.onScreen, baseOnlyTabs, contextOnlyTabs, entryTabId: "panorama" }}
      overlayApiRef={overlayApiRef} onBeforeCloseTab={bindings.onBeforeCloseTab}
      focus={{ onOpen: id => bindings.focus?.onOpen?.(id), onClose(id) {
        if (id === "panorama") bindings.viewerTabs.leave();
        bindings.focus?.onClose?.(id);
      } }}
      onTabVisibility={(id, visible) => {
        bindings.visibility.setVisible(id, visible);
        if (id === "dev") bindings.dev?.onOpenChange(visible);
        if (id === "bug-report" && visible) bindings.onBugReportShow();
      }}
      renderTabContent={id => {
        const element = id === "dev" ? bindings.dev?.element : bindings.panels[id];
        return element ? <AdoptedElement element={element} className="foss-earth-element-tab" /> : null;
      }}
    />;
  }
  try {
    root.render(<CampusWindows />);
    for (const id of CAMPUS_TAB_IDS) {
      const button = bindings.launchers?.[id];
      if (button) launcherStops.push(bindToolbarLauncher(button, {
        tabId: id, toggleTab: tab => invoke("toggleTab", tab),
        isTabOpen: tab => bindings.visibility.isVisible(tab), subscribe: listener => bindings.visibility.subscribe(listener),
      }));
    }
  } catch (error) {
    for (const stop of launcherStops.reverse()) stop();
    root.unmount();
    throw error;
  }
  return {
    openOrSelectTab(id: CampusShellTabId): void {
      invoke("openOrSelectTab", id);
    },
    toggleTab(id: CampusShellTabId): void {
      invoke("toggleTab", id);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pending.length = 0;
      try { root.unmount(); }
      finally { for (const stop of launcherStops.reverse()) stop(); }
    },
  };
}
