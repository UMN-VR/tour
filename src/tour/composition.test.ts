// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createCampusContentHost } from "./content-host";
import { createCampusDevSession } from "./dev-session";
import { createCampusShell } from "./shell";
import { campusInitialSceneId, createCampusComposition, type CampusCompositionBindings } from "./composition";

// These owner-boundary doubles exercise cancellation/order. The separate shell
// and Dev fixtures consume the real public UI/session; none claims runtime boot.
vi.mock("./content-host", () => ({ createCampusContentHost: vi.fn() }));
vi.mock("./dev-session", () => ({ createCampusDevSession: vi.fn() }));
vi.mock("./shell", () => ({ createCampusShell: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); });

function harness(search = "") {
  const controller = new AbortController();
  const order: string[] = [];
  const content = {
    controller: {}, viewerTabs: {}, panels: {},
    loadInitialScene: vi.fn(() => Promise.resolve(true)),
    dispose: vi.fn(() => { order.push("content"); }), whenSettled: vi.fn(async () => {}),
  };
  const dev = {
    element: document.createElement("section"), session: {},
    dispose: vi.fn(() => { order.push("dev"); }), whenSettled: vi.fn(async () => {}),
  };
  const shell = {
    openOrSelectTab: vi.fn(), toggleTab: vi.fn(),
    dispose: vi.fn(() => { order.push("shell"); }),
  };
  // Irrelevant native ports are deliberately opaque: composition must neither
  // recreate a runtime nor invoke them before a real host supplies them.
  const bindings = {
    container: document.createElement("div"), document, search, signal: controller.signal,
    scene: {}, world: {}, hotspots: document.createElement("div"), scenesUi: {}, viewerUi: {},
    basePanels: {}, shell: {}, about: {}, dev: { createAbortController: () => new AbortController(), onError: vi.fn() },
  } as unknown as CampusCompositionBindings;
  vi.mocked(createCampusContentHost).mockReturnValue(content as unknown as ReturnType<typeof createCampusContentHost>);
  vi.mocked(createCampusDevSession).mockImplementation(async options => {
    options.registerTab({ id: "dev", title: "Dev", element: dev.element, onOpenChange: vi.fn() });
    return dev as unknown as Awaited<ReturnType<typeof createCampusDevSession>>;
  });
  vi.mocked(createCampusShell).mockReturnValue(shell);
  return { bindings, controller, content, dev, shell, order };
}

it.each(["?report", "?report&dev=1"])("does not compose content, tabs or Dev on a report-only route (%s)", async search => {
  const h = harness(search);
  expect(await createCampusComposition(h.bindings)).toBeNull();
  expect(createCampusContentHost).not.toHaveBeenCalled();
  expect(createCampusDevSession).not.toHaveBeenCalled();
  expect(createCampusShell).not.toHaveBeenCalled();
});

it("binds one cancellation/visibility authority and tears down the fixed shell before Dev unregister and content", async () => {
  const h = harness("?dev=1");
  const handle = await createCampusComposition(h.bindings);
  const contentBindings = vi.mocked(createCampusContentHost).mock.calls[0][0];
  expect(contentBindings.scene.signal).toBe(h.controller.signal);
  expect(typeof contentBindings.about.whenShown).toBe("function");
  const shellBindings = vi.mocked(createCampusShell).mock.calls[0][1];
  expect(shellBindings.dev?.element).toBe(h.dev.element);
  expect(shellBindings.viewerTabs).toBe(h.content.viewerTabs);
  h.controller.abort();
  await handle!.whenSettled();
  handle!.dispose();
  expect(h.order).toEqual(["shell", "dev", "content"]);
  expect(h.content.dispose).toHaveBeenCalledOnce();
  expect(h.dev.whenSettled).toHaveBeenCalledOnce();
  expect(h.content.whenSettled).toHaveBeenCalledOnce();
});

it("cleans a late Dev result after cancellation during presentation loading without mounting tabs or fetching a scene", async () => {
  const h = harness("?dev=1");
  let resolve!: (value: Awaited<ReturnType<typeof createCampusDevSession>>) => void;
  vi.mocked(createCampusDevSession).mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = createCampusComposition(h.bindings);
  h.controller.abort();
  resolve(h.dev as unknown as Awaited<ReturnType<typeof createCampusDevSession>>);
  await expect(pending).rejects.toThrow("cancelled");
  expect(h.content.dispose).toHaveBeenCalledOnce();
  expect(h.dev.dispose).toHaveBeenCalledOnce();
  expect(createCampusShell).not.toHaveBeenCalled();
  expect(h.content.loadInitialScene).not.toHaveBeenCalled();
});

it.each([
  ["", "twin-cities"], ["?scene=twin-cities", "twin-cities"],
  ["?scene=", ""], ["?scene=unknown", "unknown"],
  ["?scene=https%3A%2F%2Fother.example%2Fscene.json", "https://other.example/scene.json"],
])("preserves existing catalogue selection precedence (%s)", async (search, expected) => {
  const h = harness(search);
  expect(campusInitialSceneId(search)).toBe(expected);
  const handle = await createCampusComposition(h.bindings);
  expect(h.content.loadInitialScene).toHaveBeenCalledWith(expected);
  handle!.dispose();
});
