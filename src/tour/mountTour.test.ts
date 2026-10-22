import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountGlobeApp } from "foss-earth";
import { getAppSettings } from "foss-earth/settings";
import { isBrowserRecoveryPage, markBrowserAppReady, reportBrowserAppFailure } from "@foss-earth/ui/browser";
import { MINNEAPOLIS } from "./scenes";
import { mountTour } from "./mountTour";
import { applyTourPerformanceDefaults } from "./performanceDefaults";

vi.mock("foss-earth", () => ({ mountGlobeApp: vi.fn() }));
vi.mock("foss-earth/settings", () => ({ getAppSettings: vi.fn() }));
vi.mock("@foss-earth/ui/browser", () => ({ isBrowserRecoveryPage: vi.fn(), markBrowserAppReady: vi.fn(), reportBrowserAppFailure: vi.fn() }));
vi.mock("./campusSunTime", () => ({ applyCampusSunTime: vi.fn() }));
vi.mock("./performanceDefaults", () => ({ applyTourPerformanceDefaults: vi.fn() }));

describe("tour startup recovery", () => {
  let root: HTMLElement;
  let document: Document;

  beforeEach(() => {
    vi.resetAllMocks();
    root = { innerHTML: "" } as HTMLElement;
    document = { getElementById: vi.fn(() => root) } as unknown as Document;
    vi.stubGlobal("document", document);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("leaves the standalone recovery page free of tour initialization", () => {
    vi.mocked(isBrowserRecoveryPage).mockReturnValue(true);
    mountTour(MINNEAPOLIS);
    expect(getAppSettings).not.toHaveBeenCalled();
    expect(mountGlobeApp).not.toHaveBeenCalled();
    expect(markBrowserAppReady).not.toHaveBeenCalled();
  });

  it("marks the page ready only when the globe finishes mounting", async () => {
    let finish!: (app: Awaited<ReturnType<typeof mountGlobeApp>>) => void;
    vi.mocked(mountGlobeApp).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mountTour(MINNEAPOLIS);
    expect(markBrowserAppReady).not.toHaveBeenCalled();
    expect(applyTourPerformanceDefaults).toHaveBeenCalledWith(vi.mocked(getAppSettings).mock.results[0].value);
    expect(vi.mocked(applyTourPerformanceDefaults).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(mountGlobeApp).mock.invocationCallOrder[0]);
    expect(mountGlobeApp).toHaveBeenCalledWith(root, { scenes: [MINNEAPOLIS], initialScene: MINNEAPOLIS.id, poseExportPrefix: "umn-tour-poses", layerExportPrefix: "umn-tour-layers", linkExportPrefix: "umn-tour-links" });
    finish({} as Awaited<ReturnType<typeof mountGlobeApp>>);
    await vi.waitFor(() => expect(markBrowserAppReady).toHaveBeenCalledWith(document));
    expect(reportBrowserAppFailure).not.toHaveBeenCalled();
  });

  it("reports failed startup and keeps the visible loading error", async () => {
    vi.mocked(mountGlobeApp).mockRejectedValue(new Error("Stored state is unusable"));
    mountTour(MINNEAPOLIS);
    await vi.waitFor(() => expect(reportBrowserAppFailure).toHaveBeenCalledWith(document, "The tour could not start. Error: Stored state is unusable"));
    expect(root.innerHTML).toContain("The tour could not start.");
    expect(root.innerHTML).not.toContain("Stored state is unusable");
    expect(markBrowserAppReady).not.toHaveBeenCalled();
  });

  it("reports a missing mount point before raising its existing error", () => {
    vi.mocked(document.getElementById).mockReturnValue(null);
    expect(() => mountTour(MINNEAPOLIS)).toThrow('Expected to find a root element with id "root".');
    expect(reportBrowserAppFailure).toHaveBeenCalledWith(document, "The tour could not start.");
    expect(mountGlobeApp).not.toHaveBeenCalled();
  });
});
