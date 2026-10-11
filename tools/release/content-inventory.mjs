#!/usr/bin/env node
/** Byte-preservation inventory only. Scene validation belongs to the shared scenes package. */
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function inventoryContent(root) {
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) throw new Error(`Non-regular content: ${relative}`);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else {
        const bytes = readFileSync(path.join(directory, entry.name));
        files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  };
  if (lstatSync(root).isSymbolicLink()) throw new Error('Content root must not be a symlink');
  visit(root);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const tree = createHash('sha256');
  for (const file of files) tree.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  return { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), treeSha256: tree.digest('hex'), inventory: files };
}

// Preserve evidence; no deletion/overwriting and no private-source discovery.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [content, baseline, output] = process.argv.slice(2);
  if (!content || !baseline || !output || process.argv.length !== 5) {
    throw new Error('Usage: node tools/release/content-inventory.mjs CONTENT_DIR BASELINE_JSON NEW_EVIDENCE_JSON');
  }
  const expected = JSON.parse(readFileSync(baseline, 'utf8')).generated;
  const result = inventoryContent(content);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  if (['files', 'bytes', 'treeSha256'].some(key => result[key] !== expected[key])) {
    throw new Error(`Content differs from the captured baseline; evidence retained in ${output}`);
  }
  console.log(JSON.stringify({ files: result.files, bytes: result.bytes, treeSha256: result.treeSha256 }));
}
