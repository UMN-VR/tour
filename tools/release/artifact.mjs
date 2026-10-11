/** UMN tour app artifact contract; no renderer, scene schema or tour runtime imports. */
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const TOUR_ROUTE = '/tour/twin-cities/';
export const CURRENT_TAB_IDS = Object.freeze([
  'location', 'map', 'renderer', 'sky', 'time', 'controls', 'interface',
  'settings', 'about', 'bug-report', 'scenes', 'panorama', 'panorama-settings',
]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const attributeText = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (named[entity]) return named[entity];
  const numeric = entity.slice(2, -1);
  return String.fromCodePoint(numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric));
});

function pageMeta(html, name) {
  const tags = (html.match(/<meta\b[^>]*>/gi) ?? []).filter(tag => tag.includes(`name="${name}"`));
  if (tags.length !== 1) throw new Error(`App output needs one ${name} stamp`);
  return attributeText(tags[0].match(/\bcontent="([^"]+)"/)?.[1] ?? '');
}

function validatePage(html, content, files, source) {
  if (pageMeta(html, 'umn-vr-content-url') !== content.manifestUrl) {
    throw new Error('Content URL pin differs from the built tour');
  }
  const page = new URL(TOUR_ROUTE, 'https://umn-vr.github.io/');
  for (const tag of html.match(/<(?:script|link|img)\b[^>]*>/gi) ?? []) {
    const attribute = tag.match(/\b(?:src|href)=(?:"([^"]*)"|'([^']*)')/i);
    if (!attribute) continue;
    const target = new URL(attributeText(attribute[1] ?? attribute[2]), page);
    if (target.origin !== page.origin) continue;
    const file = relativeFile(decodeURIComponent(target.pathname.slice(1)));
    if (!files.has(file)) throw new Error(`Tour HTML references a missing app file: ${file}`);
  }
  const actual = tourBuildSource(html, source);
  if (actual.builtAt !== source.builtAt) throw new Error('Tour descriptor time differs from emitted build time');
}

/** Packaging checks emitted build stamps; it never assigns today's identity to stale output. */
export function tourBuildSource(html, { commit, dirty, packageVersion }) {
  if (pageMeta(html, 'umn-vr-tour-source') !== `${commit}${dirty ? '-dirty' : ''}`) {
    throw new Error('App output full source stamp does not match this checkout; build the app again');
  }
  if (pageMeta(html, 'umn-vr-tour-package-version') !== packageVersion) {
    throw new Error('App output package version stamp does not match this checkout; build the app again');
  }
  const source = pageMeta(html, 'foss-earth-app-source');
  if (source !== `${commit.slice(0, 12)}${dirty ? '-dirty' : ''}`) {
    throw new Error('App output source stamp does not match this checkout; build the app again');
  }
  const builtAt = pageMeta(html, 'foss-earth-build');
  if (!builtAt || !Number.isFinite(Date.parse(builtAt))) throw new Error('App output lacks its actual build time');
  return { commit, dirty, packageVersion, builtAt };
}

function relativeFile(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes('\0')
    || file.split('/').some(part => !part || part === '..' || part === '.' || part.startsWith('_') || part.startsWith('.'))
    || path.posix.isAbsolute(file)) throw new Error(`Unsafe or Jekyll-hidden tour file: ${file}`);
  if (file.startsWith('tour/') && file !== 'tour/twin-cities/index.html') {
    throw new Error(`App artifact contains content or an undeclared route: ${file}`);
  }
  if (['index.md', '_config.yml', 'index.html', 'Media '].some(entry => file === entry || file.startsWith(`${entry}/`))) {
    throw new Error(`Tour artifact must not own club landing inputs: ${file}`);
  }
  return file;
}

/** Reject symlinks, including a symlink in any intermediate directory. */
function regularFile(root, file) {
  const base = realpathSync(root);
  let target = base;
  const parts = relativeFile(file).split('/');
  for (const [index, part] of parts.entries()) {
    target = path.join(target, part);
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`Tour artifact contains a symlink or non-file: ${file}`);
    }
  }
  return target;
}

