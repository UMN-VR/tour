#!/usr/bin/env node
/** Normal onboarding reads prepared content; no backup/encoder/importer is used. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkSceneManifest } from '@foss-earth/scenes/node';
import { tourManifestFile } from './content-root.mjs';
import { inventoryContent } from '../release/content-inventory.mjs';

const [output] = process.argv.slice(2);
if (!output || process.argv.length !== 3) throw new Error('Usage: node tools/twin-cities/check-content.mjs NEW_RECEIPT_JSON (optional UMN_TOUR_PUBLIC_ROOT selects prepared public tree)');
const manifest = tourManifestFile();
const baseline = JSON.parse(readFileSync(new URL('../../release/content-baseline.json', import.meta.url)));
const bytes = readFileSync(manifest);
const digest = createHash('sha256').update(bytes).digest('hex');
const report = checkSceneManifest(manifest, { baseUrl: 'https://umn-vr.github.io/tour/twin-cities/scene.json' });
const baselineMatches = bytes.length === baseline.manifest.bytes && digest === baseline.manifest.sha256
  && report.summary?.revision === baseline.revision;
// This also includes retained preparation records beyond runtime references.
const inventory = inventoryContent(path.dirname(manifest));
const fullCorpusMatches = ['files', 'bytes', 'treeSha256'].every(key => inventory[key] === baseline.generated[key]);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ owner: 'UMN-VR/tour', manifestSha256: digest, manifestBytes: bytes.length, baselineMatches, fullCorpusMatches, inventory, report }, null, 2)}\n`, { flag: 'wx' });
if (!report.ok || !baselineMatches || !fullCorpusMatches || report.summary.files !== baseline.referencedMedia.files || report.summary.mediaBytes !== baseline.referencedMedia.bytes) {
  throw new Error(`Prepared content fails shared scene/file verification or differs from the retained campus baseline; receipt retained at ${output}`);
}
console.log(JSON.stringify({ owner: 'UMN-VR/tour', manifestSha256: digest, fullCorpusFiles: inventory.files, fullCorpusBytes: inventory.bytes, fullCorpusSha256: inventory.treeSha256, ...report.summary }));
