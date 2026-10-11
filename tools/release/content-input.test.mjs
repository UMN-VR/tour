import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assertAuthoringOutput, tourManifestFile, tourPublicRoot } from '../twin-cities/content-root.mjs';

mkdirSync('.local/checks', { recursive: true });
const root = mkdtempSync(path.resolve('.local/checks/content-input-'));
const content = path.join(root, 'prepared public');
mkdirSync(path.join(content, 'tour/twin-cities'), { recursive: true });
const sentinel = path.join(content, 'tour/twin-cities/scene.json');
writeFileSync(sentinel, 'retained exact prepared scene fixture');
const environment = { UMN_TOUR_PUBLIC_ROOT: content };

test('external prepared input keeps the public route without requiring source backup', () => {
  assert.equal(tourPublicRoot(environment), content);
  assert.equal(tourManifestFile(environment), sentinel);
  assertAuthoringOutput(path.join(root, 'new-authoring'), environment);
});

test('authoring refuses the installed tree and its ancestors before modifying content', () => {
  for (const output of [content, root, path.join(content, 'tour/twin-cities'), path.join(content, 'new-child')]) {
    assert.throws(() => assertAuthoringOutput(output, environment), /overlap/);
  }
  assert.equal(readFileSync(sentinel, 'utf8'), 'retained exact prepared scene fixture');
});

test('a symlink alias cannot redirect authoring into the prepared input', () => {
  const alias = path.join(root, 'alias');
  symlinkSync(content, alias, 'dir');
  assert.throws(() => assertAuthoringOutput(path.join(alias, 'new-child'), environment), /symlink/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'retained exact prepared scene fixture');
});
