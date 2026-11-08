import test from 'node:test';
import assert from 'node:assert/strict';
import { completePanelAction } from './panel-completion.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async predicate => { for (let n = 0; n < 20; n++) { if (predicate()) return; await tick(); } throw Error('Fixture completion missing'); };

test('queued undo waits for a new ready event without opening files during the transaction', async () => {
  const events = [{ type: 'ready' }]; let active = false; const reads = [];
  await completePanelAction({ events, until, approval: 'Undo', files: [{ path: 'one.txt', expected: 'old\n' }, { path: 'two.txt', expected: 'old\n' }],
    send: async () => { active = true; events.push({ type: 'approval', action: 'Undo' }); setImmediate(() => { active = false; events.push({ type: 'ready' }); }); },
    read: async path => { assert.equal(active, false, 'a file handle must not overlap the atomic mutation'); reads.push(path); return 'old\n'; } });
  assert.deepEqual(reads, ['one.txt', 'two.txt']);
});

test('guarded refusal fails promptly after completion and cannot be hidden by old file bytes', async () => {
  const events = []; let reads = 0;
  await assert.rejects(completePanelAction({ events, until, approval: 'Undo', files: [{ path: 'one.txt', expected: 'old\n' }],
    send: async () => events.push({ type: 'approval', action: 'Undo' }, { type: 'output', text: 'Code tool refused.\n' }, { type: 'ready' }),
    read: async () => { reads++; return 'old\n'; } }), /Panel action refused/);
  assert.equal(reads, 0);
});

test('completion preserves approval and exact file assertions', async () => {
  await assert.rejects(completePanelAction({ events: [], until, approval: 'Undo', files: [], send: async () => {} }), /completion missing/);
  const events = [];
  await assert.rejects(completePanelAction({ events, until, approval: 'Undo', files: [], send: async () => events.push({ type: 'ready' }) }), /approval was not requested/);
  const output = [];
  await assert.rejects(completePanelAction({ events: output, until, files: [{ path: 'one.txt', expected: 'old\n' }],
    send: async () => output.push({ type: 'ready' }), read: async () => 'new\n' }), /one.txt/);
});

test('a reader sharing violation reproduces guarded undo refusal; completion-first reads avoid it', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { cli } = await import('../extension/src/session.mjs');
  const { CodeFolder } = await cli('code-tools.mjs');
  const root = await mkdtemp(join(tmpdir(), 'panel-undo-sharing-'));
  execFileSync('git', ['init', '-q', root]);
  const path = join(root, 'one.txt');
  try {
    await writeFile(path, 'old\n');
    const local = await CodeFolder.create(root);
    await local.read('one.txt');
    const io = { interactive: true, write() {}, prompt: async () => 'y' };
    await local.edit(undefined, '--- a/one.txt\n+++ b/one.txt\n@@ -1 +1 @@\n-old\n+new\n', io);
    const rename = local.renameFile.bind(local);
    let readerHeld = false; let refusals = 0; let release;
    const reached = new Promise(resolve => { release = resolve; });
    local.renameFile = async (...args) => {
      if (readerHeld) {
        refusals++; release();
        const error = new Error('Injected Windows sharing violation'); error.code = 'EPERM'; throw error;
      }
      return rename(...args);
    };
    // The former fixture polls immediately after enqueueing the undo.
    const undo = local.undo(io);
    readerHeld = true;
    await reached; readerHeld = false;
    await assert.rejects(undo, /Code tool refused/);
    assert.equal(await readFile(path, 'utf8'), 'new\n', 'the guard preserves the edited file on refusal');
    const events = []; let mutation;
    await completePanelAction({ events, until: async predicate => { await mutation; assert(predicate()); }, approval: 'Undo',
      files: [{ path, expected: 'old\n' }],
      send: async () => {
        mutation = local.undo({ ...io, prompt: async () => { events.push({ type: 'approval', action: 'Undo' }); return 'y'; } })
          .finally(() => events.push({ type: 'ready' }));
      },
      read: async (...args) => { readerHeld = true; try { return await readFile(...args); } finally { readerHeld = false; } },
    });
    assert.equal(refusals, 1, 'completion-first verification does not contend with the mutation');
  } finally { await rm(root, { recursive: true, force: true }); }
});
