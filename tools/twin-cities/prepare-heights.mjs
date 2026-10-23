#!/usr/bin/env node
/**
 * Prepares every photograph's fixed capture height once, at build time, into placements.json.
 * Scene builds and the viewer then use that height as it is; nothing samples the map at runtime.
 *
 * Google Photorealistic 3D Tiles are the source (FOSS Earth's foss-earth-prepare-heights); USGS
 * 3DEP is a fallback only for a point Google can't serve, and the reason is recorded. A height set
 * by hand or in the placement editor is never replaced.
 *
 *   npm run prepare:heights                     heights for photographs that have none, or moved
 *   npm run prepare:heights -- --retry-fallbacks   also try Google again where USGS was used
 *   npm run prepare:heights -- --refresh        prepare every build-prepared height again
 *   npm run check:heights                       offline: placements and the three scenes agree
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GOOGLE_PROVIDER, USGS_PROVIDER, prepareHeightSamples, readGoogleKey } from '@foss-earth/engine/prepare-heights';

const here = path.dirname(fileURLToPath(import.meta.url));
const tourRoot = path.resolve(here, '..', '..');
/** Agreed key locations: GOOGLE_3D_TILES_KEY, with legacy FOSS_EARTH_GOOGLE_KEY fallback. */
export const KEY_FILES = [
  path.join(tourRoot, '.env.local'),
  path.join(homedir(), 'gh', 'foss-earth', 'app', '.env.local'),
  path.join(homedir(), 'gh', '0sfs', 'fly', '.env.local'),
];
export const SCENES = ['twin-cities', 'minneapolis', 'st-paul'];
const BUILT = new Set([GOOGLE_PROVIDER, USGS_PROVIDER]);
/** "editor": set in the FOSS Earth placement editor and imported; "manual": typed into placements.json. */
const AUTHORED = new Set(['editor', 'manual']);
const HEIGHT_KEYS = new Set(['meters', 'datum', 'source', 'uncertaintyMeters']);
const sameCoordinate = (a, b) => Math.abs(a.longitudeDeg - b.longitudeDeg) <= 1e-9 && Math.abs(a.latitudeDeg - b.latitudeDeg) <= 1e-9;

/** Why a placement's fixed height can't be published, or an empty list. */
export function heightProblems(row) {
  const height = row.capture?.height, preparation = row.capture?.heightPreparation;
  if (!height) return ['no fixed capture height'];
  const problems = [];
  const extra = Object.keys(height).filter(key => !HEIGHT_KEYS.has(key));
  if (extra.length) problems.push(`height has fields the scene format refuses: ${extra.join(', ')}`);
  if (height.datum !== 'WGS84-ellipsoid' || !Number.isFinite(height.meters)) problems.push('height is not metres above the WGS84 ellipsoid');
  else if (height.meters < -500 || height.meters > 9000) problems.push(`height ${height.meters} m is implausible`);
  if (typeof height.source !== 'string' || !height.source.trim()) problems.push('height has no source');
  if (!Number.isFinite(height.uncertaintyMeters) || height.uncertaintyMeters < 0) problems.push('height has no uncertainty');
  if (!preparation || !(BUILT.has(preparation.provider) || AUTHORED.has(preparation.provider))) problems.push('height has no recorded preparation');
  else if (BUILT.has(preparation.provider) && !sameCoordinate(preparation, row.capture)) problems.push('height was prepared for another coordinate; run npm run prepare:heights');
  if (row.marker?.mode === 'ground-relative') problems.push('marker is ground-relative, which samples the map at runtime');
  return problems;
}

/** Throws with every problem; otherwise counts heights by provider and lists fallbacks. */
export function checkPlacementHeights(document) {
  const rows = Object.values(document.panoramas ?? {});
  if (!rows.length) throw new Error('No photograph placements.');
  const problems = rows.flatMap(row => heightProblems(row).map(problem => `${row.id}: ${problem}`));
  if (problems.length) throw new Error(`${problems.length} placement height problem(s). Run npm run prepare:heights.\n${problems.join('\n')}`);
  const byProvider = {};
  for (const row of rows) byProvider[row.capture.heightPreparation.provider] = (byProvider[row.capture.heightPreparation.provider] ?? 0) + 1;
  const fallbacks = rows.filter(row => row.capture.heightPreparation.provider === USGS_PROVIDER).map(row => ({ id: row.id, reason: row.capture.heightPreparation.fallbackReason }));
  return { total: rows.length, byProvider, fallbacks };
}

/** Problems with a generated scene: every panorama must carry its placement's fixed height. */
export function sceneHeightProblems(scene, placementsDocument) {
  const byId = new Map(Object.values(placementsDocument.panoramas).map(row => [row.id, row]));
  const problems = [];
  const panoramas = (scene.entities ?? []).filter(entity => entity.type === 'panorama');
  if (!panoramas.length) problems.push('has no panoramas');
  for (const entity of panoramas) {
    const row = byId.get(entity.id);
    if (!row) { problems.push(`${entity.id}: not in placements.json`); continue; }
    if (entity.marker?.mode !== 'capture-relative') problems.push(`${entity.id}: marker is ${entity.marker?.mode ?? 'missing'}, not capture-relative`);
    if (!sameCoordinate(entity.capture ?? {}, row.capture)) problems.push(`${entity.id}: capture differs from placements.json`);
    if (JSON.stringify(entity.capture?.height ?? null) !== JSON.stringify(row.capture.height ?? null)) problems.push(`${entity.id}: capture height differs from placements.json`);
  }
  return problems;
}

