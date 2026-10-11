/** Measured, runtime-free Tour selector artifacts. No campus or shared runtime imports. */
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SELECTOR_ROUTE = '/tour/';
export const SELECTOR_DESTINATIONS = Object.freeze([
  '/tour/minneapolis/', '/tour/st-paul/', '/tour/twin-cities/',
]);
const PAGE_URL = new URL(SELECTOR_ROUTE, 'https://umn-vr.github.io/');
const IMAGES = new Set([
  '/tour/twin-cities/media/northrop-mall/preview-256/px.jpg',
  '/tour/twin-cities/media/saint-paul-campus/preview-256/px.jpg',
  '/tour/twin-cities/media/washington-avenue-bridge-and-the-mississippi-river/preview-256/px.jpg',
]);
const DESCRIPTOR = 'selector-release.json';
const MAX_FILES = 32;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function exactKeys(value, keys, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`Invalid ${context} fields`);
  }
}

function validateSource(source) {
  exactKeys(source, ['commit', 'dirty', 'packageVersion', 'builtAt'], 'selector source');
  if (!/^[0-9a-f]{40}$/.test(source.commit ?? '') || typeof source.dirty !== 'boolean'
    || typeof source.packageVersion !== 'string'
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(source.packageVersion)
    || typeof source.builtAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(source.builtAt)
    || !Number.isFinite(Date.parse(source.builtAt))
    || new Date(source.builtAt).toISOString() !== source.builtAt.replace(/(?<!\.\d{3})Z$/, '.000Z')) {
    throw new Error('Selector release needs an exact commit, dirty state, package version and real UTC build time');
  }
  return source;
}

function safeRelative(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes('\0')
    || path.posix.isAbsolute(file)
    || file.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || part.startsWith('_'))) {
    throw new Error(`Unsafe selector file path: ${file}`);
  }
  return file;
}

function inputPath(file) {
  safeRelative(file);
  // This selector bundles only its document and CSS. Photos remain retained public URLs.
  if (file !== 'index.html' && !/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.css$/.test(file)) {
    throw new Error(`Selector contains a runtime, source, media or undeclared file: ${file}`);
  }
  return file;
}

function payloadPath(file) {
  safeRelative(file);
  if (!file.startsWith('tour/')) throw new Error(`Selector payload escapes its canonical mount: ${file}`);
  inputPath(file.slice('tour/'.length));
  return file;
}

