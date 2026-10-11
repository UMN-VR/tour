import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { writeTourRelease } from './artifact.mjs';
import { planTourAppDelivery } from './delivery.mjs';

mkdirSync('.local/checks', { recursive: true });
const root = mkdtempSync(path.resolve('.local/checks/delivery-'));
function fixture(name, bytes = name, content = {}) {
  const folder = mkdtempSync(path.join(root, 'fixture-'));
  const input = path.join(folder, 'app'), directory = path.join(folder, 'release');
  mkdirSync(path.join(input, 'tour/twin-cities'), { recursive: true });
  mkdirSync(path.join(input, 'assets'));
  const manifestUrl = content.manifestUrl ?? 'tour/twin-cities/scene.json';
  writeFileSync(path.join(input, 'tour/twin-cities/index.html'), `<meta name="umn-vr-tour-source" content="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"><meta name="umn-vr-tour-package-version" content="0.1.0"><meta name="foss-earth-app-source" content="aaaaaaaaaaaa"><meta name="foss-earth-build" content="2026-10-08T12:00:00Z"><meta name="umn-vr-content-url" content="${manifestUrl}"><script src="/assets/${name}-12345678.js"></script>`);
  writeFileSync(path.join(input, `assets/${name}-12345678.js`), bytes);
  writeFileSync(path.join(input, 'foss-earth-sw.js'), bytes);
  const result = writeTourRelease({ input, output: directory,
    source: { commit: 'a'.repeat(40), dirty: false, packageVersion: '0.1.0', builtAt: '2026-10-08T12:00:00Z' },
    content: { manifestUrl, revision: '4b89d4e2af09', manifestSha256: 'b'.repeat(64), ...content },
  });
  return { directory, descriptorSha256: result.descriptorSha256 };
}
test('app dry run is read-only, media-free and preserves prior hashed bundles and all unselected files', () => {
  const old = fixture('old'), current = fixture('current');
  const oldPage = readFileSync(path.join(old.directory, 'payload/tour/twin-cities/index.html'));
  const plan = planTourAppDelivery({ ...current, retained: [old] });
  assert.equal(plan.mode, 'additive');
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.retainsFromSuppliedReleases, ['assets/old-12345678.js']);
  assert.deepEqual(plan.supportedContent.map(content => content.revision), ['4b89d4e2af09']);
  assert.equal(plan.files.some(file => file.path.endsWith('/scene.json')), false);
  assert.deepEqual(readFileSync(path.join(old.directory, 'payload/tour/twin-cities/index.html')), oldPage);
});
test('refuses changed bytes at a retained immutable app path', () => {
  const old = fixture('same', 'first'), current = fixture('same', 'second');
  assert.throws(() => planTourAppDelivery({ ...current, retained: [old] }), /immutable app path/);
});
test('requires immutable content URLs when supported app pins name different content bytes', () => {
  const old = fixture('old'), current = fixture('current', 'current', { revision: 'new-revision', manifestSha256: 'c'.repeat(64) });
  assert.throws(() => planTourAppDelivery({ ...current, retained: [old] }), /distinct immutable URLs/);
  const versioned = fixture('versioned', 'versioned', { manifestUrl: 'https://media.example.org/new-revision/scene.json', revision: 'new-revision', manifestSha256: 'c'.repeat(64) });
  assert.equal(planTourAppDelivery({ ...versioned, retained: [old] }).supportedContent.length, 2);
});
test('compares content retention at the actual domain-root URL, including fragment aliases', () => {
  const old = fixture('old');
  for (const manifestUrl of ['/tour/twin-cities/scene.json', 'https://umn-vr.github.io/tour/twin-cities/scene.json#same-file']) {
    const current = fixture('current', 'current', { manifestUrl, revision: 'changed', manifestSha256: 'c'.repeat(64) });
    assert.throws(() => planTourAppDelivery({ ...current, retained: [old] }), /distinct immutable URLs/);
  }
});
