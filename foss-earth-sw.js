"use strict";
/** Extracted from Earth App/vite/appFilesWorker.js; host policy controls retention.
 * Pages are always network-first; no media cache or app/runtime is constructed.
 * Cross-origin isolation (docs/docs/proposals/webassembly.md, step 3): the build
 * says whether it may isolate (manifest.isolation), the page says whether it
 * wants to in the worker's own address, `?keep=1&isolate=1`, which survives the
 * worker being stopped; a page changes either by registering another address. */
function install(worker, manifest) {
  const policy = new URL(worker.location.href).searchParams;
  // An address without a policy is an older page's: it kept files and did not isolate. A build that keeps nothing never does.
  const keeping = manifest.keepFiles !== false && policy.get("keep") !== "0";
  const isolation = manifest.isolation ?? "off";
  const isolating = isolation !== "off" && policy.get("isolate") === "1";
  const suffix = isolation === "report-only" ? "-Report-Only" : "";
  // COEP require-corp, not credentialless, which Safari may lack; CORP so an isolated page elsewhere may load these files.
  const isolationHeaders = isolating ? [[`Cross-Origin-Opener-Policy${suffix}`, "same-origin"],
    [`Cross-Origin-Embedder-Policy${suffix}`, "require-corp"], ["Cross-Origin-Resource-Policy", "cross-origin"]] : [];
  // Bodiless statuses: a Response with one of these cannot be given a body, even an empty stream.
  const bodiless = new Set([101, 103, 204, 205, 304]);
  /** The response as served, with the isolation headers; stored responses keep what the server sent. Status 0 and opaque redirects cannot be rebuilt. */
  const served = response => {
    if (!isolationHeaders.length || !response || response.status === 0 || response.type === "opaqueredirect" || response.type === "opaque") return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of isolationHeaders) headers.set(name, value);
    return new Response(bodiless.has(response.status) ? null : response.body, { status: response.status, statusText: response.statusText, headers });
  };
  // Documents and workers carry the page's isolation; other same-origin loads need no headers, so they pass by unless kept.
  const needsHeaders = request => request.mode === "navigate" || request.destination === "worker" || request.destination === "sharedworker";
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
      // A worker that keeps nothing has no store: what an earlier one kept goes, as the page that turned keeping off asks.
      if (!keeping) await worker.caches.delete(cacheName).catch(() => {});
      else {
        const cache = await worker.caches.open(cacheName);
        // Older pages may still request their files. Deletion is an explicit host
        // policy; retained legacy resources survive either activation policy.
        if (manifest.retention === "current-only") for (const request of await cache.keys()) {
          if (!paths.has(new URL(request.url).pathname) && !retained.has(new URL(request.url).pathname)) await cache.delete(request);
        }
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
        return served(preloaded || await worker.fetch(request));
      })());
      return;
    }
    // As coi-serviceworker: a request that may only be answered from the browser's cache is not this worker's to fetch.
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
    let url;
    try { url = new URL(request.url); } catch { return; }
    const own = url.origin === worker.location.origin;
    const isolate = () => { if (isolationHeaders.length && own && needsHeaders(request)) event.respondWith(worker.fetch(request).then(served)); };
    if (forgotten || !keeping) { isolate(); return; }
    const path = listed(request.url);
    if (path) { event.respondWith(answer(event, request, path).then(served)); return; }
    // Existing older files are usable by still-open pages. Do not acquire an
    // unknown file merely because the worker controls the deployment root.
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) { isolate(); return; }
    if (retained.has(url.pathname) || manifest.retention === "retain-older") event.respondWith((async () => {
      const cache = await worker.caches.open(cacheName);
      const old = await cache.match(url.pathname, matchOptions);
      if (old) return served(old);
      if (retained.has(url.pathname)) return served(await answer(event, request, url.pathname));
      return served(await worker.fetch(request));
    })());
    else isolate();
  });

  // The page names what it loaded before this worker controlled it; those files are kept from the browser's cache.
  worker.addEventListener("message", event => {
    const data = event.data;
    if (manifest.identity && data?.identity !== manifest.identity) return;
    if (data?.type === "foss-earth-forget") forgotten = true;
    if (!keeping || data?.type !== "foss-earth-keep" || !Array.isArray(data.urls)) return;
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

install(self, {"schemaVersion":1,"base":"/tour/","scope":"/tour/","workerFile":"foss-earth-sw.js","cacheNamespace":"foss-earth-app-files","identity":null,"retention":"current-only","isolation":"enforce","keepFiles":true,"files":[{"url":"/tour/assets/abstractAudioBus-CIfPVnAK.js"},{"url":"/tour/assets/abstractAudioNode-C2TJZxQY.js"},{"url":"/tour/assets/abstractEngine.cubeTexture-BUq8pIf9.js"},{"url":"/tour/assets/abstractSoundInstance-D-nFsAP0.js"},{"url":"/tour/assets/abstractSoundSource-BjQUHXmI.js"},{"url":"/tour/assets/animationGroup-ygRtJbfz.js"},{"url":"/tour/assets/atlasImagery.worker-PBssh3f2.js"},{"url":"/tour/assets/babylon-shader-store-D-XQlhUT.js"},{"url":"/tour/assets/babylon-shaders-glsl-DEWEOcF5.js"},{"url":"/tour/assets/babylon-shaders-static-Bcfsp4Q6.js"},{"url":"/tour/assets/babylon-shaders-wgsl-BFL40Gbp.js"},{"url":"/tour/assets/baseTexture.polynomial-8VtMdwtC.js"},{"url":"/tour/assets/basisTextureLoader-BAwN7-Nf.js"},{"url":"/tour/assets/browser-mqgfGi14.js"},{"url":"/tour/assets/buffer-BLHmEnmD.js"},{"url":"/tour/assets/buffer-Co66ag14.js"},{"url":"/tour/assets/client-DDzCAIBa.js"},{"url":"/tour/assets/compassCenterSphere-luiUVPOZ.js"},{"url":"/tour/assets/cubemapToSphericalPolynomial-CjGz6pKP.js"},{"url":"/tour/assets/dataBuffer-C-wqV4qF.js"},{"url":"/tour/assets/dds-CxRdaIkY.js"},{"url":"/tour/assets/ddsTextureLoader-CdOCacMJ.js"},{"url":"/tour/assets/decorators-BOtej2xA.js"},{"url":"/tour/assets/devTools-DmD3AOL3.js"},{"url":"/tour/assets/drawWrapper.functions-t22iQNzU.js"},{"url":"/tour/assets/dumpTools-CDaB05oM.js"},{"url":"/tour/assets/editor-Ct7kpRfh.css"},{"url":"/tour/assets/editor-N5P4dNmo.js"},{"url":"/tour/assets/effectRenderer-PmRWC1Ze.js"},{"url":"/tour/assets/egm2008-15-nvvz7MYe.bin"},{"url":"/tour/assets/egm2008-30-BpPXoGjA.bin"},{"url":"/tour/assets/egm2008-60-bDxgbz8U.bin"},{"url":"/tour/assets/engineStore-DYzBhiRl.js"},{"url":"/tour/assets/environmentTextureTools-sSqvTD4C.js"},{"url":"/tour/assets/envTextureLoader-BREbyZ7Y.js"},{"url":"/tour/assets/exrTextureLoader-evr_zjc7.js"},{"url":"/tour/assets/floatingOriginMatrixOverrides-DqLXf5j4.js"},{"url":"/tour/assets/flowGraphArrayIndexBlock-CmrJFnDi.js"},{"url":"/tour/assets/flowGraphAssetsContext-WtUyuDAI.js"},{"url":"/tour/assets/flowGraphAsyncExecutionBlock-DA1hpZd_.js"},{"url":"/tour/assets/flowGraphBezierCurveEasingBlock-6-IHz4Fr.js"},{"url":"/tour/assets/flowGraphBinaryOperationBlock-Dk_wovyj.js"},{"url":"/tour/assets/flowGraphBlock-CnCenJAW.js"},{"url":"/tour/assets/flowGraphBranchBlock-DspxljjT.js"},{"url":"/tour/assets/flowGraphCachedOperationBlock-Dpp_f2zg.js"},{"url":"/tour/assets/flowGraphCancelDelayBlock-Dln3fUGR.js"},{"url":"/tour/assets/flowGraphCodeExecutionBlock-B0W3_hif.js"},{"url":"/tour/assets/flowGraphConditionalDataBlock-D-WjLX7I.js"},{"url":"/tour/assets/flowGraphConsoleLogBlock-Romlr0s6.js"},{"url":"/tour/assets/flowGraphConstantBlock-BPLUKq28.js"},{"url":"/tour/assets/flowGraphContextBlock-D14Hewdu.js"},{"url":"/tour/assets/flowGraphCounterBlock-DeHmWUjJ.js"},{"url":"/tour/assets/flowGraphDataSwitchBlock-dDDgiYl3.js"},{"url":"/tour/assets/flowGraphDebounceBlock-ctLuiH5T.js"},{"url":"/tour/assets/flowGraphDoNBlock-DafLLIot.js"},{"url":"/tour/assets/flowGraphEasingBlock-DQZwW_8j.js"},{"url":"/tour/assets/flowGraphExecutionBlock-BQwplnqf.js"},{"url":"/tour/assets/flowGraphExecutionBlockWithOutSignal-CXszdyEO.js"},{"url":"/tour/assets/flowGraphFlipFlopBlock-uF8HIiT-.js"},{"url":"/tour/assets/flowGraphForLoopBlock-KZ7N9XYU.js"},{"url":"/tour/assets/flowGraphFunctionReferenceBlock-Dv_5crmk.js"},{"url":"/tour/assets/flowGraphGetAssetBlock-Df2UtRUA.js"},{"url":"/tour/assets/flowGraphGetPropertyBlock-DyMOeY9F.js"},{"url":"/tour/assets/flowGraphGetVariableBlock-BF3A4t8m.js"},{"url":"/tour/assets/flowGraphGLTFDataProvider-DB5yGkPz.js"},{"url":"/tour/assets/flowGraphIndexOfBlock-DANeRlnC.js"},{"url":"/tour/assets/flowGraphInterpolationBlock-CKA4S6Y6.js"},{"url":"/tour/assets/flowGraphJsonPointerParserBlock-CTpXmJs_.js"},{"url":"/tour/assets/flowGraphMathBlocks-Dgf7Pt1O.js"},{"url":"/tour/assets/flowGraphMathCombineExtractBlocks-xq8mO_BD.js"},{"url":"/tour/assets/flowGraphMatrixMathBlocks-BaMXgJFz.js"},{"url":"/tour/assets/flowGraphMeshPickEventBlock-3oT0yGoy.js"},{"url":"/tour/assets/flowGraphMultiGateBlock-rR1P31X2.js"},{"url":"/tour/assets/flowGraphPauseAnimationBlock-BW-5AFYH.js"},{"url":"/tour/assets/flowGraphPlayAnimationBlock-_utrRKpK.js"},{"url":"/tour/assets/flowGraphPointerOutEventBlock-D74YR-a8.js"},{"url":"/tour/assets/flowGraphPointerOverEventBlock-C9tv8zg4.js"},{"url":"/tour/assets/flowGraphReceiveCustomEventBlock-Zl8bpIp-.js"},{"url":"/tour/assets/flowGraphSceneReadyEventBlock-7P0g5lau.js"},{"url":"/tour/assets/flowGraphSceneTickEventBlock-BwcwFKD-.js"},{"url":"/tour/assets/flowGraphSendCustomEventBlock-BM8VLA74.js"},{"url":"/tour/assets/flowGraphSequenceBlock-hJTseNIe.js"},{"url":"/tour/assets/flowGraphSetDelayBlock-ClCNX--Z.js"},{"url":"/tour/assets/flowGraphSetPropertyBlock-CcmpRMjY.js"},{"url":"/tour/assets/flowGraphSetVariableBlock-DfCjhyyB.js"},{"url":"/tour/assets/flowGraphStopAnimationBlock-CUXWb-Si.js"},{"url":"/tour/assets/flowGraphSwitchBlock-CoMj7Xdh.js"},{"url":"/tour/assets/flowGraphThrottleBlock-DI7HfdSO.js"},{"url":"/tour/assets/flowGraphTransformCoordinatesSystemBlock-CL552VQg.js"},{"url":"/tour/assets/flowGraphTypeToTypeBlocks-CgWF94n7.js"},{"url":"/tour/assets/flowGraphUnaryOperationBlock-ORnYKHbS.js"},{"url":"/tour/assets/flowGraphVectorMathBlocks-Dsk3k-lF.js"},{"url":"/tour/assets/flowGraphWaitAllBlock-Df55AocL.js"},{"url":"/tour/assets/flowGraphWhileLoopBlock-BFBBiyrk.js"},{"url":"/tour/assets/GlobeOverlay-BFYBa-SE.css"},{"url":"/tour/assets/GlobeOverlay-CXIidy5M.js"},{"url":"/tour/assets/glTFLoaderAnimation-BE5fGWyf.js"},{"url":"/tour/assets/google-Ba09phrc.js"},{"url":"/tour/assets/google-xHymeLgs.wasm"},{"url":"/tour/assets/googlePreparation.worker-BJpxrlML.js"},{"url":"/tour/assets/ground-C4qXQ7WB.wasm"},{"url":"/tour/assets/groundBvh.worker-DdwVa0x5.js"},{"url":"/tour/assets/guid-BXdVC_j_.js"},{"url":"/tour/assets/hdrTextureLoader-7SJ7c3aq.js"},{"url":"/tour/assets/iesTextureLoader-ELzMbfkv.js"},{"url":"/tour/assets/imageProcessing-DVX3Kfaz.js"},{"url":"/tour/assets/index.babylonjs-BC6f9RpF.js"},{"url":"/tour/assets/index.core-plugins-CgMOOvEN.js"},{"url":"/tour/assets/instancedMesh-BQhwXBdI.js"},{"url":"/tour/assets/ktxTextureLoader-Dp5nLecU.js"},{"url":"/tour/assets/light-CL9GVEpt.js"},{"url":"/tour/assets/lightConstants-BQuoJkMN.js"},{"url":"/tour/assets/LoaderBase-ATuDWTDB-Dma9wrKU.js"},{"url":"/tour/assets/logger-CuBYPcDK.js"},{"url":"/tour/assets/math.axis-BC8rv4_x.js"},{"url":"/tour/assets/math.color-Ccaij935.js"},{"url":"/tour/assets/math.frustum-9t_qwi0P.js"},{"url":"/tour/assets/math.path-BnUPJfuR.js"},{"url":"/tour/assets/math.plane-DA2QKE_X.js"},{"url":"/tour/assets/math.scalar.functions-lnL7TJ7T.js"},{"url":"/tour/assets/math.size-D0gDANMB.js"},{"url":"/tour/assets/math.vector-cXUysvte.js"},{"url":"/tour/assets/math.viewport-1s33kfOs.js"},{"url":"/tour/assets/mesh-BWqgI7Ju.js"},{"url":"/tour/assets/mesh.vertexData.functions-CD4JOR2q.js"},{"url":"/tour/assets/miniViewerCpu-CT1BnXAs.js"},{"url":"/tour/assets/minneapolis-CV4PpPb8.js"},{"url":"/tour/assets/node-ByNcla8-.js"},{"url":"/tour/assets/observable-BmPG9gPP.js"},{"url":"/tour/assets/openpbrMaterial-DysNRGrg.js"},{"url":"/tour/assets/openpbrMaterialLoadingAdapter-Cxz-ATuu.js"},{"url":"/tour/assets/pbrMaterial-DtuGHfRM.js"},{"url":"/tour/assets/pbrMaterialLoadingAdapter-B89NXzm2.js"},{"url":"/tour/assets/pointerEvents-eWS9Fuue.js"},{"url":"/tour/assets/poseEditTab-0T241VFP.js"},{"url":"/tour/assets/precisionDate-CfCevjl-.js"},{"url":"/tour/assets/preload-helper-CHL57AmY.js"},{"url":"/tour/assets/pushMaterial-mbST6lNq.js"},{"url":"/tour/assets/raster-DlwdWSMe.wasm"},{"url":"/tour/assets/react-dom-ByqcrMAm.js"},{"url":"/tour/assets/rolldown-runtime-hePW80VL.js"},{"url":"/tour/assets/scene-5WPw9j_7.js"},{"url":"/tour/assets/scenes-BwLA5wS8.css"},{"url":"/tour/assets/scenes-CmJQTDGq.js"},{"url":"/tour/assets/selector-CtOpNvMr.css"},{"url":"/tour/assets/selector-qtJn530h.js"},{"url":"/tour/assets/sky-CRaPsUzR.wasm"},{"url":"/tour/assets/sky-shared-D-4V-MY1.wasm"},{"url":"/tour/assets/skyEvaluation.worker-B8xqtRsA.js"},{"url":"/tour/assets/skySharedHelper.worker-Co1E3es0.js"},{"url":"/tour/assets/spatialWebAudio-DmiRWwlf.js"},{"url":"/tour/assets/spatialWebAudioUpdaterComponent-DwwURXSX.js"},{"url":"/tour/assets/src-Citv8AKM.js"},{"url":"/tour/assets/starCatalogue-DSWPyUwb.js"},{"url":"/tour/assets/stPaul-C4MnaVBf.js"},{"url":"/tour/assets/terrain-Dz5EuTp6.wasm"},{"url":"/tour/assets/terrainDecode.worker-DmA-KHNO.js"},{"url":"/tour/assets/terrainHeights.worker-COk4vcNq.js"},{"url":"/tour/assets/terrainMesh.worker-Cp-xny9A.js"},{"url":"/tour/assets/texture-BFawUibc.js"},{"url":"/tour/assets/textureTools-CSPw6W8Z.js"},{"url":"/tour/assets/tgaTextureLoader-CqhhocF6.js"},{"url":"/tour/assets/thinEngine-DYkgvbIo.js"},{"url":"/tour/assets/thumbnailBackend-D11Kr6op.js"},{"url":"/tour/assets/thumbnailOcclusion-Dq7SNB76.js"},{"url":"/tour/assets/thumbnailWebGl-D6T6HCF8.js"},{"url":"/tour/assets/thumbnailWebGpu-CoJZL_ip.js"},{"url":"/tour/assets/tools-Dn6DBqCZ.js"},{"url":"/tour/assets/tools.functions-Bf64XVYQ.js"},{"url":"/tour/assets/twinCities-DONh7AR6.js"},{"url":"/tour/assets/typeStore-Cu_sj2zM.js"},{"url":"/tour/assets/ui-Csjh0qbH.js"},{"url":"/tour/assets/viewer-DZZqxoxK.js"},{"url":"/tour/assets/webAudioBaseSubGraph-2eYQOAG9.js"},{"url":"/tour/assets/webAudioBus-Dui7VtRj.js"},{"url":"/tour/assets/webAudioMainBus-DWbBAVhd.js"},{"url":"/tour/assets/webAudioSoundSource-DZD4A5NC.js"},{"url":"/tour/assets/webAudioStaticSound-B7fh76J9.js"},{"url":"/tour/assets/webAudioStreamingSound-DYgvPJFz.js"},{"url":"/tour/assets/webRequest-dqz0dHXK.js"},{"url":"/tour/assets/workerPool-Dva09jEo.js"}],"retainedFiles":[]});
