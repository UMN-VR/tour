import { mountGlobeApp } from "foss-earth";
import { wantsDev } from "@foss-earth/dev";
import { createCampusDevRelay } from "./dev-host";
import { TWIN_CITIES } from "./scenes";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Expected to find a root element with id "root".');
}

// Report-only handling belongs to the shared mount and never activates Campus Dev.
const search = window.location.search;
const dev = !new URLSearchParams(search).has("report") && wantsDev(search)
  ? createCampusDevRelay({ configuredManifestUrl: TWIN_CITIES.url }) : null;

// FOSS Earth's split globe, offering this tour's scene and opening it.
mountGlobeApp(rootElement, {
  scenes: [TWIN_CITIES], initialScene: TWIN_CITIES.id,
  issueReporter: { repository: "UMN-VR/tour", appName: "University of Minnesota campus tour" },
  devContributions: dev ? [dev.contribution] : undefined,
}).then(app => {
  if (!dev) return;
  dev.attach(app.scenes);
  const destroy = app.destroy.bind(app);
  app.destroy = () => {
    try { dev.dispose(); }
    finally { destroy(); }
  };
}).catch((error: unknown) => {
  dev?.dispose();
  console.error("The tour could not start.", error);
  rootElement.innerHTML = '<div class="boot-error">The tour could not start.</div>';
});
