// Source-only fixtures. Execute only after the coordinator grants the Campus check slot.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { selectorBuildSource, sha256, verifySelectorRelease, writeSelectorRelease } from '../tools/selector-release.mjs';

const source = {
  commit: 'a'.repeat(40), dirty: true, packageVersion: '0.1.0', builtAt: '2026-10-10T20:00:00.000Z',
};
const imagePaths = [
  '/tour/twin-cities/media/northrop-mall/preview-256/px.jpg',
  '/tour/twin-cities/media/saint-paul-campus/preview-256/px.jpg',
  '/tour/twin-cities/media/washington-avenue-bridge-and-the-mississippi-river/preview-256/px.jpg',
];
const routes = ['/tour/minneapolis/', '/tour/st-paul/', '/tour/twin-cities/'];
function document(identity = source) {
  return `<!doctype html><html lang="en"><head>
<meta name="umn-vr-selector-source" content="${identity.commit};dirty=${identity.dirty}">
<meta name="umn-vr-selector-package-version" content="${identity.packageVersion}">
<meta name="umn-vr-selector-build" content="${identity.builtAt}">
<link rel="canonical" href="/tour/"><link rel="stylesheet" href="/tour/assets/selector-12345678.css">
</head><body><a href="#campus-tours">Skip to tours</a><main id="campus-tours">
${routes.map((route, index) => `<a href="${route}"><img src="${imagePaths[index]}" alt="Photograph from campus panorama ${index + 1}">${route}</a>`).join('\n')}
</main><a href="/">Club</a><a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></body></html>`;
}
function fixture() {
  const scratch = path.resolve('.local/checks');
  mkdirSync(scratch, { recursive: true });
  const folder = mkdtempSync(path.join(scratch, 'selector-release-'));
  const input = path.join(folder, 'input');
  mkdirSync(path.join(input, 'assets'), { recursive: true });
  writeFileSync(path.join(input, 'index.html'), document());
  writeFileSync(path.join(input, 'assets/selector-12345678.css'), 'body { color: #26201e; background: #faf8f5; }');
  const output = path.join(folder, 'release');
  return { folder, input, output, source: { ...source } };
}
function changePage(f, mutate) {
  const file = path.join(f.input, 'index.html');
  writeFileSync(file, mutate(readFileSync(file, 'utf8')));
}
function resealDescriptor(f, mutate) {
  const file = path.join(f.output, 'selector-release.json');
  const descriptor = JSON.parse(readFileSync(file, 'utf8'));
  mutate(descriptor);
  const bytes = `${JSON.stringify(descriptor)}\n`;
  writeFileSync(file, bytes);
  return sha256(bytes);
}

test('measures mounted static bytes and binds all stamps without changing emitted source identity', () => {
  const f = fixture();
  const result = writeSelectorRelease(f);
  const verified = verifySelectorRelease(f.output, result.descriptorSha256);
  assert.deepEqual(verified.release, result.release);
  assert.equal(result.release.owner, 'UMN-VR/tour');
  assert.equal(result.release.mountPath, '/tour/');
  assert.deepEqual(result.release.source, source);
  assert.deepEqual(result.release.files.map(file => file.path), ['tour/assets/selector-12345678.css', 'tour/index.html']);
  assert.equal(result.descriptorSha256, sha256(readFileSync(path.join(f.output, 'selector-release.json'))));
  assert.deepEqual(readFileSync(path.join(verified.payload, 'tour/index.html')), readFileSync(path.join(f.input, 'index.html')));
});

test('rejects stale commit, dirty state, version or build time before creating output', () => {
  for (const [field, value] of [['commit', 'b'.repeat(40)], ['dirty', false], ['packageVersion', '0.2.0'], ['builtAt', '2026-10-10T21:00:00.000Z']]) {
    const f = fixture();
    assert.throws(() => writeSelectorRelease({ ...f, source: { ...f.source, [field]: value } }), /emitted.*differs/);
    assert.equal(existsSync(f.output), false);
  }
  assert.deepEqual(selectorBuildSource(document(), source), source);
  assert.throws(() => selectorBuildSource(document(), { ...source, commit: 'a'.repeat(12) }), /exact commit/);
});

