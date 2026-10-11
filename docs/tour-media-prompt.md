# Work prompt: put the rest of the old tour on the map

Execute this task when the user starts a fresh conversation with this file.
Work in `~/gh/UMN-VR/app` and `~/gh/foss-earth`. First read:

- the current `AGENTS.md` of both;
- [roadmap.md](roadmap.md);
- [tools/twin-cities/README.md](../tools/twin-cities/README.md);
- the backup's `.local/youvisit-backup/README.md`;
- FOSS Earth's `docs/scenes/format.md`.

The user's goal for the tour is "put everything that can be put into a map into a virtual tour".
The 360° photographs are in. This task covers the rest of what YouVisit's tour showed. It is
large, so agree the order with the user before building, and deliver it in parts.

## What is left in the backup

All of it is in `.local/youvisit-backup/snapshot-2026-09-27/`.

| What | Where | Notes |
| --- | --- | --- |
| 149 photos, as uploaded | `media/photos/<id>/original.*` | 127 JPEG and 22 PNG, with EXIF. Five drone shots carry GPS. |
| Narration | `media/audio/<id>/<Language>.mp3`, text in `api/` | 105 files. English has 22 live stops and 17 retired; Hmong, Somali and Spanish have 22 each. The Welcome stop has only Spanish text, and its audio is missing. |
| 3 videos YouVisit hosted | `media/videos/<id>/` | 1920 px, with `captions.vtt` |
| 45 YouTube videos | `youtube.json` | On the U's channels, plus one WCCO story. Link to them rather than copying. Ignore the 12 stale `videoid` fields the README describes. |
| Hotspot text, labels, action buttons | `api/v1.2-stops.json`, `api/v2-stops-labels.json`, `api/v2-actionbuttons.json` | |
| The tour's route | `api/v2-tour-points.json` | 23 points, one per stop in trail order, not a surveyed path. A route line on the map at most. |

## Where the work goes

- **FOSS Earth owns the format and the viewer.** Format v1 has one asset type,
  `panorama-image`, and one entity type, `panorama`. Photos, video, audio, text and a route on
  the map are things any globe app would want, so the new record types, their loading and how
  they are shown go there. Follow its format rules: versioning, validation,
  `checkSceneFiles`, and preparing images with its tools.
- **This repository owns the content and its conversion from YouVisit:** the build in
  `tools/twin-cities/`, and any hand-edited data beside `placements.json`.
- **Photo positions:** YouVisit gives each photo its stop, not a position. Say how each is
  placed, as `placements.json` does for the panoramas.

## Checks and report

- **Checks:** after each edit, `npx tsc -b`, `npx vitest related --run <changed files>` and
  `npm run lint`. At the end of each part, run `npm run ci` once in each repository.
- **0SFS** reads FOSS Earth's scene code through its barrels. If you change FOSS Earth's
  exports, run `npx tsc -b` there too.
- **Media size:** GitHub Pages publishes the whole site on each deploy, so report the size the
  media adds.
- **Servers:** don't start one. Tell the user what to try with `npm run dev`.
- **Commits:** commit FOSS Earth to `main` and push. Commit the tour to `main` and don't push;
  the user deploys.
