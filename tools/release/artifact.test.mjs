import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { sha256, tourBuildSource, verifyTourRelease, writeTourRelease } from './artifact.mjs';

mkdirSync('.local/checks', { recursive: true });
const root = mkdtempSync(path.resolve('.local/checks/release-'));
function fixture() {
  const folder = mkdtempSync(path.join(root, 'fixture-'));
  const input = path.join(folder, 'app');
  mkdirSync(path.join(input, 'tour/twin-cities'), { recursive: true });
  mkdirSync(path.join(input, 'assets'));
  writeFileSync(path.join(input, 'tour/twin-cities/index.html'), '<meta name="umn-vr-tour-source" content="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"><meta name="umn-vr-tour-package-version" content="0.1.0"><meta name="foss-earth-app-source" content="aaaaaaaaaaaa"><meta name="foss-earth-build" content="2026-10-08T12:00:00Z"><meta name="umn-vr-content-url" content="tour/twin-cities/scene.json"><script src="/assets/tour-12345678.js"></script>');
  writeFileSync(path.join(input, 'assets/tour-12345678.js'), 'window.tour=true;');
  writeFileSync(path.join(input, 'foss-earth-sw.js'), '/* shared worker */');
  const output = path.join(folder, 'release');
  const options = {
    input, output,
    source: { commit: 'a'.repeat(40), dirty: false, packageVersion: '0.1.0', builtAt: '2026-10-08T12:00:00Z' },
    content: { manifestUrl: 'tour/twin-cities/scene.json', revision: '4b89d4e2af09', manifestSha256: 'b'.repeat(64) },
  };
  return { ...options, options };
}