test('requires one of each emitted stamp and a real UTC calendar time', () => {
  for (const kind of ['missing', 'duplicate', 'calendar']) {
    const f = fixture();
    if (kind === 'missing') changePage(f, html => html.replace(/<meta name="umn-vr-selector-build"[^>]+>/, ''));
    if (kind === 'duplicate') changePage(f, html => html.replace('</head>', `<meta name="umn-vr-selector-build" content="${source.builtAt}"></head>`));
    if (kind === 'calendar') f.source.builtAt = '2026-02-30T20:00:00.000Z';
    assert.throws(() => writeSelectorRelease(f), /stamp|real UTC/);
    assert.equal(existsSync(f.output), false);
  }
});

test('never overwrites retained output and refuses physical nesting', () => {
  const f = fixture();
  const result = writeSelectorRelease(f);
  const before = readFileSync(path.join(f.output, 'selector-release.json'));
  assert.throws(() => writeSelectorRelease(f), /EEXIST/);
  assert.deepEqual(readFileSync(path.join(f.output, 'selector-release.json')), before);
  verifySelectorRelease(f.output, result.descriptorSha256);
  assert.throws(() => writeSelectorRelease({ ...f, output: path.join(f.input, 'release') }), /outside/);
  assert.equal(existsSync(path.join(f.input, 'release')), false);
});

test('rejects changed bytes, missing or extra payload files, and wrong descriptor pins', () => {
  for (const kind of ['bytes', 'missing', 'extra', 'pin']) {
    const f = fixture();
    const { descriptorSha256 } = writeSelectorRelease(f);
    const css = path.join(f.output, 'payload/tour/assets/selector-12345678.css');
    if (kind === 'bytes') writeFileSync(css, 'body { color: red; }');
    if (kind === 'missing') renameSync(css, path.join(f.folder, 'retained-removed.css'));
    if (kind === 'extra') writeFileSync(path.join(f.output, 'payload/tour/assets/extra.css'), '');
    assert.throws(() => verifySelectorRelease(f.output, kind === 'pin' ? '0'.repeat(64) : descriptorSha256), /mismatch/);
  }
});

test('does not accept a resealed descriptor that relabels source or changes the mount or paths', () => {
  for (const kind of ['source', 'mount', 'traversal', 'duplicate']) {
    const f = fixture();
    writeSelectorRelease(f);
    const pin = resealDescriptor(f, descriptor => {
      if (kind === 'source') descriptor.source.commit = 'b'.repeat(40);
      if (kind === 'mount') descriptor.mountPath = '/tour/twin-cities/';
      if (kind === 'traversal') descriptor.files[0].path = 'tour/../outside.css';
      if (kind === 'duplicate') descriptor.files.push({ ...descriptor.files[0] });
    });
    assert.throws(() => verifySelectorRelease(f.output, pin), /source stamp|mount|Unsafe|duplicate/);
  }
});

test('rejects runtime source, source maps, photograph vendoring and undeclared files before writes', () => {
  for (const file of ['assets/runtime.js', 'assets/source.ts', 'assets/selector.css.map', 'assets/photograph.jpg', 'scene.json', 'src/selector.css']) {
    const f = fixture();
    mkdirSync(path.dirname(path.join(f.input, file)), { recursive: true });
    writeFileSync(path.join(f.input, file), 'unaccepted');
    assert.throws(() => writeSelectorRelease(f), /runtime, source, media or undeclared|undeclared directory/);
    assert.equal(existsSync(f.output), false);
  }
  const emptySource = fixture();
  mkdirSync(path.join(emptySource.input, 'node_modules'));
  assert.throws(() => writeSelectorRelease(emptySource), /undeclared directory/);
  assert.equal(existsSync(emptySource.output), false);
});

