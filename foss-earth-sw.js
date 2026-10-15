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

install(self, {"schemaVersion":1,"base":"/tour/","scope":"/tour/","workerFile":"foss-earth-sw.js","cacheNamespace":"foss-earth-app-files","identity":null,"retention":"current-only","files":[{"url":"/tour/assets/abstractAudioBus-IbX4iSMC.js"},{"url":"/tour/assets/abstractAudioNode-DW4VTajR.js"},{"url":"/tour/assets/abstractEngine.cubeTexture-cMSk1ILP.js"},{"url":"/tour/assets/abstractSoundInstance-CuuNUr0j.js"},{"url":"/tour/assets/abstractSoundSource-DPuUWwWE.js"},{"url":"/tour/assets/animation-CISTNmG2.js"},{"url":"/tour/assets/animationGroup-C5touQxJ.js"},{"url":"/tour/assets/atlasImagery.worker-DUEn_MaY.js"},{"url":"/tour/assets/babylon-shaders-glsl-BDB5h_-g.js"},{"url":"/tour/assets/babylon-shaders-wgsl-4lt-j9l0.js"},{"url":"/tour/assets/baseTexture.polynomial-CdOLN9AG.js"},{"url":"/tour/assets/bone-BSAHU30F.js"},{"url":"/tour/assets/brdfTextureTools-DRoAwK2W.js"},{"url":"/tour/assets/browser-DODu6uFy.js"},{"url":"/tour/assets/buffer-b_H5Wxjb.js"},{"url":"/tour/assets/buffer-UQglctLJ.js"},{"url":"/tour/assets/cubemapToSphericalPolynomial-DZ-4BfiG.js"},{"url":"/tour/assets/dataBuffer-C-wqV4qF.js"},{"url":"/tour/assets/dds-DW143fdq.js"},{"url":"/tour/assets/decorators-CN1Ng5e5.js"},{"url":"/tour/assets/devTools-DmD3AOL3.js"},{"url":"/tour/assets/dumpTools-CNL1mem_.js"},{"url":"/tour/assets/easing-Dm9VDgD4.js"},{"url":"/tour/assets/editor-1D5c3W5u.css"},{"url":"/tour/assets/editor-9-gdK4iD.js"},{"url":"/tour/assets/effectRenderer-DU-i8n3O.js"},{"url":"/tour/assets/egm2008-15-nvvz7MYe.bin"},{"url":"/tour/assets/egm2008-30-BpPXoGjA.bin"},{"url":"/tour/assets/egm2008-60-bDxgbz8U.bin"},{"url":"/tour/assets/engineStore-CKkyXB7S.js"},{"url":"/tour/assets/environmentTextureTools-Bn0alKO9.js"},{"url":"/tour/assets/floatingOriginMatrixOverrides-DqSG47nr.js"},{"url":"/tour/assets/flowGraphAssetsContext-WtUyuDAI.js"},{"url":"/tour/assets/flowGraphAsyncExecutionBlock-Bvl308Y3.js"},{"url":"/tour/assets/flowGraphBinaryOperationBlock-DmSGZwyK.js"},{"url":"/tour/assets/flowGraphBlock-ERqv2EAF.js"},{"url":"/tour/assets/flowGraphCachedOperationBlock-B_GY8dWh.js"},{"url":"/tour/assets/flowGraphCoordinator-BO9TQ43j.js"},{"url":"/tour/assets/flowGraphEventBlock-BU7xe34R.js"},{"url":"/tour/assets/flowGraphExecutionBlock-Dlmpalig.js"},{"url":"/tour/assets/flowGraphExecutionBlockWithOutSignal-BCvgF3Qh.js"},{"url":"/tour/assets/flowGraphGLTFDataProvider-Yyxasxo8.js"},{"url":"/tour/assets/flowGraphUnaryOperationBlock-Bwzs7hNO.js"},{"url":"/tour/assets/glTFLoaderAnimation-BnFFTY9h.js"},{"url":"/tour/assets/guid-BXdVC_j_.js"},{"url":"/tour/assets/index.babylonjs-Cp12tnZj.js"},{"url":"/tour/assets/index.core-plugins-CgMOOvEN.js"},{"url":"/tour/assets/lightConstants-DUaNSuF5.js"},{"url":"/tour/assets/LoaderBase-ATuDWTDB-Dma9wrKU.js"},{"url":"/tour/assets/logger-CuBYPcDK.js"},{"url":"/tour/assets/math.axis-B0uJO_Mu.js"},{"url":"/tour/assets/math.color-Q4dgtYWM.js"},{"url":"/tour/assets/math.frustum-CcMj5eGx.js"},{"url":"/tour/assets/math.path-DGvzraWE.js"},{"url":"/tour/assets/math.plane-BUns5kps.js"},{"url":"/tour/assets/math.scalar.functions-CQA38JRp.js"},{"url":"/tour/assets/math.size-BvsHYnOu.js"},{"url":"/tour/assets/math.vector-lDpFf2si.js"},{"url":"/tour/assets/minneapolis-B1hVh8lt.js"},{"url":"/tour/assets/node-9ZucUUwN.js"},{"url":"/tour/assets/observable-CJ4J1f_C.js"},{"url":"/tour/assets/openpbrMaterialLoadingAdapter-B49Ab7S9.js"},{"url":"/tour/assets/pbrMaterialLoadingAdapter-BunCRSFe.js"},{"url":"/tour/assets/pickingInfo-DGMxPzFJ.js"},{"url":"/tour/assets/pointerEvents-_20Qj9Uk.js"},{"url":"/tour/assets/precisionDate-CfCevjl-.js"},{"url":"/tour/assets/rgbdTextureTools-z_xFoLMO.js"},{"url":"/tour/assets/scene-CzrUaDk5.js"},{"url":"/tour/assets/scenes-9uieq65t.js"},{"url":"/tour/assets/scenes-CiX8TqAt.css"},{"url":"/tour/assets/selector-5VoqchkJ.js"},{"url":"/tour/assets/selector-F7PVzfup.css"},{"url":"/tour/assets/spatialWebAudio-B-bb5ZWA.js"},{"url":"/tour/assets/spatialWebAudioUpdaterComponent-DlOLam-_.js"},{"url":"/tour/assets/starCatalogue-DSWPyUwb.js"},{"url":"/tour/assets/stPaul-CRw-KeCX.js"},{"url":"/tour/assets/subMesh-5zcjggbt.js"},{"url":"/tour/assets/terrainDecode.worker-BAkkqX9l.js"},{"url":"/tour/assets/texture-BbkUzidn.js"},{"url":"/tour/assets/textureTools-uWrgpOJv.js"},{"url":"/tour/assets/thinEngine-bHOD-y2H.js"},{"url":"/tour/assets/tools-B2YksR7s.js"},{"url":"/tour/assets/tools.functions-CpAPkLao.js"},{"url":"/tour/assets/twinCities-D4mHxVeU.js"},{"url":"/tour/assets/typeStore-Cu_sj2zM.js"},{"url":"/tour/assets/utils-BAE1Z-JU.js"},{"url":"/tour/assets/viewer-B12HdaYd.js"},{"url":"/tour/assets/webAudioBaseSubGraph-DhZYilV5.js"},{"url":"/tour/assets/webRequest-dqz0dHXK.js"}],"retainedFiles":[]});