/** Placements with heights prepared where they are missing, moved, or asked for again. */
export async function preparePlacements(document, options = {}) {
  const next = structuredClone(document);
  const rows = Object.values(next.panoramas ?? {});
  if (!rows.length) throw new Error('No photograph placements.');
  const ids = rows.map(row => row.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('Missing or duplicate photograph ids.');
  const pending = rows.filter(row => {
    const preparation = row.capture.heightPreparation;
    if (row.capture.height == null) return true;
    if (!preparation) return false; // A height someone typed in stays theirs.
    if (AUTHORED.has(preparation.provider)) return false;
    if (!sameCoordinate(preparation, row.capture)) return true;
    return Boolean(options.refresh || (options.retryFallbacks && preparation.provider === USGS_PROVIDER));
  });
  if (!pending.length) return { document: next, prepared: [] };
  const samples = await (options.prepare ?? prepareHeightSamples)(pending.map(row => ({ id: row.id,
    longitudeDeg: row.capture.longitudeDeg, latitudeDeg: row.capture.latitudeDeg })), options);
  const byId = new Map(samples.points.map(point => [point.id, point]));
  for (const row of pending) {
    const sample = byId.get(row.id);
    if (!sample || !sameCoordinate(sample, row.capture) || !sameCoordinate(sample.preparation ?? {}, row.capture)) throw new Error(`${row.id}: height result is missing or belongs to another coordinate. Nothing was written.`);
    row.capture.height = sample.height;
    row.capture.heightPreparation = sample.preparation;
  }
  return { document: next, prepared: pending.map(row => row.id) };
}

function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }

function summary(result) {
  const providers = Object.entries(result.byProvider).map(([provider, count]) => `${count} ${provider}`).join(', ');
  const fallbacks = result.fallbacks.map(row => `\n  fallback ${row.id}: ${row.reason}`).join('');
  return `${result.total} photographs have fixed heights (${providers}).${fallbacks}`;
}

export async function run(options = {}) {
  const file = path.resolve(options.placements ?? path.join(here, 'placements.json'));
  const output = path.resolve(options.output ?? file);
  const original = readFileSync(file, 'utf8');
  const document = JSON.parse(original);
  if (options.check) {
    const result = checkPlacementHeights(document);
    const scenesRoot = path.resolve(options.scenes ?? path.join(tourRoot, '..'));
    const problems = SCENES.flatMap(name => sceneHeightProblems(readJson(path.join(scenesRoot, name, 'scene.json')), document).map(problem => `${name}/scene.json ${problem}`));
    if (problems.length) throw new Error(`${problems.length} scene height problem(s). Run npm run build:scene -- --poses-only and npm run campus-scenes.\n${problems.slice(0, 20).join('\n')}${problems.length > 20 ? `\n…and ${problems.length - 20} more` : ''}`);
    return `${summary(result)}\nThe ${SCENES.join(', ')} scenes carry them.`;
  }
  const { key, origin } = options.prepare ? { key: null, origin: null } : readGoogleKey({ files: KEY_FILES });
  if (!options.prepare) console.log(key ? `Google key from ${origin === 'environment' ? 'the environment' : origin}.` : 'No Google key found; every height would be a recorded fallback.');
  const result = await preparePlacements(document, {
    prepare: options.prepare, googleKey: key, cacheDir: path.resolve(options.cache ?? path.join(tourRoot, 'build', 'elevation-cache')),
    refresh: options.refresh, retryFallbacks: options['retry-fallbacks'], fallback: !options['no-fallback'],
    maxGeometricErrorMeters: options['max-geometric-error'] === undefined ? undefined : Number(options['max-geometric-error']),
    onProgress: (id, n, total, provider) => console.log(`${n}/${total}: ${id} (${provider})`),
  });
  const checked = checkPlacementHeights(result.document);
  const text = `${JSON.stringify(result.document, null, 2)}\n`;
  if (output === file && text === original) return `Unchanged ${file}; no network requests.\n${summary(checked)}`;
  if (readFileSync(file, 'utf8') !== original) throw new Error('Placements changed during height preparation; nothing written.');
  const temporary = `${output}.${process.pid}.tmp`;
  writeFileSync(temporary, text);
  try { renameSync(temporary, output); } catch (error) { rmSync(temporary, { force: true }); throw error; }
  return `Prepared ${result.prepared.length} height(s) in ${output}.\n${summary(checked)}\nNext: npm run build:scene -- --poses-only && npm run campus-scenes`;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i].slice(2);
    if (['check', 'refresh', 'retry-fallbacks', 'no-fallback'].includes(name)) options[name] = true;
    else if (['placements', 'output', 'cache', 'scenes', 'max-geometric-error'].includes(name) && args[i + 1]) options[name] = args[++i];
    else { console.error(`Unknown or incomplete option: ${args[i]}`); process.exit(1); }
  }
  run(options).then(console.log, error => { console.error(error.message); process.exitCode = 1; });
}
