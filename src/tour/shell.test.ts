// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewerTabsSnapshot } from "@foss-earth/360/panels";
import { CAMPUS_TAB_IDS, createCampusShell, type CampusShellBindings, type CampusTabId } from "./shell";
import { createCampusTabVisibility } from "./tab-visibility";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const cleanups: (() => void)[] = [];
beforeEach(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => {
  await act(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
  delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
});

function harness(dev = false) {
  const container = document.createElement("div");
  document.body.append(container);
  const panels = Object.fromEntries(CAMPUS_TAB_IDS.map(id => {
    const element = document.createElement("section");
    element.textContent = `Owned ${id} content`;
    return [id, element];
  })) as Record<CampusTabId, HTMLElement>;
  const visibility = createCampusTabVisibility();
  let snapshot: ViewerTabsSnapshot = { title: null, onScreen: false };
  const listeners = new Set<() => void>();
  const setViewer = (next: ViewerTabsSnapshot): void => { snapshot = next; for (const listener of [...listeners]) listener(); };
  const leave = vi.fn(() => { setViewer({ title: null, onScreen: false }); });
  const onOpenChange = vi.fn();
  const devElement = document.createElement("section");
  devElement.textContent = "Owned Dev view";
  const mapLauncher = document.createElement("button");
  mapLauncher.type = "button";
  container.before(mapLauncher);
  const bindings: CampusShellBindings = {
    panels, visibility, storage: null,
    viewerTabs: {
      getSnapshot: () => snapshot,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      leave,
    },
    geometry: { observeWidth(_element, listener) { listener(1200); return () => {}; }, menuBottom: () => null },
    logSize: { getWidth: () => null, subscribe: () => () => {} },
    layoutPort: { publish: vi.fn(), clear: vi.fn() },
    onBugReportShow: vi.fn(), launchers: { map: mapLauncher },
    dev: dev ? { id: "dev", title: "Dev", element: devElement, onOpenChange } : undefined,
  };
  let shell!: ReturnType<typeof createCampusShell>;
  const mount = async (beforeCommit?: (shell: ReturnType<typeof createCampusShell>) => void): Promise<void> => {
    await act(() => {
      shell = createCampusShell(container, bindings);
      cleanups.push(() => { shell.dispose(); visibility.dispose(); container.remove(); mapLauncher.remove(); });
      beforeCommit?.(shell);
    });
  };
  return { container, panels, visibility, setViewer, leave, onOpenChange, devElement, mapLauncher, bindings, mount, shell: () => shell, listeners };
}

it("adopts the actual campus node through close and reopen without losing its accessible content or events", async () => {
  const h = harness();
  const credit = document.createElement("a");
  credit.href = "https://www.youvisit.com/tour/umn";
  credit.textContent = "YouVisit campus photography";
  const clicked = vi.fn();
  credit.addEventListener("click", event => { event.preventDefault(); clicked(); });
  h.panels.scenes.append(credit);
  await h.mount();
  await act(() => { h.shell().openOrSelectTab("scenes"); });
  expect(credit.isConnected).toBe(true);
  await act(() => { h.shell().toggleTab("scenes"); });
  expect(credit.isConnected).toBe(false);
  await act(() => { h.shell().openOrSelectTab("scenes"); });
  credit.click();
  expect(clicked).toHaveBeenCalledOnce();
  expect(credit.textContent).toBe("YouVisit campus photography");
});

it("retains a startup tab action sent before React publishes the workspace handle", async () => {
  const h = harness();
  await h.mount(shell => { shell.openOrSelectTab("scenes"); });
  expect(h.visibility.isVisible("scenes")).toBe(true);
  expect(h.panels.scenes.isConnected).toBe(true);
});

it("applies queued startup toggles against consecutive committed workspaces", async () => {
  const h = harness();
  await h.mount(shell => { shell.toggleTab("map"); shell.toggleTab("map"); });
  expect(h.visibility.isVisible("map")).toBe(false);
  expect(h.panels.map.isConnected).toBe(false);
});

it("continues startup actions after the shared workspace declines an unavailable tab", async () => {
  const h = harness();
  await h.mount(shell => { shell.openOrSelectTab("dev"); shell.openOrSelectTab("scenes"); });
  expect(h.visibility.isVisible("dev")).toBe(false);
  expect(h.visibility.isVisible("scenes")).toBe(true);
});

it("uses the real panorama title/readiness and leaves through the existing viewer when its tab closes", async () => {
  const h = harness();
  await h.mount();
  await act(() => { h.shell().openOrSelectTab("map"); });
  await act(() => { h.setViewer({ title: "360: Northrop Mall", onScreen: false }); });
  expect(h.visibility.isVisible("panorama")).toBe(false);
  await act(() => { h.setViewer({ title: "360: Northrop Mall", onScreen: true }); });
  expect(h.visibility.isVisible("panorama")).toBe(true);
  expect(h.visibility.isVisible("map")).toBe(false);
  expect(h.container.textContent).toContain("360: Northrop Mall");
  await act(() => { h.shell().toggleTab("panorama"); });
  expect(h.leave).toHaveBeenCalledOnce();
  expect(h.visibility.isVisible("panorama")).toBe(false);
  expect(h.visibility.isVisible("map")).toBe(true);
});

it("refreshes About and Bug report only from actual tab visibility", async () => {
  const h = harness();
  const aboutShown = vi.fn();
  h.visibility.whenShown("about")(h.panels.about, aboutShown);
  await h.mount();
  expect(aboutShown).not.toHaveBeenCalled();
  expect(h.bindings.onBugReportShow).not.toHaveBeenCalled();
  await act(() => { h.shell().openOrSelectTab("about"); });
  await act(() => { h.shell().openOrSelectTab("about"); });
  expect(aboutShown).toHaveBeenCalledOnce();
  await act(() => { h.shell().openOrSelectTab("bug-report"); });
  expect(h.bindings.onBugReportShow).toHaveBeenCalledOnce();
  await act(() => { h.shell().toggleTab("bug-report"); });
  expect(h.bindings.onBugReportShow).toHaveBeenCalledOnce();
});

it("connects shared native toolbar launchers to the same workspace and detaches them on teardown", async () => {
  const h = harness();
  await h.mount();
  expect(h.mapLauncher.getAttribute("aria-pressed")).toBe("false");
  await act(() => { h.mapLauncher.click(); });
  expect(h.visibility.isVisible("map")).toBe(true);
  expect(h.mapLauncher.getAttribute("aria-pressed")).toBe("true");
  await act(() => { h.shell().dispose(); });
  h.mapLauncher.click();
  expect(h.visibility.isVisible("map")).toBe(false);
  expect(h.listeners.size).toBe(0);
  expect(h.bindings.layoutPort.clear).toHaveBeenCalledOnce();
});

it("forwards opt-in Dev close, reopen and final shell visibility to its one registration", async () => {
  const h = harness(true);
  await h.mount();
  expect(h.onOpenChange).not.toHaveBeenCalled();
  await act(() => { h.shell().openOrSelectTab("dev"); });
  expect(h.onOpenChange).toHaveBeenLastCalledWith(true);
  expect(h.devElement.isConnected).toBe(true);
  await act(() => { h.shell().toggleTab("dev"); });
  expect(h.onOpenChange).toHaveBeenLastCalledWith(false);
  await act(() => { h.shell().openOrSelectTab("dev"); });
  await act(() => { h.shell().dispose(); });
  expect(h.onOpenChange.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]);
  expect(h.devElement.isConnected).toBe(false);
});

it("does not admit a Dev tab into the default shell", async () => {
  const h = harness();
  await h.mount();
  await act(() => { h.shell().openOrSelectTab("dev"); });
  expect(h.visibility.isVisible("dev")).toBe(false);
  expect(h.devElement.isConnected).toBe(false);
  expect(h.onOpenChange).not.toHaveBeenCalled();
});
