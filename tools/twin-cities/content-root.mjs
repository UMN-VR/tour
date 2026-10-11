import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** UMN-owned input layout: a public tree always contains tour/twin-cities/. */
export function tourPublicRoot(environment = process.env) {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  return path.resolve(repo, environment.UMN_TOUR_PUBLIC_ROOT?.trim() || 'public');
}

export function tourManifestFile(environment = process.env) {
  return path.join(tourPublicRoot(environment), 'tour/twin-cities/scene.json');
}

/** Optional authoring must not rewrite the installed verified content input. */
export function assertAuthoringOutput(output, environment = process.env) {
  const actualPath = target => {
    let parent = path.resolve(target);
    const tail = [];
    while (!existsSync(parent)) {
      tail.unshift(path.basename(parent));
      parent = path.dirname(parent);
    }
    return path.join(realpathSync(parent), ...tail);
  };
  const logical = path.resolve(output);
  const actual = actualPath(logical);
  if (logical !== actual) throw new Error('Authoring output must not resolve through a symlink');
  if (!environment.UMN_TOUR_PUBLIC_ROOT?.trim()) return;
  const content = actualPath(tourPublicRoot(environment));
  const within = (parent, child) => {
    const value = path.relative(parent, child);
    return value === '' || value !== '..' && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value);
  };
  if (within(content, actual) || within(actual, content)) throw new Error('Authoring output must not overlap the installed verified content tree');
}
