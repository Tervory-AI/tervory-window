import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assemble, notes, TARGETS } from '../build/release.mjs';
import { signingPlan } from '../build/signing.mjs';

const installer = target => target.startsWith('darwin') ? `opli-code-${target}.dmg` : target.startsWith('win32') ? `opli-code-${target}-setup.exe` : `opli-code_0.1.0_${target.endsWith('x64') ? 'amd64' : 'arm64'}.deb`;

test('the draft release holds all six installers, their archives and one checksum list', async () => {
  const base = await mkdtemp(join(tmpdir(), 'opli-release-'));
  try {
    for (const target of TARGETS) {
      const folder = join(base, 'artifacts', `opli-code-${target}-unsigned`); await mkdir(folder, { recursive: true });
      await writeFile(join(folder, installer(target)), 'installer ' + target);
      await writeFile(join(folder, `opli-code-${target}.tar.gz`), 'archive ' + target);
      await writeFile(join(folder, 'build.json'), JSON.stringify({ signed: target === 'darwin-arm64' }));
      await writeFile(join(folder, 'SHA256SUMS'), 'per-build list is replaced');
    }
    const result = await assemble(join(base, 'artifacts'), join(base, 'release'), '0.1.0');
    assert.equal(result.builds.length, 6);
    const sums = (await readFile(join(base, 'release/SHA256SUMS'), 'utf8')).trim().split('\n');
    assert.equal(sums.length, 12);
    for (const line of sums) {
      const [hash, name] = line.split('  ');
      assert.equal(hash, createHash('sha256').update(await readFile(join(base, 'release', name))).digest('hex'));
    }
    const text = await readFile(join(base, 'release/NOTES.md'), 'utf8');
    for (const target of TARGETS) assert(text.includes(installer(target)));
    assert.match(text, /Privacy & Security/); assert.match(text, /More info → Run anyway/); assert.match(text, /apt install/);
    assert.match(text, /darwin-arm64 \(signed\)/); assert.match(text, /darwin-x64 \(unsigned\)/);
    await rm(join(base, 'artifacts', 'opli-code-win32-arm64-unsigned', installer('win32-arm64')));
    await assert.rejects(assemble(join(base, 'artifacts'), join(base, 'again'), '0.1.0'), /Missing installer for win32-arm64/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('signed notes drop the unsigned instructions', () => {
  const text = notes('0.1.0', TARGETS.map(target => ({ target, signed: true, files: [installer(target)] })));
  assert(!text.includes('Run anyway')); assert(!text.includes('Open Anyway')); assert.match(text, /signed and notarised/);
});

test('signing runs only when its settings exist', () => {
  assert.deepEqual(signingPlan({}, 'darwin'), { platform: 'darwin', signed: false });
  assert.deepEqual(signingPlan({}, 'win32'), { platform: 'win32', signed: false });
  assert.deepEqual(signingPlan({ OPLI_MAC_IDENTITY: 'ABC' }, 'darwin'), { platform: 'darwin', signed: true, identity: 'ABC', notarize: false });
  assert.equal(signingPlan({ OPLI_MAC_IDENTITY: 'ABC', APPLE_NOTARY_APPLE_ID: 'a', APPLE_NOTARY_PASSWORD: 'b', APPLE_NOTARY_TEAM_ID: 'c' }, 'darwin').notarize, true);
  assert.equal(signingPlan({ OPLI_WINDOWS_CERTIFICATE_FILE: 'cert' }, 'win32').signed, false, 'a certificate without its password stays unsigned');
  assert.equal(signingPlan({ OPLI_WINDOWS_CERTIFICATE_FILE: 'cert', WINDOWS_CERTIFICATE_PASSWORD: 'x' }, 'win32').signed, true);
  assert.equal(signingPlan({ OPLI_MAC_IDENTITY: 'ABC' }, 'linux').signed, false);
});
