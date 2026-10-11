import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
// Runtime-free selector published by the club. No Earth wrapper.
export default defineConfig(() => {
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', ...args], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  const dirty = Boolean(git('status', '--porcelain'));
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const builtAt = new Date().toISOString();
  return {
    base: '/tour/', publicDir: false,
    build: { outDir: 'dist', emptyOutDir: false, rollupOptions: { input: 'index.html' } },
    plugins: [{ name: 'umn-selector-build-stamps', transformIndexHtml: () => Object.entries({
      'umn-vr-selector-source': `${commit};dirty=${dirty}`,
      'umn-vr-selector-package-version': version,
      'umn-vr-selector-build': builtAt,
    }).map(([name, content]) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' as const })) }],
  };
});
