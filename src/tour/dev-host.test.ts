// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { SceneControllerState } from "@foss-earth/scenes/browser";
import { createCampusDevRelay } from "./dev-host";

type Contribution = ReturnType<typeof createCampusDevRelay>["contribution"];
type HostPorts = Parameters<Contribution["mount"]>[0]["ports"];
const release = { configuredManifestUrl: "tour/twin-cities/scene.json" };

function observations() {
  let current: SceneControllerState = { loading: null, errors: [], status: null };
  const callbacks = new Set<(state: SceneControllerState) => void>();
  const stop = vi.fn();
  const subscribe = vi.fn((listener: (state: SceneControllerState) => void) => {
    callbacks.add(listener);
    listener(current);
    return () => { callbacks.delete(listener); stop(); };
  });
  return {
    controller: { state: () => current, subscribe }, subscribe, stop, callbacks,
    publish(state: SceneControllerState) {
      current = state;
      for (const callback of [...callbacks]) callback(current);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

it("borrows observations only while mounted, and resubscribes with current facts on reopen", async () => {
  const source = observations();
  const relay = createCampusDevRelay(release);
  relay.attach(source.controller);
  expect(source.subscribe).not.toHaveBeenCalled();
  // The Campus adapter borrows only document from Earth; engine/broker/refresh
  // are deliberately absent from this observation fixture.
  const ports = { document } as HostPorts;
  const firstSignal = new AbortController();
  const first = await relay.contribution.mount({ ports, signal: firstSignal.signal });
  expect(source.subscribe).toHaveBeenCalledOnce();
  expect(first.view.textContent).toContain("Actual loaded manifest URLUnavailable from this host");
  source.publish({ loading: "pending.json", errors: [{ path: "$", message: "Replacement rejected" }], status: null });
  expect(first.view.textContent).toContain("Replacement rejected");
  firstSignal.abort();
  await first.dispose();
  expect(source.stop).toHaveBeenCalledOnce();
  expect(source.callbacks.size).toBe(0);
  const second = await relay.contribution.mount({ ports, signal: new AbortController().signal });
  expect(source.subscribe).toHaveBeenCalledTimes(2);
  expect(second.view.textContent).toContain("Replacement rejected");
  relay.dispose();
  relay.dispose();
  await second.dispose();
  expect(source.stop).toHaveBeenCalledTimes(2);
  expect(source.callbacks.size).toBe(0);
});

it("retains subscription cleanup when an immediate render fails", async () => {
  const source = observations();
  const relay = createCampusDevRelay(release);
  relay.attach(source.controller);
  const hostDocument = document.implementation.createHTMLDocument("Campus Dev");
  const createElement = hostDocument.createElement.bind(hostDocument);
  const failure = new Error("Host view failed");
  let lists = 0;
  vi.spyOn(hostDocument, "createElement").mockImplementation(tag => {
    if (tag === "dl" && ++lists === 2) throw failure;
    return createElement(tag);
  });
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const signal = new AbortController();
  const handle = await relay.contribution.mount({ ports: { document: hostDocument } as HostPorts, signal: signal.signal });
  expect(report).toHaveBeenCalledWith("Campus Dev observations could not update.", failure);
  expect(source.callbacks.size).toBe(1);
  signal.abort();
  await handle.dispose();
  expect(source.callbacks.size).toBe(0);
  expect(source.stop).toHaveBeenCalledOnce();
  relay.dispose();
});
