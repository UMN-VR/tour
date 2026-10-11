import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { inventoryContent } from './content-inventory.mjs';

mkdirSync('.local/checks', { recursive: true });
test('content baseline records exact bytes and a path-sensitive deterministic tree digest', () => {
  const root = mkdtempSync(path.resolve('.local/checks/content-'));
  writeFileSync(path.join(root, 'z.jpg'), 'last');
  writeFileSync(path.join(root, 'a.json'), '{}');
  const result = inventoryContent(root);
  assert.equal(result.files, 2);
  assert.equal(result.bytes, 6);
  assert.deepEqual(result.inventory.map(file => file.path), ['a.json', 'z.jpg']);
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(result.treeSha256, hash(`a.json\0${2}\0${hash('{}')}\nz.jpg\0${4}\0${hash('last')}\n`));
  writeFileSync(path.join(root, 'z.jpg'), 'same length');
  assert.notEqual(inventoryContent(root).treeSha256, result.treeSha256);
});
test('does not follow content symlinks into local source or unrelated evidence', () => {
  const root = mkdtempSync(path.resolve('.local/checks/content-link-'));
  symlinkSync(path.resolve('.local'), path.join(root, 'private'));
  assert.throws(() => inventoryContent(root), /Non-regular/);
});
