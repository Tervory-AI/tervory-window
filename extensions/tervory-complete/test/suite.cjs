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
  const open = async name => {
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, name);
    return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
  };
  try {
    await config.update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('editor').update('inlineSuggest.enabled', false, vscode.ConfigurationTarget.Global);
    await config.update('paidMode', 'ask', vscode.ConfigurationTarget.Global);
    await open('near.js');
    let editor = await open('main.js');
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
    await require('node:fs/promises').writeFile(process.env.TERVORY_TEST_RESULT, 'passed');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
};
