// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import type { SceneControllerState } from "@foss-earth/scenes/browser";
import { createCampusDevSession, type CampusDevBindings } from "./dev-session";

function harness(search: string) {
  const controller = new AbortController();
  const current: SceneControllerState = { loading: null, errors: [], status: null };
  const observers = new Set<(state: SceneControllerState) => void>();
  const stopObservation = vi.fn();
  const subscribe = vi.fn((listener: (state: SceneControllerState) => void) => {
    observers.add(listener); listener(current);
    return () => { observers.delete(listener); stopObservation(); };
  });
  let tab: Parameters<CampusDevBindings["registerTab"]>[0] | null = null;
  const unregisterTab = vi.fn();
  const registerTab = vi.fn<CampusDevBindings["registerTab"]>(value => { tab = value; return unregisterTab; });
  const onError = vi.fn();
  const createAbortController = vi.fn(() => new AbortController());
  const bindings: CampusDevBindings = {
    search, document, signal: controller.signal,
    controller: { state: () => current, subscribe },
    release: { configuredManifestUrl: "tour/twin-cities/scene.json" },
    registerTab, createAbortController, onError,
  };
  return { bindings, controller, observers, stopObservation, subscribe, registerTab, unregisterTab, onError, createAbortController, tab: () => tab };
}

it.each(["", "?dev", "?dev=true", "?dev=1&dev=1", "?report&dev=1"])("does not register or observe outside the exact Dev gate (%s)", async search => {
  const h = harness(search);
  expect(await createCampusDevSession(h.bindings)).toBeNull();
  expect(h.registerTab).not.toHaveBeenCalled();
  expect(h.subscribe).not.toHaveBeenCalled();
  expect(h.createAbortController).not.toHaveBeenCalled();
});

it("uses the real shared tab visibility/session for close, reopen and outer teardown", async () => {
  const h = harness("?dev=1");
  const handle = await createCampusDevSession(h.bindings);
  expect(handle).not.toBeNull();
  expect(h.registerTab).toHaveBeenCalledOnce();
  expect(h.subscribe).not.toHaveBeenCalled();
  h.tab()!.onOpenChange(true);
  await handle!.whenSettled();
  expect(h.subscribe).toHaveBeenCalledOnce();
  expect(handle!.element.textContent).toContain("Configured release manifest URL");
  h.tab()!.onOpenChange(false);
  await handle!.whenSettled();
  expect(h.stopObservation).toHaveBeenCalledOnce();
  expect(h.observers.size).toBe(0);
  h.tab()!.onOpenChange(true);
  await handle!.whenSettled();
  expect(h.subscribe).toHaveBeenCalledTimes(2);
  h.controller.abort();
  await handle!.whenSettled();
  handle!.dispose();
  expect(handle!.session.disposed).toBe(true);
  expect(h.stopObservation).toHaveBeenCalledTimes(2);
  expect(h.unregisterTab).toHaveBeenCalledOnce();
  expect(h.observers.size).toBe(0);
  expect(h.onError).not.toHaveBeenCalled();
});

it("does not register after cancellation while public presentation imports are pending", async () => {
  const h = harness("?dev=1");
  const pending = createCampusDevSession(h.bindings);
  h.controller.abort();
  expect(await pending).toBeNull();
  expect(h.registerTab).not.toHaveBeenCalled();
  expect(h.observers.size).toBe(0);
});

it("settles cancellation before a lazy mount starts without retaining observations or a tab", async () => {
  const h = harness("?dev=1");
  const handle = await createCampusDevSession(h.bindings);
  h.tab()!.onOpenChange(true);
  h.controller.abort();
  await handle!.whenSettled();
  expect(h.observers.size).toBe(0);
  expect(h.unregisterTab).toHaveBeenCalledOnce();
  expect(handle!.session.disposed).toBe(true);
});

it("disposes a handle that resolves after cancellation without attaching its stale view", async () => {
  const h = harness("?dev=1");
  const handle = await createCampusDevSession(h.bindings);
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const dispose = vi.fn();
  const view = document.createElement("p");
  view.textContent = "Late view must never attach";
  let resolveMount!: (value: { view: HTMLElement; dispose: () => void }) => void;
  const mounting = new Promise<{ view: HTMLElement; dispose: () => void }>(resolve => { resolveMount = resolve; });
  handle!.session.register({
    id: "campus.late-fixture", title: "Late fixture", owner: "UMN-VR/tour",
    mount: () => { started(); return mounting; },
  });
  h.tab()!.onOpenChange(true);
  await entered;
  h.controller.abort();
  resolveMount({ view, dispose });
  await handle!.whenSettled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(view.isConnected).toBe(false);
  expect(handle!.element.textContent).not.toContain(view.textContent);
  expect(h.observers.size).toBe(0);
  expect(h.unregisterTab).toHaveBeenCalledOnce();
  expect(h.onError).not.toHaveBeenCalled();
});
