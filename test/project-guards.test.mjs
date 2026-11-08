import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { activate } from '../extension/src/extension.mjs';

test('shared panel context preserves rules and guards every unsaved source against project boundaries', async () => {
  const base = await mkdtemp(join(tmpdir(), 'opli-context-guards-'));
  const root = join(base, 'project'); const other = join(base, 'other');
  await mkdir(join(root, '.tervory'), { recursive: true }); await mkdir(other);
  execFileSync('git', ['init', '-q', root]);
  const uri = fsPath => ({ scheme: 'file', fsPath, toString: () => `file://${fsPath}` });
  const rootUri = uri(root); let trusted = true; let readScope;
  const api = {
    getRepositoryMap: async (query, options) => {
      readScope = options.workspaceUri;
      return [{ path: 'safe.ts', startLine: 1, endLine: 1, text: 'stale cached text' },
        { path: '../other/foreign.ts', startLine: 1, endLine: 1, text: 'external cached text' },
        { path: '.env', startLine: 1, endLine: 1, text: 'private cached text' }];
    },
    hasSource: async (file, scope) => scope === rootUri.toString() && !['ignored.ts', 'private.ts'].includes(file),
  };
  const disposable = () => ({ dispose() {} });
  const vscode = { workspace: { get isTrusted() { return trusted; }, workspaceFolders: [{ uri: rootUri }], registerTextDocumentContentProvider: disposable },
    extensions: { getExtension: () => ({ activate: async () => api }) },
    window: { registerWebviewViewProvider: disposable }, commands: { registerCommand: disposable } };
  const context = { subscriptions: [], secrets: {} };
  try {
    await writeFile(join(root, '.tervory/rules'), 'Use clear names. Run existing tests.');
    await writeFile(join(root, 'safe.ts'), 'export function correctBoundary() {}\n');
    await writeFile(join(root, 'binary.ts'), Buffer.from([0, 65]));
    await writeFile(join(root, '.env'), 'private fixture');
    await writeFile(join(other, 'foreign.ts'), 'export const otherProject = true;');
    await symlink(other, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const panel = await activate(vscode, context);
    const first = await panel.projectContext(rootUri, 'correctBoundary');
    assert.equal(readScope, rootUri.toString());
    assert.equal(first.rules, 'Use clear names. Run existing tests.');
    assert.deepEqual(first.tabs, [{ path: 'safe.ts', text: 'export function correctBoundary() {}' }]);
    assert.equal(await panel.projectSource(rootUri, uri(join(root, 'safe.ts')), 'export const unsaved = true;'), 'export const unsaved = true;');
    await assert.rejects(panel.projectSource(rootUri, uri(join(root, 'safe.ts')), `const apiKey = "${'placeholder'.repeat(3)}";`), /refused/);
    for (const file of ['../other/foreign.ts', '.env', '.git/config', 'binary.ts', 'linked/foreign.ts', 'ignored.ts', 'private.ts']) {
      await assert.rejects(panel.projectSource(rootUri, uri(join(root, file)), 'fixture source'), /refused/);
    }
    await assert.rejects(panel.projectSource(uri(other), uri(join(other, 'foreign.ts')), 'other project'), /refused/);
    await writeFile(join(root, '.tervory/rules'), 'Updated project rule.');
    assert.equal((await panel.projectContext(rootUri, 'correctBoundary')).rules, 'Updated project rule.');
    trusted = false;
    await assert.rejects(panel.projectContext(rootUri, 'correctBoundary'), /Trust/);
    await assert.rejects(panel.projectSource(rootUri, uri(join(root, 'safe.ts')), 'source'), /refused/);
  } finally { for (const item of context.subscriptions) item.dispose(); await rm(base, { recursive: true, force: true }); }
});
