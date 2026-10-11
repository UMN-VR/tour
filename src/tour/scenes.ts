import type { SceneExample } from "@foss-earth/scenes/browser";

/**
 * The Twin Cities campus tour. tools/twin-cities/build-scene.mjs writes it into
 * public/. A build can point at an independently published content release;
 * otherwise the URL resolves against the site's base URL.
 */
export const TWIN_CITIES: SceneExample = {
  id: "twin-cities",
  title: "Twin Cities campus",
  description: "The University of Minnesota Twin Cities campus tour: 60 panoramas in 23 stops, from Northrop Mall to the Saint Paul campus.",
  url: import.meta.env.VITE_TOUR_SCENE_URL?.trim() || "tour/twin-cities/scene.json",
};
