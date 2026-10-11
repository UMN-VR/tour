# Work prompt: set north and correct the position of every panorama

Execute this task when the user starts a fresh conversation with this file.
Work in `~/gh/UMN-VR/app`. Read the current `AGENTS.md`,
[tools/twin-cities/README.md](../tools/twin-cities/README.md) and
[roadmap.md](roadmap.md) first. Do
`../foss-earth/docs/panorama-mode-prompt.md` first if it isn't done.

The tour's 60 photographs are on the map, but only roughly, and none faces the right way. This
task makes every entry in [`tools/twin-cities/placements.json`](../tools/twin-cities/placements.json)
right:

- where the photograph was taken;
- which way its centre faces (`pose.headingDeg`);
- for the five marked "Not placed", which building it is in.

The data lives only in `placements.json`. `npm run build:scene` turns it into the scene, and
recomputes every link and start view from the headings.

## Where things stand

The README's sections "Positions: approximate" and "North: not set" give the detail.

- **Positions** are YouVisit's one hand-placed point per stop, or OpenStreetMap building centres.
  Each entry's `horizontalAccuracyMeters` and `source` say which.
- **Stop points can be well off.** Northrop Mall's is about 80 m east of where the photograph
  appears to have been taken.
- **Headings** are all 0 with `aligned: false`. The images carry no orientation, since YouVisit
  dropped any the camera recorded, and no panorama has GPS (`image-metadata.json`).
- **The five not placed** are Classroom Studio Spaces, Plant Diagnostics Lab, ISSS, the
  Undergraduate Teaching Labs and the Wall of Discovery. They are somewhere in or near their
  stop.

## How to do it

**Outdoors, solve the position and heading together.** One landmark gives a heading only if
the position is right, and the positions aren't.

1. Pick two or three landmarks with known positions that show in the photograph. Building
   corners, towers and domes from OpenStreetMap work.
2. Measure each landmark's image azimuth.
3. Resect the capture point and the heading from those azimuths.

**Indoors, align to the building.** Match the room's walls to the building's outline on
OpenStreetMap, and a door or window to the plan where one is known.

**Check the result against Google's 3D tiles.** FOSS Earth can show the photorealistic tiles
from the capture point, and the photograph should line up with them.

**Placing the five:**

- Geolocate each from what the image shows first: signs, room numbers, the view out of a
  window, and the U's building and room listings.
- The backup's 149 photos may show the same rooms. Five of them, drone shots, carry GPS.
- Ask the students and staff who shot them only as a last resort.

**For each entry:**

- Write the position and `horizontalAccuracyMeters`, and a `source` that says how it was found.
- Write `headingDeg`, set `aligned: true`, and say how it was set in `provenance`.
- If pitch or roll is off, set them in the same way.

**Record the method.** Once it works, write it in the README's "North" section, replacing "not
set".

## Scratch that may help

These are on this laptop only, in the gitignored `.local/tour-build/`. They were written against
the scene's old location, `tour/twin-cities/`; it is now `public/tour/twin-cities/`. Read them
before trusting them.

| Scratch | What it is |
| --- | --- |
| `render-link.mjs` | Renders what FOSS Earth shows in a given direction from a prepared image. Checks a heading against a landmark without a browser. |
| `sheet.mjs` | A contact sheet of several panoramas |
| `osm/osm-center-2026-09-27.json` | Building centres from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), with the Overpass query beside it |
| `seed-placements.mjs` | How `placements.json` was first made |

If one of these becomes part of the method, move it into `tools/twin-cities/` with a test,
rather than leaving the method in scratch.

## Checks and report

- **Checks:** run `npm run build:scene`, then `npm run ci`. The scene's test checks the result.
- **Servers:** don't start one. Tell the user to check with `npm run dev`: outside, an orb shows
  the side of the photograph that faces the viewer; inside, the view lines up with the map.
- **Commit:** commit to `main`, and don't push; the user deploys.
- **Report:** list any panorama you couldn't place or align, with the reason.
