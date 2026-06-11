import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'dbfiles-'));
process.env.DB_FOLDER = dir + '/';

const { resolveDbDataPath } = await import('./db-files.ts');

test('resolves .gz as gzipped JSON', async () => {
  await writeFile(join(dir, 'jsonzone.gz'), Buffer.from('gz'));
  const r = await resolveDbDataPath('jsonzone');
  assert.equal(r.gzipped, true);
  assert.ok(r.path.endsWith('jsonzone.gz'));
});

test('resolves .bin as raw (not gzipped) binary patterns', async () => {
  await writeFile(join(dir, 'binzone.bin'), Buffer.from('DLNOPAT1...'));
  const r = await resolveDbDataPath('binzone');
  assert.equal(r.gzipped, false);
  assert.ok(r.path.endsWith('binzone.bin'));
});

test('.gz wins when both exist (single-format per zone in practice)', async () => {
  await writeFile(join(dir, 'both.gz'), Buffer.from('gz'));
  await writeFile(join(dir, 'both.bin'), Buffer.from('DLNOPAT1'));
  const r = await resolveDbDataPath('both');
  assert.ok(r.path.endsWith('both.gz'));
});

test.after(async () => {
  await rm(dir, { recursive: true, force: true });
});
