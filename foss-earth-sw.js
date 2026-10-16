"use strict";
/** Extracted from Earth App/vite/appFilesWorker.js; host policy controls retention.
 * Pages are always network-first; no media cache or app/runtime is constructed. */
function install(worker, manifest) {
  const files = manifest.files.map(file => file.url);
  const paths = new Set(files.map(name => new URL(name, worker.location.href).pathname));
  // One store for the worker's own address: a build's files, whichever of its pages asked for them.
  const cacheName = `${manifest.cacheNamespace} ${new URL(worker.location.href).pathname}`;
  const base = new URL(manifest.base, worker.location.origin);
  const retained = new Set(manifest.retainedFiles.map(file => new URL(file.url, worker.location.href).pathname));
  const matchOptions = { ignoreVary: true, ignoreSearch: true };
  // Set when the page turns keeping off: until the page closes, this worker still sees its requests, and passes them by.
  let forgotten = false;

  /** A response worth keeping: the file itself, from this site. */
  const keepable = response => Boolean(response) && response.ok && response.status === 200 && response.type === "basic" && !response.redirected;

  /** The path of a URL this build lists, or null. */
  const listed = href => {
    let url;
    try { url = new URL(href, worker.location.href); } catch { return null; }
    return url.origin === worker.location.origin && paths.has(url.pathname) ? url.pathname : null;
  };

  async function answer(event, request, path) {
    const cache = await worker.caches.open(cacheName);
    const kept = await cache.match(path, matchOptions);
    if (kept) return kept;
    const response = await worker.fetch(request);
    if (keepable(response)) event.waitUntil(cache.put(path, response.clone()).catch(() => {}));
    return response;
  }

  worker.addEventListener("install", event => {
    // Nothing is fetched ahead: files are kept as the app asks for them. The new list takes over at once.
    event.waitUntil(worker.skipWaiting());
  });

  worker.addEventListener("activate", event => {
    event.waitUntil((async () => {
      // The page is asked for while the worker starts, not after.
      await worker.registration.navigationPreload?.enable().catch(() => {});
      const cache = await worker.caches.open(cacheName);
      // Older pages may still request their files. Deletion is an explicit host
      // policy; retained legacy resources survive either activation policy.
      if (manifest.retention === "current-only") for (const request of await cache.keys()) {
        if (!paths.has(new URL(request.url).pathname) && !retained.has(new URL(request.url).pathname)) await cache.delete(request);
      }
      await worker.clients.claim();
    })());
  });

  worker.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    if (request.mode === "navigate") {
      event.respondWith((async () => {
        // The request made while the worker started, if the browser made one; a failed one is asked again, as a page without this worker would be.
        const preloaded = await Promise.resolve(event.preloadResponse).catch(() => undefined);
        return preloaded || worker.fetch(request);
      })());
      return;
    }
    if (forgotten) return;
    const path = listed(request.url);
    if (path) { event.respondWith(answer(event, request, path)); return; }
    // Existing older files are usable by still-open pages. Do not acquire an
    // unknown file merely because the worker controls the deployment root.
    const url = new URL(request.url);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
    if (retained.has(url.pathname) || manifest.retention === "retain-older") event.respondWith((async () => {
      const cache = await worker.caches.open(cacheName);
      const old = await cache.match(url.pathname, matchOptions);
      if (old) return old;
      if (retained.has(url.pathname)) return answer(event, request, url.pathname);
      return worker.fetch(request);
    })());
  });

  // The page names what it loaded before this worker controlled it; those files are kept from the browser's cache.
  worker.addEventListener("message", event => {
    const data = event.data;
    if (manifest.identity && data?.identity !== manifest.identity) return;
    if (data?.type === "foss-earth-forget") forgotten = true;
    if (data?.type !== "foss-earth-keep" || !Array.isArray(data.urls)) return;
    forgotten = false;
    event.waitUntil((async () => {
      const cache = await worker.caches.open(cacheName);
      for (const href of data.urls) {
        const path = typeof href === "string" ? listed(href) : null;
        if (forgotten || !path || await cache.match(path, matchOptions)) continue;
        const response = await worker.fetch(path, { cache: "force-cache" }).catch(() => null);
        if (keepable(response)) await cache.put(path, response).catch(() => {});
      }
    })());
  });
}

