#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, tourBuildSource, writeTourRelease } from './artifact.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [input, output, manifest, manifestUrl] = process.argv.slice(2);
if (!input || !output || !manifest || !manifestUrl || process.argv.length !== 6) {
  throw new Error('Usage: node tools/release/package.mjs APP_DIR NEW_RELEASE_DIR VALIDATED_SCENE_FILE MANIFEST_URL');
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const bytes = readFileSync(manifest);
const scene = JSON.parse(bytes);
const result = writeTourRelease({
  input: path.resolve(input), output: path.resolve(output),
  source: tourBuildSource(readFileSync(path.join(input, 'tour/twin-cities/index.html'), 'utf8'), {
    commit: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')),
    packageVersion: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  }),
  content: { manifestUrl, revision: scene.revision, manifestSha256: sha256(bytes) },
});
console.log(JSON.stringify({ descriptorSha256: result.descriptorSha256, clubPin: path.join(output, 'club-pin.json'), files: result.release.files.length, bytes: result.release.files.reduce((sum, file) => sum + file.bytes, 0) }, null, 2));