test('keeps the published root assets, worker and tour route; verifies every file', () => {
  const f = fixture();
  const result = writeTourRelease(f.options);
  const pin = result.descriptorSha256;
  const clubPin = JSON.parse(readFileSync(path.join(f.output, 'club-pin.json'), 'utf8'));
  assert.deepEqual(clubPin, result.clubPin);
  assert.equal(clubPin.descriptorSha256, sha256(readFileSync(path.join(f.output, 'tour-release.json'))));
  assert.equal(clubPin.repository, 'UMN-VR/tour');
  assert.equal(clubPin.mountPath, '/tour/twin-cities/');
  const { release, payload } = verifyTourRelease(f.output, pin);
  assert.equal(release.mountPath, '/tour/twin-cities/');
  assert.equal(release.worker.scope, '/');
  assert.equal(release.compatibility.currentTabIds.length, 13);
  assert.match(readFileSync(path.join(payload, 'tour/twin-cities/index.html'), 'utf8'), /src="\/assets\//);
  assert.equal(release.files.length, 3);
});
test('rejects altered bytes, unexpected files and a wrong descriptor pin', () => {
  for (const kind of ['bytes', 'extra', 'pin']) {
    const f = fixture();
    const pin = writeTourRelease(f.options).descriptorSha256;
    if (kind === 'bytes') writeFileSync(path.join(f.output, 'payload/assets/tour-12345678.js'), 'changed');
    if (kind === 'extra') writeFileSync(path.join(f.output, 'payload/assets/unrecorded.js'), 'extra');
    assert.throws(() => verifyTourRelease(f.output, kind === 'pin' ? '0'.repeat(64) : pin), /mismatch/);
  }
});
test('rejects media and club inputs in app output', () => {
  for (const file of ['tour/twin-cities/scene.json', 'index.md']) {
    const f = fixture();
    writeFileSync(path.join(f.input, file), '{}');
    assert.throws(() => writeTourRelease(f.options), /content|club/);
  }
});
test('rejects input and payload symlinks and path escape in a pinned descriptor', () => {
  const f = fixture();
  symlinkSync(path.join(f.input, 'assets/tour-12345678.js'), path.join(f.input, 'assets/link.js'));
  assert.throws(() => writeTourRelease(f.options), /symlink/);
  const g = fixture();
  writeTourRelease(g.options);
  const file = path.join(g.output, 'tour-release.json');
  const descriptor = JSON.parse(readFileSync(file, 'utf8'));
  descriptor.files[0].path = '../outside.js';
  const bytes = JSON.stringify(descriptor);
  writeFileSync(file, bytes);
  assert.throws(() => verifyTourRelease(g.output, sha256(bytes)), /Unsafe/);
  const h = fixture();
  const pin = writeTourRelease(h.options).descriptorSha256;
  symlinkSync(h.input, path.join(h.output, 'payload/assets/link'));
  assert.throws(() => verifyTourRelease(h.output, pin), /symlink/);
});
test('refuses to overwrite an old release or nest output into input', () => {
  const f = fixture();
  writeTourRelease(f.options);
  assert.throws(() => writeTourRelease(f.options), /EEXIST/);
  assert.throws(() => writeTourRelease({ ...f.options, output: path.join(f.input, 'release') }), /outside/);
});
test('refuses an alias output that physically nests in the app input without writing it', () => {
  const f = fixture();
  const alias = path.join(path.dirname(f.input), 'input-alias');
  symlinkSync(f.input, alias);
  const before = readdirSync(f.input);
  assert.throws(() => writeTourRelease({ ...f.options, output: path.join(alias, 'release') }), /outside/);
  assert.equal(existsSync(path.join(f.input, 'release')), false);
  assert.deepEqual(readdirSync(f.input), before);
});
test('rejects stale output and retains the emitted build time and dirty state', () => {
  const identity = { commit: 'a'.repeat(40), dirty: true, packageVersion: '0.1.0' };
  const html = '<meta name="umn-vr-tour-source" content="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-dirty"><meta name="umn-vr-tour-package-version" content="0.1.0"><meta name="foss-earth-app-source" content="aaaaaaaaaaaa-dirty"><meta name="foss-earth-build" content="2026-10-08T12:00:00Z">';
  assert.equal(tourBuildSource(html, identity).builtAt, '2026-10-08T12:00:00Z');
  assert.equal(tourBuildSource(html, identity).dirty, true);
  assert.throws(() => tourBuildSource(html, { ...identity, commit: 'c'.repeat(40) }), /source stamp/);
  assert.throws(() => tourBuildSource(html, { ...identity, dirty: false }), /source stamp/);
});
test('binds content pins to the URL in the build and resolves resources at the published route', () => {
  const f = fixture();
  assert.throws(() => writeTourRelease({ ...f.options, content: { ...f.content, manifestUrl: 'https://content.example.org/r2/scene.json' } }), /Content URL pin/);
  const g = fixture();
  writeFileSync(path.join(g.input, 'tour/twin-cities/index.html'), '<meta name="umn-vr-content-url" content="tour/twin-cities/scene.json"><script src="assets/tour-12345678.js"></script>');
  assert.throws(() => writeTourRelease(g.options), /content|undeclared route|missing/);
  const h = fixture();
  writeFileSync(path.join(h.input, 'tour/twin-cities/index.html'), '<meta name="umn-vr-content-url" content="tour/twin-cities/scene.json"><script src="/assets/missing.js"></script>');
  assert.throws(() => writeTourRelease(h.options), /missing app file/);
});
test('public artifact verification rejects relabeled source/build identity even with a new descriptor pin', () => {
  for (const field of ['commit', 'builtAt', 'packageVersion']) {
    const f = fixture();
    writeTourRelease(f.options);
    const file = path.join(f.output, 'tour-release.json');
    const descriptor = JSON.parse(readFileSync(file, 'utf8'));
    descriptor.source[field] = field === 'commit' ? 'a'.repeat(12) + 'c'.repeat(28)
      : field === 'packageVersion' ? '0.2.0' : '2026-10-08T13:00:00Z';
    const bytes = JSON.stringify(descriptor);
    writeFileSync(file, bytes);
    assert.throws(() => verifyTourRelease(f.output, sha256(bytes)), /source stamp|package version stamp|emitted build time/);
  }
});
test('rejects root symlinks in both app input and release verification', () => {
  const f = fixture();
  const alias = path.join(path.dirname(f.input), 'app-alias');
  symlinkSync(f.input, alias);
  assert.throws(() => writeTourRelease({ ...f.options, input: alias }), /regular directory/);
  const pin = writeTourRelease(f.options).descriptorSha256;
  const releaseAlias = path.join(path.dirname(f.input), 'release-alias');
  symlinkSync(f.output, releaseAlias);
  assert.throws(() => verifyTourRelease(releaseAlias, pin), /regular directory/);
});