install(self, {"schemaVersion":1,"base":"/tour/","scope":"/tour/","workerFile":"foss-earth-sw.js","cacheNamespace":"foss-earth-app-files","identity":null,"retention":"current-only","files":[{"url":"/tour/assets/abstractAudioBus-IbX4iSMC.js"},{"url":"/tour/assets/abstractAudioNode-DW4VTajR.js"},{"url":"/tour/assets/abstractEngine.cubeTexture-ZXwrhgMb.js"},{"url":"/tour/assets/abstractSoundInstance-CuuNUr0j.js"},{"url":"/tour/assets/abstractSoundSource-DPuUWwWE.js"},{"url":"/tour/assets/animation-P3aXUi1j.js"},{"url":"/tour/assets/animationGroup-yE8NmS7k.js"},{"url":"/tour/assets/atlasImagery.worker-DUEn_MaY.js"},{"url":"/tour/assets/babylon-shaders-glsl-Drrt4eQY.js"},{"url":"/tour/assets/babylon-shaders-wgsl-CH1j5u9P.js"},{"url":"/tour/assets/baseTexture.polynomial-IROAai5H.js"},{"url":"/tour/assets/bone-BMEsatDK.js"},{"url":"/tour/assets/brdfTextureTools-jSOXpqla.js"},{"url":"/tour/assets/browser-DODu6uFy.js"},{"url":"/tour/assets/buffer-DzHfFEM5.js"},{"url":"/tour/assets/buffer-R-lqHbmO.js"},{"url":"/tour/assets/cubemapToSphericalPolynomial-DZZdJlLA.js"},{"url":"/tour/assets/dataBuffer-C-wqV4qF.js"},{"url":"/tour/assets/dds-L2FCuVIg.js"},{"url":"/tour/assets/decorators-CN1Ng5e5.js"},{"url":"/tour/assets/devTools-DmD3AOL3.js"},{"url":"/tour/assets/dumpTools-CPyMVX_N.js"},{"url":"/tour/assets/easing-B0apnTAL.js"},{"url":"/tour/assets/editor-BsaRfy_Q.js"},{"url":"/tour/assets/editor-CG_htNz5.css"},{"url":"/tour/assets/effectRenderer-CEm1euyO.js"},{"url":"/tour/assets/egm2008-15-nvvz7MYe.bin"},{"url":"/tour/assets/egm2008-30-BpPXoGjA.bin"},{"url":"/tour/assets/egm2008-60-bDxgbz8U.bin"},{"url":"/tour/assets/engineStore-CKkyXB7S.js"},{"url":"/tour/assets/environmentTextureTools-BVpLtB1Z.js"},{"url":"/tour/assets/floatingOriginMatrixOverrides-BYvagFBL.js"},{"url":"/tour/assets/flowGraphAssetsContext-WtUyuDAI.js"},{"url":"/tour/assets/flowGraphAsyncExecutionBlock-BSWv0jug.js"},{"url":"/tour/assets/flowGraphBinaryOperationBlock-B2c8U7W-.js"},{"url":"/tour/assets/flowGraphBlock-BGd3ezuf.js"},{"url":"/tour/assets/flowGraphCachedOperationBlock-DA_okW49.js"},{"url":"/tour/assets/flowGraphCoordinator-BfOAgkV-.js"},{"url":"/tour/assets/flowGraphEventBlock-Bkuq5o_X.js"},{"url":"/tour/assets/flowGraphExecutionBlock-oIaguUjY.js"},{"url":"/tour/assets/flowGraphExecutionBlockWithOutSignal-AqTe-cLn.js"},{"url":"/tour/assets/flowGraphGLTFDataProvider-Ds3XfyOT.js"},{"url":"/tour/assets/flowGraphUnaryOperationBlock-CmFPHaGb.js"},{"url":"/tour/assets/glTFLoaderAnimation-Col9Z5fB.js"},{"url":"/tour/assets/guid-BXdVC_j_.js"},{"url":"/tour/assets/index.babylonjs-CF4nR4Hd.js"},{"url":"/tour/assets/index.core-plugins-CgMOOvEN.js"},{"url":"/tour/assets/lightConstants-D61Cf-CC.js"},{"url":"/tour/assets/LoaderBase-ATuDWTDB-Dma9wrKU.js"},{"url":"/tour/assets/logger-CuBYPcDK.js"},{"url":"/tour/assets/math.axis-BS_bBDso.js"},{"url":"/tour/assets/math.color-CgbH50ZP.js"},{"url":"/tour/assets/math.frustum-9Rf_G1Sa.js"},{"url":"/tour/assets/math.path-DPolG3vP.js"},{"url":"/tour/assets/math.plane-Brxovzdf.js"},{"url":"/tour/assets/math.scalar.functions-BLevJv6U.js"},{"url":"/tour/assets/math.size-_GhY70zv.js"},{"url":"/tour/assets/math.vector-DZifONbY.js"},{"url":"/tour/assets/miniViewerCpu-CEwm56Sf.js"},{"url":"/tour/assets/minneapolis-BKHRDt1T.js"},{"url":"/tour/assets/node-BxSk3j85.js"},{"url":"/tour/assets/observable-CJ4J1f_C.js"},{"url":"/tour/assets/openpbrMaterialLoadingAdapter-DEzNLFxl.js"},{"url":"/tour/assets/pbrMaterialLoadingAdapter-dG_qGrzC.js"},{"url":"/tour/assets/pickingInfo-C9CFCdN6.js"},{"url":"/tour/assets/pointerEvents-BtgiQAQ5.js"},{"url":"/tour/assets/precisionDate-CfCevjl-.js"},{"url":"/tour/assets/preload-helper-CHL57AmY.js"},{"url":"/tour/assets/rgbdTextureTools-sHdyjEdD.js"},{"url":"/tour/assets/rolldown-runtime-BpQH8Ho1.js"},{"url":"/tour/assets/scene-BOg6oO54.js"},{"url":"/tour/assets/scenes-CCQJHG-D.css"},{"url":"/tour/assets/scenes-DlpdCC2b.js"},{"url":"/tour/assets/selector-5VoqchkJ.js"},{"url":"/tour/assets/selector-F7PVzfup.css"},{"url":"/tour/assets/spatialWebAudio-C6cwWn7x.js"},{"url":"/tour/assets/spatialWebAudioUpdaterComponent-Dt1l01sv.js"},{"url":"/tour/assets/src-Citv8AKM.js"},{"url":"/tour/assets/starCatalogue-DSWPyUwb.js"},{"url":"/tour/assets/stPaul-Bv6lT5Wq.js"},{"url":"/tour/assets/subMesh-DSDiEAnC.js"},{"url":"/tour/assets/terrainDecode.worker-BAkkqX9l.js"},{"url":"/tour/assets/texture-DYRfPM0G.js"},{"url":"/tour/assets/textureTools-e46ytxgi.js"},{"url":"/tour/assets/thinEngine-DY95Lm3b.js"},{"url":"/tour/assets/thumbnailBackend-DEWM_PC4.js"},{"url":"/tour/assets/thumbnailOcclusion-Dq7SNB76.js"},{"url":"/tour/assets/thumbnailWebGl-D6T6HCF8.js"},{"url":"/tour/assets/thumbnailWebGpu-ma8wP3Jf.js"},{"url":"/tour/assets/tools-SzCa6bP-.js"},{"url":"/tour/assets/tools.functions-CiMGNs-F.js"},{"url":"/tour/assets/twinCities-BVS1CK6K.js"},{"url":"/tour/assets/typeStore-Cu_sj2zM.js"},{"url":"/tour/assets/utils-BAE1Z-JU.js"},{"url":"/tour/assets/viewer-DgD8hy_7.js"},{"url":"/tour/assets/webAudioBaseSubGraph-DhZYilV5.js"},{"url":"/tour/assets/webRequest-dqz0dHXK.js"}],"retainedFiles":[]});