test('rejects scripts, handlers, embedded runtimes, redirects and missing ordinary route anchors', () => {
  const mutations = [
    html => html.replace('</head>', '<script type="module" src="/tour/assets/runtime.js"></script></head>'),
    html => html.replace('<main ', '<main onclick="go()" '),
    html => html.replace('</main>', '<iframe src="/tour/minneapolis/"></iframe></main>'),
    html => html.replace('</main>', '<form action="javascript:go()"><button>Go</button></form></main>'),
    html => html.replace('</head>', '<meta http-equiv="refresh" content="0;url=/tour/minneapolis/"></head>'),
    html => html.replace('href="/tour/minneapolis/"', 'href="javascript:go()"'),
    html => html.replace('href="/tour/st-paul/"', 'href="/tour/st-paul"'),
    html => html.replace('href="/tour/twin-cities/"', 'href="/tour/twin-cities/" download'),
  ];
  for (const mutate of mutations) {
    const f = fixture();
    changePage(f, mutate);
    assert.throws(() => writeSelectorRelease(f), /runtime-free|redirect|anchor|ordinary/);
    assert.equal(existsSync(f.output), false);
  }
});

test('requires measured CSS at the canonical mount and retained image URLs with alternatives', () => {
  const mutations = [
    html => html.replace('/tour/assets/selector-12345678.css', '/assets/selector-12345678.css'),
    html => html.replace('/tour/assets/selector-12345678.css', '/tour/assets/missing.css'),
    html => html.replace('href="/tour/"', 'href="/elsewhere/"'),
    html => html.replace(imagePaths[0], '/tour/minneapolis/media/copied.jpg'),
    html => html.replace('alt="Photograph from campus panorama 1"', 'alt=""'),
    html => html.replace('href="/tour/st-paul/"', 'href="/tour/%73t-paul/"'),
  ];
  for (const mutate of mutations) {
    const f = fixture();
    changePage(f, mutate);
    assert.throws(() => writeSelectorRelease(f), /mount|missing stylesheet|canonical|preview URL|alternatives|Unsafe/);
    assert.equal(existsSync(f.output), false);
  }
  for (const css of ['@import "https://styles.example/style.css";', 'body { background: url(/unmeasured.jpg); }', 'a { behavior: url(run.htc); }', 'body { background: url/**/(/unmeasured.jpg); }', 'body { background: u\\72l(/unmeasured.jpg); }']) {
    const f = fixture();
    writeFileSync(path.join(f.input, 'assets/selector-12345678.css'), css);
    assert.throws(() => writeSelectorRelease(f), /unmeasured or executable/);
    assert.equal(existsSync(f.output), false);
  }
});

test('rejects input, parent, descriptor and payload symlinks without following source aliases', () => {
  const input = fixture();
  const inputAlias = path.join(input.folder, 'input-alias');
  symlinkSync(input.input, inputAlias);
  assert.throws(() => writeSelectorRelease({ ...input, input: inputAlias }), /symlink/);
  assert.throws(() => writeSelectorRelease({ ...input, output: path.join(inputAlias, 'release') }), /symlink/);
  assert.equal(existsSync(path.join(input.input, 'release')), false);
  const child = fixture();
  symlinkSync(path.join(child.input, 'assets/selector-12345678.css'), path.join(child.input, 'assets/link.css'));
  assert.throws(() => writeSelectorRelease(child), /symlink/);
  for (const name of ['selector-release.json', 'payload']) {
    const f = fixture();
    const { descriptorSha256 } = writeSelectorRelease(f);
    const original = path.join(f.output, name);
    const retained = path.join(f.folder, `retained-${name}`);
    renameSync(original, retained);
    symlinkSync(retained, original);
    assert.throws(() => verifySelectorRelease(f.output, descriptorSha256), /symlink/);
  }
});
