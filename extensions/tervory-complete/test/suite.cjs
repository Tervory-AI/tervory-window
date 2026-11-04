const assert = require('node:assert/strict');
const http = require('node:http');
const vscode = require('vscode');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.run = async () => {
  const calls = [];
  const token = 'tv1.us-east.' + '1'.repeat(32) + '.' + 'a'.repeat(43);
  let behavior = 'ok';
  let replacement = 'return 42;';
  let disconnected = false;
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); calls.push(body);
    assert.equal(req.url, '/v1/command/complete');
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    if (behavior === 'slow') {
      res.on('close', () => { disconnected = true; });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', text: body.mode === 'edit' ? replacement : 'return 42;\n  // done',
      receipts: [{ ledger_id: 'fake-ledger', tokens_in: 5, tokens_out: 3, cost_usd: 0, baseline_cost_usd: null, saved_usd: null }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const extension = vscode.extensions.getExtension('tervory.tervory-complete');
  const api = await extension.activate();
  assert.equal(typeof api.configureTest, 'function');
  api.configureTest({ store: { get: async () => token }, transport: (url, opts) => fetch(base + new URL(url).pathname, opts) });
  const config = vscode.workspace.getConfiguration('tervory.complete');
  const open = async (name, options = {}) => {
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, name);
    return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false, ...options });
  };
  try {
    await config.update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('editor').update('inlineSuggest.enabled', false, vscode.ConfigurationTarget.Global);
    await config.update('paidMode', 'ask', vscode.ConfigurationTarget.Global);
    await open('near.js');
    await open('split.js', { viewColumn: vscode.ViewColumn.Two });
    let editor = await open('main.js', { viewColumn: vscode.ViewColumn.One });
    const pos = new vscode.Position(1, 2);
    editor.selection = new vscode.Selection(pos, pos);
    await wait(150);
    let cts = new vscode.CancellationTokenSource();
    assert.deepEqual(await api.provider.provideInlineCompletionItems(editor.document, pos, {}, cts.token), []);
    assert.equal(calls.length, 0, 'Ask typing must not spend');
    await config.update('paidMode', 'auto', vscode.ConfigurationTarget.Global);
    await wait(500);
    const items = await api.provider.provideInlineCompletionItems(editor.document, pos, {}, cts.token);
    assert(items.length, `Expected ghost text; calls=${calls.length}, enabled=${config.get('enabled')}, trusted=${vscode.workspace.isTrusted}, version=${editor.document.version}`);
    assert.equal(items[0].insertText, 'return 42;\n  // done');
    assert.equal(calls.at(-1).rules, 'Use clear names.');
    assert(calls.at(-1).tabs.some(tab => tab.text.includes('nearby')));
    assert(calls.at(-1).tabs.some(tab => tab.text.includes('splitContext')), 'split editor tabs contribute context');
    assert.equal(new Set(calls.at(-1).tabs.map(tab => tab.path)).size, calls.at(-1).tabs.length);
    assert(calls.at(-1).prefix.includes('function answer'));
    assert(calls.at(-1).suffix.includes('}'));
    // Exercise the actual registered provider and editor's Tab-accept command.
    await vscode.workspace.getConfiguration('editor').update('inlineSuggest.enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    const acceptDeadline = Date.now() + 10000;
    while (!editor.document.getText().includes('return 42;') && Date.now() < acceptDeadline) {
      await vscode.commands.executeCommand('editor.action.inlineSuggest.commit'); await wait(100);
    }
    await vscode.workspace.getConfiguration('editor').update('inlineSuggest.enabled', false, vscode.ConfigurationTarget.Global);
    assert(editor.document.getText().includes('return 42;\n  // done'));
    await vscode.commands.executeCommand('undo');
    await wait(100);
    behavior = 'slow';
    const before = calls.length;
    const pending = api.provider.provideInlineCompletionItems(editor.document, pos, {}, cts.token);
    while (calls.length === before) await wait(20);
    await vscode.commands.executeCommand('type', { text: 'x' });
    assert.deepEqual(await pending, []);
    await wait(100);
    assert(disconnected, 'keypress must close fake Tank request');
    behavior = 'ok';
    console.log('PASS autocomplete: ghost text, acceptance, nearest tabs, rules, Ask, keypress cancellation');
    await config.update('enabled', false, vscode.ConfigurationTarget.Global);
    const document = editor.document;
    const reset = new vscode.WorkspaceEdit();
    reset.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), 'function answer() {\n  return 1;\n}\n');
    await vscode.workspace.applyEdit(reset);
    const select = async () => {
      editor = await vscode.window.showTextDocument(document);
      editor.selection = new vscode.Selection(1, 2, 1, 11);
      await wait(100);
    };
    await select();
    const original = document.getText();
    await vscode.commands.executeCommand('tervory.complete.inlineEdit', 'Return forty two');
    let proposal = api.edit.getPending();
    assert(proposal, 'inline edit should open a review');
    const reviewDoc = await vscode.workspace.openTextDocument(proposal.after);
    assert.equal(reviewDoc.languageId, 'tervory-review');
    assert.equal(vscode.workspace.getConfiguration('diffEditor', { uri: proposal.after, languageId: reviewDoc.languageId }).get('renderSideBySide'), false);
    assert.equal(document.getText(), original, 'preview cannot mutate source');
    assert.equal(calls.at(-1).mode, 'edit');
    assert.equal(calls.at(-1).selection, 'return 1;');
    assert.equal(calls.at(-1).rules, 'Use clear names.');
    const lens = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', proposal.after);
    assert.deepEqual(lens.map(item => item.command.title), ['Accept', 'Reject']);
    assert(vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputTextDiff)));
    await vscode.commands.executeCommand(lens[0].command.command, ...lens[0].command.arguments);
    assert(document.getText().includes('return 42;'));
    assert.equal(await vscode.commands.executeCommand('tervory.complete.acceptEdit'), false, 'accept only once');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), original, 'accept is one undoable editor edit');
    await select();
    await vscode.commands.executeCommand('tervory.complete.inlineEdit', 'Return forty two');
    await vscode.commands.executeCommand('tervory.complete.rejectEdit', api.edit.getPending().after);
    assert.equal(document.getText(), original, 'reject leaves source untouched');
    await select();
    await vscode.commands.executeCommand('tervory.complete.inlineEdit', 'Return forty two');
    const stale = new vscode.WorkspaceEdit(); stale.insert(document.uri, new vscode.Position(0, 0), '// changed\n');
    await vscode.workspace.applyEdit(stale);
    assert.equal(await vscode.commands.executeCommand('tervory.complete.acceptEdit'), false);
    assert(!document.getText().includes('42'), 'stale proposals must not overwrite newer edits');
    await vscode.commands.executeCommand('undo');
    replacement = '';
    await select();
    await vscode.commands.executeCommand('tervory.complete.inlineEdit', 'Delete selection');
    await vscode.commands.executeCommand('tervory.complete.acceptEdit');
    assert(!document.getText().includes('return'), 'empty replacement deletes selection');
    console.log('PASS inline edit: selected context, rules, native diff, Accept/Reject, undo, stale guard, deletion');
    const rulesUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.tervory', 'rules');
    await vscode.workspace.fs.writeFile(rulesUri, Buffer.from('Updated project rule.'));
    assert.equal((await api.contextFor(document, new vscode.Position(0, 0))).rules, 'Updated project rule.');
    await vscode.workspace.fs.delete(rulesUri);
    assert.equal((await api.contextFor(document, new vscode.Position(0, 0))).rules, '');
    await vscode.workspace.fs.writeFile(rulesUri, Buffer.from('x'.repeat(12001)));
    await assert.rejects(api.contextFor(document, new vscode.Position(0, 0)), /rules exceed/);
    console.log('PASS project rules: re-read on request, missing file, oversize fails closed');
    await require('node:fs/promises').writeFile(process.env.TERVORY_TEST_RESULT, 'passed');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
};
