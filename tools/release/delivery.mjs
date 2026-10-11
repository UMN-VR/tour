/** Campus delivery plans are read-only; publication remains a separate action. */
import { verifyTourRelease } from './artifact.mjs';

/** @typedef {{directory: string, descriptorSha256: string}} ReleaseInput */
/**
 * Validate an app-only additive payload and its retention obligations.
 * Every retained input must be a supported, pinned release rather than a source tree.
 * @param {ReleaseInput & {retained?: ReleaseInput[]}} input
 */
export function planTourAppDelivery({ directory, descriptorSha256, retained = [] }) {
  const { release } = verifyTourRelease(directory, descriptorSha256);
  const mutable = new Set(['tour/twin-cities/index.html', 'foss-earth-sw.js']);
  const current = new Map(release.files.map(file => [file.path, file]));
  const preserve = new Set();
  const manifestIdentity = url => {
    const resolved = new URL(url, 'https://umn-vr.github.io/');
    resolved.hash = '';
    return resolved.href;
  };
  const contents = new Map([[manifestIdentity(release.content.manifestUrl), release.content]]);
  for (const previous of retained) {
    const old = verifyTourRelease(previous.directory, previous.descriptorSha256).release;
    const identity = manifestIdentity(old.content.manifestUrl);
    const selectedContent = contents.get(identity);
    if (selectedContent && (selectedContent.manifestSha256 !== old.content.manifestSha256 || selectedContent.revision !== old.content.revision)) {
      throw new Error('Supported app releases need distinct immutable URLs for different content bytes');
    }
    contents.set(identity, old.content);
    for (const file of old.files) {
      const replacement = current.get(file.path);
      if (!replacement) preserve.add(file.path);
      else if (!mutable.has(file.path) && (replacement.sha256 !== file.sha256 || replacement.bytes !== file.bytes)) {
        throw new Error(`Retained immutable app path would change: ${file.path}`);
      }
    }
  }
  return {
    schemaVersion: 1, owner: 'UMN-VR/tour', kind: 'app', mode: 'additive', dryRun: true,
    descriptorSha256, source: structuredClone(release.source),
    mountPath: release.mountPath, base: release.base, worker: structuredClone(release.worker),
    content: structuredClone(release.content), supportedContent: [...contents.values()].map(content => ({ ...content })),
    files: release.files.map(file => ({ ...file })),
    summary: { files: release.files.length, bytes: release.files.reduce((sum, file) => sum + file.bytes, 0) },
    replaces: [...mutable], retainsFromSuppliedReleases: [...preserve].sort(),
    preserves: 'Every unselected published path, including club landing and prepared media', deletes: [],
  };
}
