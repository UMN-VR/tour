/** Authored additions to the original tour graph. Directions follow fixed captures. */
export function applyPlacementLinks(scene, panoramas) {
  const byId = new Map(Object.values(panoramas).map(p => [p.id, p]));
  const entities = new Map(scene.entities.filter(e => e.type === "panorama").map(e => [e.id, e]));
  for (const entity of entities.values()) {
    const links = (entity.links ?? []).filter(l => !l.id.startsWith("image-link-"));
    for (const target of byId.get(entity.id)?.links ?? []) {
      if (target === entity.id || !entities.has(target)) throw new Error(`${entity.id}: image link target ${target} is not another photograph in this scene.`);
      if (links.some(l => !l.externalDestination && l.target === target)) continue;
      const from = byId.get(entity.id).capture, to = byId.get(target).capture;
      const r = Math.PI / 180, a = from.latitudeDeg * r, b = to.latitudeDeg * r, d = (to.longitudeDeg - from.longitudeDeg) * r;
      const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(d / 2) ** 2;
      const distance = 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
      const headingDeg = (Math.atan2(Math.sin(d) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d)) / r + 360) % 360;
      const pitchDeg = from.height && to.height ? Math.atan2(to.height.meters - from.height.meters, Math.max(distance, .01)) / r : 0;
      links.push({ id: `image-link-${target}`, target, label: byId.get(target).title,
        ...(distance > .1 ? { direction: { headingDeg, pitchDeg } } : {}) });
    }
    if (links.length || entity.links) entity.links = links;
  }
  return scene;
}