/** Reject a symlink anywhere in a supplied directory path, including the root. */
function regularDirectory(folder) {
  const absolute = path.resolve(folder);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Selector needs a regular directory without symlinks: ${folder}`);
    }
  }
  return realpathSync(absolute);
}

function inventory(root, validatePath, prefix = '') {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    safeRelative(file);
    const location = path.join(root, entry.name);
    const stat = lstatSync(location);
    if (stat.isSymbolicLink()) throw new Error(`Selector contains a symlink: ${file}`);
    if (stat.isDirectory()) {
      const allowed = validatePath === inputPath ? ['assets'] : ['tour', 'tour/assets'];
      if (!allowed.includes(file)) throw new Error(`Selector contains an undeclared directory: ${file}`);
      result.push(...inventory(location, validatePath, file));
    }
    else if (stat.isFile()) result.push(validatePath(file));
    else throw new Error(`Selector contains a non-file: ${file}`);
  }
  return result.sort();
}

function measure(root, files) {
  if (!files.length || files.length > MAX_FILES) throw new Error('Selector inventory is empty or exceeds its file limit');
  const bytesByPath = new Map();
  let totalBytes = 0;
  for (const file of files) {
    const bytes = readFileSync(path.join(root, file));
    totalBytes += bytes.length;
    if (bytes.length > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) throw new Error('Selector exceeds its bounded static byte limits');
    bytesByPath.set(file, bytes);
  }
  return bytesByPath;
}

function attributeText(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    const numeric = entity.slice(2, -1);
    const code = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric);
    if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff) throw new Error('Invalid selector attribute character');
    return String.fromCodePoint(code);
  });
}

function tagsOf(html) {
  return [...html.matchAll(/<([A-Za-z][\w:-]*)(\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?\/?\s*>/g)].map(match => {
    const attributes = new Map();
    let text = (match[2] ?? '').trim().replace(/\/$/, '').trim();
    while (text) {
      const attribute = /^([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/.exec(text);
      if (!attribute) throw new Error('Malformed selector HTML attribute');
      const name = attribute[1].toLowerCase();
      if (attributes.has(name)) throw new Error(`Duplicate selector HTML attribute: ${name}`);
      attributes.set(name, attributeText(attribute[2] ?? attribute[3] ?? attribute[4] ?? ''));
      text = text.slice(attribute[0].length).trimStart();
    }
    return { name: match[1].toLowerCase(), attributes };
  });
}

function pageMeta(tags, name) {
  const found = tags.filter(tag => tag.name === 'meta' && tag.attributes.get('name') === name);
  if (found.length !== 1 || !found[0].attributes.has('content')) throw new Error(`Selector output needs one ${name} stamp`);
  return found[0].attributes.get('content');
}

/** Require the emitted build identity; never label old output with today's checkout identity. */
export function selectorBuildSource(html, source) {
  validateSource(source);
  const tags = tagsOf(html);
  if (pageMeta(tags, 'umn-vr-selector-source') !== `${source.commit};dirty=${source.dirty}`) {
    throw new Error('Selector emitted source stamp differs; rebuild from the intended checkout');
  }
  if (pageMeta(tags, 'umn-vr-selector-package-version') !== source.packageVersion) {
    throw new Error('Selector emitted package version stamp differs');
  }
  if (pageMeta(tags, 'umn-vr-selector-build') !== source.builtAt) {
    throw new Error('Selector emitted build time differs');
  }
  return { ...source };
}

function canonicalUrl(value, context) {
  if (!value || /[\\\u0000-\u0020]/.test(value) || /%|&/.test(value)) throw new Error(`Unsafe selector ${context} URL`);
  const url = new URL(value, PAGE_URL);
  if (url.username || url.password || url.search) throw new Error(`Unpinned selector ${context} URL`);
  return url;
}

function validatePage(html, bytesByPath, source) {
  if (/<\s*(?:script|iframe|object|embed|base|form|input|button|select|textarea|video|audio|source|canvas|svg|math|style)\b/i.test(html)
    || /\bon[a-z]+\s*=/i.test(html)) {
    throw new Error('Selector HTML must be runtime-free: scripts, embedded runtimes and event handlers are forbidden');
  }
  const tags = tagsOf(html);
  selectorBuildSource(html, source);
  const destinations = new Set();
  const stylesheets = new Set();
  const images = new Set();
  for (const tag of tags) {
    for (const [name] of tag.attributes) {
      if (/^on/i.test(name) || name === 'srcdoc' || name === 'style' || name === 'srcset') {
        throw new Error(`Selector HTML contains an undeclared executable or resource attribute: ${name}`);
      }
    }
    if (tag.name === 'meta' && tag.attributes.has('http-equiv')) throw new Error('Selector meta redirects are forbidden');
    if (tag.name === 'a') {
      const href = tag.attributes.get('href');
      const url = canonicalUrl(href, 'anchor');
      if (url.origin === PAGE_URL.origin && SELECTOR_DESTINATIONS.includes(url.pathname) && !url.hash) {
        // Ordinary canonical anchors retain navigation without a runtime listener.
        if (href !== url.pathname || tag.attributes.has('download') || tag.attributes.has('target')) {
          throw new Error('Selector destination must be an ordinary canonical route anchor');
        }
        destinations.add(url.pathname);
      } else if (!((url.origin === PAGE_URL.origin && url.pathname === '/' && !url.hash)
        || (url.origin === PAGE_URL.origin && url.pathname === SELECTOR_ROUTE && url.hash === '#campus-tours')
        || (url.href === 'https://www.openstreetmap.org/copyright'))) {
        throw new Error(`Selector contains an undeclared anchor destination: ${href}`);
      }
    } else if (tag.name === 'link') {
      const rel = tag.attributes.get('rel')?.toLowerCase();
      const url = canonicalUrl(tag.attributes.get('href'), 'link');
      if (rel === 'canonical') {
        if (url.href !== PAGE_URL.href) throw new Error('Selector canonical URL differs from /tour/');
      } else if (rel === 'stylesheet') {
        if (url.origin !== PAGE_URL.origin || url.hash) throw new Error('Selector stylesheet must be a measured local asset');
        const file = payloadPath(url.pathname.slice(1));
        if (!file.endsWith('.css') || !bytesByPath.has(file)) throw new Error(`Selector references a missing stylesheet: ${file}`);
        stylesheets.add(file);
      } else throw new Error(`Selector contains an undeclared link resource: ${rel}`);
    } else if (tag.name === 'img') {
      const url = canonicalUrl(tag.attributes.get('src'), 'image');
      if (url.origin !== PAGE_URL.origin || url.hash || !IMAGES.has(url.pathname)
        || tag.attributes.get('src') !== url.pathname) {
        throw new Error('Selector image must reference a retained canonical prepared preview URL');
      }
      if (!tag.attributes.get('alt')?.trim()) throw new Error('Selector photographs require descriptive alternatives');
      images.add(url.pathname);
    } else if (tag.attributes.has('href') || tag.attributes.has('src')) {
      throw new Error(`Selector contains an undeclared resource element: ${tag.name}`);
    }
  }
  if (destinations.size !== SELECTOR_DESTINATIONS.length) throw new Error('Selector is missing one or more ordinary campus route anchors');
  if (images.size !== IMAGES.size) throw new Error('Selector is missing a retained campus preview image');
  if (!stylesheets.size) throw new Error('Selector must reference its measured stylesheet');
  for (const [file, bytes] of bytesByPath) {
    if (!file.endsWith('.css')) continue;
    if (!stylesheets.has(file)) throw new Error(`Selector contains an unreferenced stylesheet: ${file}`);
    // This static selector has no imported fonts, images, remote styles or CSS execution ports.
    const css = bytes.toString('utf8');
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    if (css.includes('\\') || /@import\b|url\s*\(|expression\s*\(|(?:behavior|-moz-binding)\s*:/i.test(withoutComments)) {
      throw new Error(`Selector stylesheet contains an unmeasured or executable resource: ${file}`);
    }
  }
}

function validateDescriptor(release) {
  exactKeys(release, ['format', 'version', 'owner', 'mountPath', 'source', 'files'], 'selector descriptor');
  if (release.format !== 'umn-vr-selector-release' || release.version !== 1
    || release.owner !== 'UMN-VR/tour' || release.mountPath !== SELECTOR_ROUTE) {
    throw new Error('Unsupported selector release or canonical mount');
  }
  validateSource(release.source);
  if (!Array.isArray(release.files) || release.files.length < 2 || release.files.length > MAX_FILES) throw new Error('Invalid selector file inventory');
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of release.files) {
    exactKeys(entry, ['path', 'bytes', 'sha256'], 'selector file record');
    payloadPath(entry.path);
    if (seen.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE_BYTES
      || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) throw new Error(`Invalid or duplicate selector file record: ${entry.path}`);
    seen.add(entry.path);
    totalBytes += entry.bytes;
  }
  if (totalBytes > MAX_TOTAL_BYTES || !seen.has('tour/index.html')
    || JSON.stringify([...seen].sort()) !== JSON.stringify(release.files.map(file => file.path))) {
    throw new Error('Selector inventory exceeds limits, is unordered, or lacks tour/index.html');
  }
  return release;
}

/** Freeze and validate every input byte before creating a new retained release folder. */
export function writeSelectorRelease({ input, output, source }) {
  validateSource(source);
  const physicalInput = regularDirectory(input);
  const outputAbsolute = path.resolve(output);
  const physicalOutput = path.join(regularDirectory(path.dirname(outputAbsolute)), path.basename(outputAbsolute));
  if (physicalOutput === physicalInput || physicalOutput.startsWith(`${physicalInput}${path.sep}`)) {
    throw new Error('Selector release output must be outside its build input');
  }
  const inputBytes = measure(physicalInput, inventory(physicalInput, inputPath));
  const bytesByPath = new Map([...inputBytes].map(([file, bytes]) => [`tour/${file}`, bytes]));
  const release = validateDescriptor({
    format: 'umn-vr-selector-release', version: 1, owner: 'UMN-VR/tour', mountPath: SELECTOR_ROUTE,
    source: { ...source },
    files: [...bytesByPath].map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: sha256(bytes) })),
  });
  validatePage(bytesByPath.get('tour/index.html')?.toString('utf8') ?? '', bytesByPath, source);
  const descriptor = `${JSON.stringify(release, null, 2)}\n`;
  const descriptorSha256 = sha256(descriptor);
  // No copy rereads: emitted bytes are the exact bytes already measured and checked.
  mkdirSync(physicalOutput, { recursive: false });
  const payload = path.join(physicalOutput, 'payload');
  mkdirSync(payload);
  for (const [file, bytes] of bytesByPath) {
    const destination = path.join(payload, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: 'wx' });
  }
  writeFileSync(path.join(physicalOutput, DESCRIPTOR), descriptor, { flag: 'wx' });
  verifySelectorRelease(physicalOutput, descriptorSha256);
  return { release, descriptorSha256, payload };
}

/** Verify pinned metadata, exact inventory, every payload byte and emitted source identity. */
export function verifySelectorRelease(folder, descriptorSha256) {
  if (!/^[0-9a-f]{64}$/.test(descriptorSha256 ?? '')) throw new Error('An exact selector descriptor SHA-256 pin is required');
  const root = regularDirectory(folder);
  if (JSON.stringify(readdirSync(root).sort()) !== JSON.stringify(['payload', DESCRIPTOR].sort())) {
    throw new Error('Selector release folder inventory mismatch');
  }
  const descriptorFile = path.join(root, DESCRIPTOR);
  const descriptorStat = lstatSync(descriptorFile);
  if (descriptorStat.isSymbolicLink() || !descriptorStat.isFile()) throw new Error('Selector descriptor must be a regular file, not a symlink');
  const descriptor = readFileSync(descriptorFile);
  if (sha256(descriptor) !== descriptorSha256) throw new Error('Selector descriptor digest mismatch');
  const release = validateDescriptor(JSON.parse(descriptor));
  const payload = regularDirectory(path.join(root, 'payload'));
  const files = inventory(payload, payloadPath);
  if (JSON.stringify(files) !== JSON.stringify(release.files.map(file => file.path))) throw new Error('Selector payload inventory mismatch');
  const bytesByPath = measure(payload, files);
  for (const file of release.files) {
    const bytes = bytesByPath.get(file.path);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Selector payload byte or digest mismatch: ${file.path}`);
  }
  validatePage(bytesByPath.get('tour/index.html').toString('utf8'), bytesByPath, release.source);
  return { release, payload, descriptorSha256 };
}
