import type { SceneExample } from "foss-earth/scenes";

/**
 * The campus tours. Each scene is published at tour/<campus>/scene.json, from
 * that campus's repository beside this one (vite.config.ts); the URL resolves
 * against the site's base URL. A build can point the Twin Cities tour at an
 * independently published content release instead.
 */
export const TWIN_CITIES: SceneExample = {
  id: "twin-cities",
  title: "Twin Cities campus",
  description: "The University of Minnesota Twin Cities campus tour: 60 panoramas in 23 stops, from Northrop Mall to the Saint Paul campus.",
  url: import.meta.env.VITE_TOUR_SCENE_URL?.trim() || "tour/twin-cities/scene.json",
};

export const MINNEAPOLIS: SceneExample = {
  id: "minneapolis",
  title: "Minneapolis campus",
  description: "The University of Minnesota's Minneapolis campus: 48 panoramas, from Northrop Mall to the West Bank and the Mississippi.",
  url: "tour/minneapolis/scene.json",
};

export const ST_PAUL: SceneExample = {
  id: "st-paul",
  title: "Saint Paul campus",
  description: "The University of Minnesota's Saint Paul campus: 12 panoramas of its gardens, labs and gathering places.",
  url: "tour/st-paul/scene.json",
};
