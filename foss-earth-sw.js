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

install(self, {"schemaVersion":1,"base":"/tour/","scope":"/tour/","workerFile":"foss-earth-sw.js","cacheNamespace":"foss-earth-app-files","identity":null,"retention":"current-only","files":[{"url":"/tour/assets/abstractAudioBus-CIfPVnAK.js"},{"url":"/tour/assets/abstractAudioNode-C2TJZxQY.js"},{"url":"/tour/assets/abstractEngine.cubeTexture-BQt85jJz.js"},{"url":"/tour/assets/abstractSoundInstance-D-nFsAP0.js"},{"url":"/tour/assets/abstractSoundSource-BjQUHXmI.js"},{"url":"/tour/assets/animationGroup-DMVrCuCC.js"},{"url":"/tour/assets/atlasImagery.worker-CuTMHTbH.js"},{"url":"/tour/assets/babylon-shaders-glsl-Cweqhstk.js"},{"url":"/tour/assets/babylon-shaders-wgsl-CVCN1C1D.js"},{"url":"/tour/assets/baseTexture.polynomial-DqbxldCs.js"},{"url":"/tour/assets/basisTextureLoader-_nDWytqQ.js"},{"url":"/tour/assets/brdfTextureTools-DIrooFlF.js"},{"url":"/tour/assets/browser-DiH7X-bT.js"},{"url":"/tour/assets/buffer-CH4obMCq.js"},{"url":"/tour/assets/buffer-DmS39hMx.js"},{"url":"/tour/assets/compassCenterSphere-CGwS3EvS.js"},{"url":"/tour/assets/cubemapToSphericalPolynomial-BHGz3E6Y.js"},{"url":"/tour/assets/dataBuffer-C-wqV4qF.js"},{"url":"/tour/assets/dds-Ewt-KrJV.js"},{"url":"/tour/assets/ddsTextureLoader-B9EA3vX1.js"},{"url":"/tour/assets/decorators-BOtej2xA.js"},{"url":"/tour/assets/devTools-DmD3AOL3.js"},{"url":"/tour/assets/drawWrapper.functions-t22iQNzU.js"},{"url":"/tour/assets/dumpTools-LyWGuJqq.js"},{"url":"/tour/assets/editor-B2OAiBy4.js"},{"url":"/tour/assets/editor-CG_htNz5.css"},{"url":"/tour/assets/effectRenderer-DDLsh6B6.js"},{"url":"/tour/assets/egm2008-15-nvvz7MYe.bin"},{"url":"/tour/assets/egm2008-30-BpPXoGjA.bin"},{"url":"/tour/assets/egm2008-60-bDxgbz8U.bin"},{"url":"/tour/assets/engineStore-DYzBhiRl.js"},{"url":"/tour/assets/environmentTextureTools-CbBLoLaM.js"},{"url":"/tour/assets/envTextureLoader-BQL38Jvm.js"},{"url":"/tour/assets/exrTextureLoader-CYJwACJy.js"},{"url":"/tour/assets/floatingOriginMatrixOverrides-DdZK7iV0.js"},{"url":"/tour/assets/flowGraphArrayIndexBlock-DgGdmIFl.js"},{"url":"/tour/assets/flowGraphAssetsContext-WtUyuDAI.js"},{"url":"/tour/assets/flowGraphAsyncExecutionBlock-DA1hpZd_.js"},{"url":"/tour/assets/flowGraphBezierCurveEasingBlock-D89ktq8g.js"},{"url":"/tour/assets/flowGraphBinaryOperationBlock-Dk_wovyj.js"},{"url":"/tour/assets/flowGraphBlock-CnCenJAW.js"},{"url":"/tour/assets/flowGraphBranchBlock-DspxljjT.js"},{"url":"/tour/assets/flowGraphCachedOperationBlock-Dpp_f2zg.js"},{"url":"/tour/assets/flowGraphCancelDelayBlock-BtcP3Eeq.js"},{"url":"/tour/assets/flowGraphCodeExecutionBlock-B0W3_hif.js"},{"url":"/tour/assets/flowGraphConditionalDataBlock-D-WjLX7I.js"},{"url":"/tour/assets/flowGraphConsoleLogBlock-Romlr0s6.js"},{"url":"/tour/assets/flowGraphConstantBlock-BPLUKq28.js"},{"url":"/tour/assets/flowGraphContextBlock-D14Hewdu.js"},{"url":"/tour/assets/flowGraphCounterBlock-DeHmWUjJ.js"},{"url":"/tour/assets/flowGraphDataSwitchBlock-DPUZWKCb.js"},{"url":"/tour/assets/flowGraphDebounceBlock-ctLuiH5T.js"},{"url":"/tour/assets/flowGraphDoNBlock-DafLLIot.js"},{"url":"/tour/assets/flowGraphEasingBlock-B6LSGfJf.js"},{"url":"/tour/assets/flowGraphExecutionBlock-BQwplnqf.js"},{"url":"/tour/assets/flowGraphExecutionBlockWithOutSignal-CXszdyEO.js"},{"url":"/tour/assets/flowGraphFlipFlopBlock-uF8HIiT-.js"},{"url":"/tour/assets/flowGraphForLoopBlock-CL1Sm9mZ.js"},{"url":"/tour/assets/flowGraphFunctionReferenceBlock-Dv_5crmk.js"},{"url":"/tour/assets/flowGraphGetAssetBlock-aEx-Mf9p.js"},{"url":"/tour/assets/flowGraphGetPropertyBlock-DyMOeY9F.js"},{"url":"/tour/assets/flowGraphGetVariableBlock-BF3A4t8m.js"},{"url":"/tour/assets/flowGraphGLTFDataProvider-DiRyZJYK.js"},{"url":"/tour/assets/flowGraphIndexOfBlock-DANeRlnC.js"},{"url":"/tour/assets/flowGraphInterpolationBlock-BX48eraF.js"},{"url":"/tour/assets/flowGraphJsonPointerParserBlock-CTpXmJs_.js"},{"url":"/tour/assets/flowGraphMathBlocks-DeOPZwF3.js"},{"url":"/tour/assets/flowGraphMathCombineExtractBlocks-xq8mO_BD.js"},{"url":"/tour/assets/flowGraphMatrixMathBlocks-BaMXgJFz.js"},{"url":"/tour/assets/flowGraphMeshPickEventBlock-B9kIiJJU.js"},{"url":"/tour/assets/flowGraphMultiGateBlock-rR1P31X2.js"},{"url":"/tour/assets/flowGraphPauseAnimationBlock-BW-5AFYH.js"},{"url":"/tour/assets/flowGraphPlayAnimationBlock-D_i8vbfP.js"},{"url":"/tour/assets/flowGraphPointerOutEventBlock-Qp-T82kD.js"},{"url":"/tour/assets/flowGraphPointerOverEventBlock-d_Os5QJL.js"},{"url":"/tour/assets/flowGraphReceiveCustomEventBlock-BHSCXJqw.js"},{"url":"/tour/assets/flowGraphSceneReadyEventBlock-C2q3njuw.js"},{"url":"/tour/assets/flowGraphSceneTickEventBlock-F6xtaRt1.js"},{"url":"/tour/assets/flowGraphSendCustomEventBlock-BM8VLA74.js"},{"url":"/tour/assets/flowGraphSequenceBlock-hJTseNIe.js"},{"url":"/tour/assets/flowGraphSetDelayBlock-ClCNX--Z.js"},{"url":"/tour/assets/flowGraphSetPropertyBlock-CcmpRMjY.js"},{"url":"/tour/assets/flowGraphSetVariableBlock-DfCjhyyB.js"},{"url":"/tour/assets/flowGraphStopAnimationBlock-CUXWb-Si.js"},{"url":"/tour/assets/flowGraphSwitchBlock-DC7TyCX8.js"},{"url":"/tour/assets/flowGraphThrottleBlock-DI7HfdSO.js"},{"url":"/tour/assets/flowGraphTransformCoordinatesSystemBlock-CL552VQg.js"},{"url":"/tour/assets/flowGraphTypeToTypeBlocks-CgWF94n7.js"},{"url":"/tour/assets/flowGraphUnaryOperationBlock-ORnYKHbS.js"},{"url":"/tour/assets/flowGraphVectorMathBlocks-DThyy90u.js"},{"url":"/tour/assets/flowGraphWaitAllBlock-Df55AocL.js"},{"url":"/tour/assets/flowGraphWhileLoopBlock-BFBBiyrk.js"},{"url":"/tour/assets/glTFLoaderAnimation-BS3ZU6gH.js"},{"url":"/tour/assets/guid-BXdVC_j_.js"},{"url":"/tour/assets/hdrTextureLoader-7SJ7c3aq.js"},{"url":"/tour/assets/iesTextureLoader-ELzMbfkv.js"},{"url":"/tour/assets/imageProcessing-DVX3Kfaz.js"},{"url":"/tour/assets/index.babylonjs-CvircEqS.js"},{"url":"/tour/assets/index.core-plugins-CgMOOvEN.js"},{"url":"/tour/assets/ktxTextureLoader-StD6o4MK.js"},{"url":"/tour/assets/light-D4i-QJpK.js"},{"url":"/tour/assets/lightConstants-DFsOT4qL.js"},{"url":"/tour/assets/LoaderBase-ATuDWTDB-Dma9wrKU.js"},{"url":"/tour/assets/logger-CuBYPcDK.js"},{"url":"/tour/assets/material.detailMapConfiguration-CP7OqAhz.js"},{"url":"/tour/assets/math.axis-BC8rv4_x.js"},{"url":"/tour/assets/math.color-Ccaij935.js"},{"url":"/tour/assets/math.frustum-B3DDXFUX.js"},{"url":"/tour/assets/math.path-BnUPJfuR.js"},{"url":"/tour/assets/math.plane-DA2QKE_X.js"},{"url":"/tour/assets/math.scalar.functions-lnL7TJ7T.js"},{"url":"/tour/assets/math.size-D0gDANMB.js"},{"url":"/tour/assets/math.vector-cXUysvte.js"},{"url":"/tour/assets/math.viewport-BkRmqKvV.js"},{"url":"/tour/assets/mesh-BVsbuZVW.js"},{"url":"/tour/assets/mesh.vertexData.functions-CD4JOR2q.js"},{"url":"/tour/assets/miniViewerCpu-Dact7Rrv.js"},{"url":"/tour/assets/minneapolis-Ds76XLPU.js"},{"url":"/tour/assets/node-ByNcla8-.js"},{"url":"/tour/assets/observable-BmPG9gPP.js"},{"url":"/tour/assets/openpbrMaterial-CkpNLhf7.js"},{"url":"/tour/assets/openpbrMaterialLoadingAdapter-asvBoABr.js"},{"url":"/tour/assets/pbrMaterialLoadingAdapter-DokkRQ1G.js"},{"url":"/tour/assets/pointerEvents-eWS9Fuue.js"},{"url":"/tour/assets/precisionDate-CfCevjl-.js"},{"url":"/tour/assets/preload-helper-CHL57AmY.js"},{"url":"/tour/assets/pushMaterial-CtCZkxsq.js"},{"url":"/tour/assets/raster-DlwdWSMe.wasm"},{"url":"/tour/assets/rgbdTextureTools-CvmVhaZx.js"},{"url":"/tour/assets/rolldown-runtime-BpQH8Ho1.js"},{"url":"/tour/assets/scene-DCWWGocu.js"},{"url":"/tour/assets/scenes-0_cSSkg2.css"},{"url":"/tour/assets/scenes-DtfdZGjA.js"},{"url":"/tour/assets/selector-B4Tjj5-1.js"},{"url":"/tour/assets/selector-CR8J5Pwq.css"},{"url":"/tour/assets/spatialWebAudio-DmiRWwlf.js"},{"url":"/tour/assets/spatialWebAudioUpdaterComponent-DwwURXSX.js"},{"url":"/tour/assets/src-Citv8AKM.js"},{"url":"/tour/assets/starCatalogue-DSWPyUwb.js"},{"url":"/tour/assets/stPaul-Zp38yL9v.js"},{"url":"/tour/assets/terrainDecode.worker-BYnBbbaJ.js"},{"url":"/tour/assets/texture-d_Uh768z.js"},{"url":"/tour/assets/textureTools-kZCr9Lor.js"},{"url":"/tour/assets/tgaTextureLoader-CqhhocF6.js"},{"url":"/tour/assets/thinEngine-BM3bBNRA.js"},{"url":"/tour/assets/thumbnailBackend-BFtw-b74.js"},{"url":"/tour/assets/thumbnailOcclusion-Dq7SNB76.js"},{"url":"/tour/assets/thumbnailWebGl-D6T6HCF8.js"},{"url":"/tour/assets/thumbnailWebGpu-B8JwYCd2.js"},{"url":"/tour/assets/tools-9OSft_ip.js"},{"url":"/tour/assets/tools.functions-CTPw8K4e.js"},{"url":"/tour/assets/twinCities-6Uove3h_.js"},{"url":"/tour/assets/typeStore-Cu_sj2zM.js"},{"url":"/tour/assets/viewer-DjLHFc0A.js"},{"url":"/tour/assets/webAudioBaseSubGraph-2eYQOAG9.js"},{"url":"/tour/assets/webAudioBus-Dui7VtRj.js"},{"url":"/tour/assets/webAudioMainBus-DWbBAVhd.js"},{"url":"/tour/assets/webAudioSoundSource-B9b2CwKj.js"},{"url":"/tour/assets/webAudioStaticSound-CUq7vTfI.js"},{"url":"/tour/assets/webAudioStreamingSound-BaOYSZlf.js"},{"url":"/tour/assets/webRequest-dqz0dHXK.js"},{"url":"/tour/assets/workerPool-Dva09jEo.js"}],"retainedFiles":[]});