function filesOf(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Tour artifact contains a symlink: ${file}`);
    if (entry.isDirectory()) return filesOf(path.join(root, entry.name), file);
    if (!entry.isFile()) throw new Error(`Tour artifact contains a non-file: ${file}`);
    return [relativeFile(file)];
  }).sort();
}

function validateDescriptor(release) {
  if (release?.format !== 'umn-vr-tour-release' || release.version !== 1 || release.owner !== 'UMN-VR/tour') {
    throw new Error('Unsupported UMN tour release descriptor');
  }
  if (release.mountPath !== TOUR_ROUTE || release.base !== '/' || release.worker?.url !== '/foss-earth-sw.js' || release.worker.scope !== '/') {
    throw new Error('Tour route, root asset base or worker scope changed');
  }
  if (!/^[0-9a-f]{40}$/.test(release.source?.commit ?? '') || typeof release.source.dirty !== 'boolean'
    || !release.source.packageVersion || !Number.isFinite(Date.parse(release.source.builtAt))) {
    throw new Error('Tour release needs exact source commit, dirty state, version and build time');
  }
  if (JSON.stringify(release.compatibility?.currentTabIds) !== JSON.stringify(CURRENT_TAB_IDS)) {
    throw new Error('Current campus tab compatibility contract changed');
  }
  if (typeof release.content?.manifestUrl !== 'string' || !release.content.manifestUrl.trim()
    || !release.content.revision || !/^[0-9a-f]{64}$/.test(release.content.manifestSha256 ?? '')) {
    throw new Error('Tour release needs the pinned prepared-content manifest');
  }
  if (!Array.isArray(release.files) || !release.files.length) throw new Error('Tour release has no app files');
  const seen = new Set();
  for (const entry of release.files) {
    relativeFile(entry.path);
    if (seen.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error(`Invalid or duplicate tour file record: ${entry.path}`);
    }
    seen.add(entry.path);
  }
  for (const required of ['tour/twin-cities/index.html', 'foss-earth-sw.js']) {
    if (!seen.has(required)) throw new Error(`Missing required tour app file: ${required}`);
  }
  return release;
}

/** Package app-only Vite output unchanged under payload/, with a descriptor outside it. */
export function writeTourRelease({ input, output, source, content }) {
  if (lstatSync(input).isSymbolicLink() || !lstatSync(input).isDirectory()) throw new Error('Tour app input must be a regular directory, not a symlink');
  const physicalInput = realpathSync(input);
  const physicalOutput = path.join(realpathSync(path.dirname(path.resolve(output))), path.basename(output));
  if (physicalOutput === physicalInput || physicalOutput.startsWith(`${physicalInput}${path.sep}`)) {
    throw new Error('Release output must be outside the app input');
  }
  const files = filesOf(input).map(file => {
    const bytes = readFileSync(regularFile(input, file));
    return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const release = validateDescriptor({
    format: 'umn-vr-tour-release', version: 1, owner: 'UMN-VR/tour',
    source, mountPath: TOUR_ROUTE, base: '/',
    worker: { url: '/foss-earth-sw.js', scope: '/' }, content,
    compatibility: { currentTabIds: [...CURRENT_TAB_IDS] }, files,
  });
  validatePage(readFileSync(regularFile(input, 'tour/twin-cities/index.html'), 'utf8'), content, new Set(files.map(file => file.path)), source);
  // Validate before writing, and never overwrite/reuse a retained release folder.
  mkdirSync(output, { recursive: false });
  const payload = path.join(output, 'payload');
  mkdirSync(payload);
  for (const file of files) {
    const destination = path.join(payload, file.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(regularFile(input, file.path), destination);
  }
  const descriptor = `${JSON.stringify(release, null, 2)}\n`;
  writeFileSync(path.join(output, 'tour-release.json'), descriptor, { flag: 'wx' });
  const descriptorSha256 = sha256(descriptor);
  verifyTourRelease(output, descriptorSha256);
  // This pin describes the actual compiled app, separately from the Node
  // helper package which the club installs to verify and assemble it.
  const clubPin = { schemaVersion: 1, repository: 'UMN-VR/tour', mountPath: TOUR_ROUTE, descriptorSha256 };
  writeFileSync(path.join(output, 'club-pin.json'), `${JSON.stringify(clubPin, null, 2)}\n`, { flag: 'wx' });
  return { release, descriptorSha256, clubPin };
}

/** Club assembly verifies the pinned descriptor AND every payload byte before copying. */
export function verifyTourRelease(folder, expectedDescriptorSha256) {
  if (lstatSync(folder).isSymbolicLink() || !lstatSync(folder).isDirectory()) throw new Error('Tour release must be a regular directory, not a symlink');
  if (!/^[0-9a-f]{64}$/.test(expectedDescriptorSha256 ?? '')) throw new Error('An exact tour descriptor SHA-256 pin is required');
  const descriptorFile = path.join(folder, 'tour-release.json');
  if (!lstatSync(descriptorFile).isFile() || lstatSync(descriptorFile).isSymbolicLink()) throw new Error('Invalid tour descriptor file');
  const descriptor = readFileSync(descriptorFile);
  if (sha256(descriptor) !== expectedDescriptorSha256) throw new Error('Tour descriptor digest mismatch');
  const release = validateDescriptor(JSON.parse(descriptor));
  const payload = path.join(folder, 'payload');
  if (lstatSync(payload).isSymbolicLink() || !lstatSync(payload).isDirectory()) throw new Error('Invalid tour payload directory');
  const actual = filesOf(payload);
  const expected = release.files.map(file => file.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Tour payload file inventory mismatch');
  for (const file of release.files) {
    const bytes = readFileSync(regularFile(payload, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Tour payload digest/size mismatch: ${file.path}`);
  }
  validatePage(readFileSync(regularFile(payload, 'tour/twin-cities/index.html'), 'utf8'), release.content, new Set(expected), release.source);
  return { release, payload };
}
