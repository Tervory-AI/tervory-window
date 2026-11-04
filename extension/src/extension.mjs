import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { cli, InputQueue, hunks, selectedDiff } from './session.mjs';

export async function activate(vscode, context) {
  const client = await cli('client.mjs');
  const { CodeFolder, splitDiff, applyDiff, redactSecrets } = await cli('code-tools.mjs');
  const { codeSession } = await cli('code-mode.mjs');
  const store = { get: () => context.secrets.get('tervory.session'), set: value => context.secrets.store('tervory.session', value), remove: () => context.secrets.delete('tervory.session') };
  const documents = new Map();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('tervory-diff', { provideTextDocumentContent: uri => documents.get(uri.toString()) ?? '' }));
  let view; let session; let busy = false; let review; let terminal; let terminalOutput; let approval; let commandText = ""; let lastOutput = ""; let lastReceipt; let attached = "";
  const send = value => view?.webview.postMessage(value);
  const write = value => { const text = client.safe(redactSecrets(String(value))); lastOutput = (lastOutput + text).slice(-65536); send({ type: 'output', text }); };
  function approve(prompt, signal) {
    const action = prompt.startsWith('Run') ? 'Run' : prompt.startsWith('Undo') ? 'Undo' : 'Confirm';
    return new Promise(done => {
      const id = randomBytes(16).toString('hex');
      const finish = allowed => { signal?.removeEventListener('abort', cancel); approval = undefined; done(allowed ? 'y' : 'n'); };
      const cancel = () => finish(false);
      approval = { id, finish };
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) return cancel();
      send({ type: 'approval', id, action, label: action === 'Run' ? 'Waiting for Run' : action, text: action === 'Run' ? commandText : lastOutput });
    });
  }
  const folder = () => {
    const roots = vscode.workspace.workspaceFolders ?? [];
    if (roots.length !== 1 || roots[0].uri.scheme !== 'file') throw Error('Open one local project folder.');
    if (!vscode.workspace.isTrusted) throw Error('Trust this project before running code tools.');
    return roots[0].uri.fsPath;
  };
  async function signIn(selected) {
    const region = ['us-east', 'za'].includes(selected) ? { value: selected } : await vscode.window.showQuickPick([{ label: 'US', value: 'us-east' }, { label: 'ZA', value: 'za' }], { title: 'Trigger sign-in' });
    if (!region) return;
    await client.run(['login', '--region', region.value], { store, io: { interactive: true, write: text => { const code = /Confirm the page shows code ([A-Za-z0-9-]+)\./.exec(String(text)); if (code) send({ type: 'deviceCode', code: code[1] }); }, deviceName: () => 'Tervory desktop', open: url => vscode.env.openExternal(vscode.Uri.parse(url)) } });
  }
  async function reviewEdit(local, patch, signal) {
    const files = splitDiff(patch); const cards = []; let index = 0;
    for (const file of files) {
      // Preview must not replace the original prior-read hash used by edit().
      const current = await local.raw(file.name);
      const before = { exists: current !== null, text: current?.text ?? '' };
      const after = await applyDiff(before.text, file.patch, file.name, !before.exists, local.root);
      const id = randomBytes(16).toString('hex');
      const left = vscode.Uri.parse(`tervory-diff:/${id}/before/${encodeURIComponent(file.name)}`);
      const right = vscode.Uri.parse(`tervory-diff:/${id}/after/${encodeURIComponent(file.name)}`);
      documents.set(left.toString(), before.text ?? ''); documents.set(right.toString(), after);
      const items = hunks(file).map(hunk => ({ index: index++, label: hunk.label, diff: hunk.lines.join('\n') }));
      cards.push({ name: file.name, before: left.toString(), after: right.toString(), hunks: items });
    }
    try {
      send({ type: 'review', files: cards });
      return await new Promise(done => {
        const cancel = () => { review = undefined; done(''); };
        review = { cards, done: selected => { signal.removeEventListener('abort', cancel); review = undefined; done(selectedDiff(files, selected)); } };
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    } finally { for (const card of cards) { documents.delete(card.before); documents.delete(card.after); } }
  }
  async function startCode(text) {
    if (session) { session.input.push(text); return; }
    const input = new InputQueue(); const abort = new AbortController();
    session = { input, abort }; input.push(text);
    const io = {
      interactive: true, signal: abort.signal, write,
      prompt: async prompt => {
        if (prompt === '> ') {
          if (!input.values.length) { busy = false; send({ type: 'ready' }); }
          const value = await input.next();
          if (value !== null) busy = true;
          return value;
        }
        return approve(prompt, abort.signal);
      },
    };
    try {
      const tank = new client.Tank(await client.session(store), fetch, abort.signal);
      await codeSession(tank, folder(), 'auto', io, receipt => { lastReceipt = receipt; send({ type: 'receipt', receipt }); return client.receiptLines(receipt); }, client.safe, {
        createFolder: async root => {
          const local = await CodeFolder.create(root); const tool = local.tool.bind(local);
          local.tool = async (request, toolIO, options) => {
            if (request.name === 'propose_edit') {
              const patch = await reviewEdit(local, request.arguments.diff, abort.signal);
              if (!patch) return { applied: false };
              return tool({ name: 'propose_edit', arguments: { diff: patch } }, { ...toolIO, prompt: async () => abort.signal.aborted ? null : 'y' }, options);
            }
            if (request.name === 'run_command') {
              commandText = client.safe(redactSecrets(request.arguments.command)) + '\nFolder: ' + local.root;
              if (!terminal) {
                terminalOutput = new vscode.EventEmitter();
                terminal = vscode.window.createTerminal({ name: 'Tervory commands', pty: { onDidWrite: terminalOutput.event, open() {}, close() { session?.abort.abort(); terminal = undefined; terminalOutput?.dispose(); terminalOutput = undefined; } } });
              }
              terminal.show(true);
              const commandIO = { ...toolIO, write: value => { toolIO.write(value); terminalOutput?.fire(client.safe(redactSecrets(value)).replace(/\r?\n/g, '\r\n')); } };
              const result = await tool(request, { ...commandIO, prompt: async prompt => { const value = await commandIO.prompt(prompt); if (value === 'y') send({ type: 'command', state: 'running', text: commandText }); return value; } }, options);
              if (result.ran) send({ type: 'command', state: 'finished', text: commandText, code: result.code, output: client.safe(redactSecrets(result.output)) });
              return result;
            }
            return tool(request, toolIO, options);
          };
          return local;
        },
      });
    } finally { input.close(); session = undefined; busy = false; send({ type: 'ready' }); }
  }
  async function ask(text) {
    const local = await CodeFolder.create(folder());
    const files = await local.files();
    const editor = vscode.window.activeTextEditor;
    let contextText = `Project files:\n${JSON.stringify(files)}`;
    if (editor?.document.uri.scheme === 'file') {
      const name = vscode.workspace.asRelativePath(editor.document.uri, false);
      const file = await local.read(name);
      if (file.exists) contextText += `\nOpen file ${name}:\n${file.text}`;
    }
    const abort = new AbortController(); session = { abort, input: new InputQueue() };
    try {
      const tank = new client.Tank(await client.session(store), fetch, abort.signal);
      const thread = (await tank.json('/v1/command/threads', {})).thread_id;
      await client.showTurn(tank, thread, redactSecrets(`${text}\n\n${contextText}`), 'auto', [], {
        interactive: true, signal: abort.signal, write,
        prompt: prompt => approve(prompt, abort.signal),
      });
    } finally { session = undefined; busy = false; send({ type: 'ready' }); }
  }
  const provider = {
    resolveWebviewView(next) {
      view = next;
      const nonce = randomBytes(24).toString('hex');
      view.webview.options = { enableScripts: true, localResourceRoots: [] };
      view.webview.html = html(nonce);
      context.subscriptions.push(view.webview.onDidReceiveMessage(async message => {
        try {
          if (!message || typeof message.type !== 'string') return;
          if (message.type === 'approve' && approval && message.id === approval.id && typeof message.approved === 'boolean') { approval.finish(message.approved); return; }
          if (message.type === 'cancel') { approval?.finish(false); session?.abort.abort(); session?.input.close(); review?.done(new Set()); return; }
          if (message.type === 'signIn') { await signIn(message.region); send({ type: 'auth', signedIn: !!(await store.get()) }); return; }
          if (message.type === 'ready') { send({ type: 'auth', signedIn: !!(await store.get()) }); return; }
          if (message.type === 'newChat') { session?.abort.abort(); session?.input.close(); review?.done(new Set()); send({ type: 'newChat' }); return; }
          if (message.type === 'plugins') {
            if (busy || approval) return;
            busy = true;
            try {
            const abort = new AbortController();
            const tank = new client.Tank(await client.session(store), fetch, abort.signal);
            const tools = await tank.json('/v1/command/tools');
            const items = [];
            if (tools.includes('plugins.list')) {
              const thread = (await tank.json('/v1/command/threads', {})).thread_id;
              const card = await tank.json(`/v1/command/threads/${encodeURIComponent(thread)}/actions`, { tool: 'plugins.list', arguments: {} });
              const io = { interactive: true, signal: abort.signal, write, prompt: prompt => approve(prompt, abort.signal) };
              write(JSON.stringify({ tool: card.tool, arguments: card.arguments ?? {} }) + '\n');
              const confirmed = await client.confirmCard(tank, card, io);
              if (confirmed.status === 'cancelled') return;
              await client.followThread(tank, thread, confirmed, io);
              const snapshot = await tank.json(`/v1/command/threads/${encodeURIComponent(thread)}`);
              const result = snapshot.cards?.find(item => item.card_id === card.card_id)?.result;
              for (const plugin of result?.items ?? []) items.push({ title: plugin.name === 'github' ? 'GitHub' : plugin.name, text: `${plugin.installed ? 'Installed' : plugin.status} · ${plugin.version}` });
            }
            const mcp = tools.filter(tool => tool.startsWith('mcp.') && !tool.startsWith('mcp.servers.'));
            if (mcp.length) items.push({ title: 'MCP', text: mcp.join('\n') });
            send({ type: 'plugins', items: items.map(item => ({ title: client.safe(redactSecrets(item.title)), text: client.safe(redactSecrets(item.text)) })) });
            } finally { busy = false; send({ type: 'ready' }); }
            return;
          }
          if (message.type === 'receipt' && lastReceipt) { const content = client.safe(redactSecrets(JSON.stringify(lastReceipt, null, 2))); const document = await vscode.workspace.openTextDocument({ content, language: 'json' }); await vscode.window.showTextDocument(document); return; }
          if (message.type === 'attach') { const local = await CodeFolder.create(folder()); const file = vscode.window.activeTextEditor?.document.uri; if (file?.scheme === 'file') { const name = vscode.workspace.asRelativePath(file, false); const data = await local.read(name); if (data.exists) { attached = redactSecrets(name + '\n' + data.text); write(attached); } } return; }
          if (message.type === 'signOut') { session?.abort.abort(); session?.input.close(); await client.run(['logout'], { store, io: { write } }); return; }
          if (message.type === 'preview' && review) {
            const card = review.cards.find(card => card.name === message.name);
            if (card) await vscode.commands.executeCommand('vscode.diff', vscode.Uri.parse(card.before), vscode.Uri.parse(card.after), card.name);
            return;
          }
          if (message.type === 'accept' && review && Array.isArray(message.hunks)) {
            const allowed = new Set(review.cards.flatMap(card => card.hunks.map(hunk => hunk.index)));
            if (message.hunks.every(id => Number.isInteger(id) && allowed.has(id))) review.done(new Set(message.hunks));
            return;
          }
          if (!['ask', 'code', 'undo'].includes(message.type) || busy) return;
          let text = message.type === 'undo' ? '/undo' : message.text;
          if (attached && message.type !== 'undo') { text += '\n\n' + attached; attached = ''; }
          if (typeof text !== 'string' || !text.trim() || text.length > 200000) return;
          busy = true;
          if (message.type === 'ask') {
            if (session) throw Error('Finish or stop the code conversation first.');
            await ask(text);
          } else await startCode(text);
        } catch (error) { busy = false; write(error.message); send({ type: 'error', text: client.safe(redactSecrets(error.message)), offline: error.message === 'Tank connection failed.' }); send({ type: 'ready' }); }
      }));
      context.subscriptions.push(view.onDidDispose(() => { approval?.finish(false); session?.abort.abort(); session?.input.close(); review?.done(new Set()); view = undefined; }));
    },
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('tervory.panel', provider));
  context.subscriptions.push(vscode.commands.registerCommand('tervory.focus', () => vscode.commands.executeCommand('tervory.panel.focus')));
  context.subscriptions.push(vscode.commands.registerCommand('tervory.signIn', signIn));
  context.subscriptions.push({ dispose() { approval?.finish(false); session?.abort.abort(); session?.input.close(); terminal?.dispose(); documents.clear(); } });
  return { provider, signIn };
}

export function html(nonce) {
  let result = readFileSync(new URL('./panel.html', import.meta.url), 'utf8').replaceAll('__NONCE__', nonce);
  for (const weight of [400, 600]) {
    const name = `inter-latin-${weight}-normal.woff2`;
    const packaged = new URL('../media/' + name, import.meta.url);
    const path = existsSync(packaged) ? packaged : new URL('../../node_modules/@fontsource/inter/files/' + name, import.meta.url);
    result = result.replace('__FONT' + weight + '__', readFileSync(path).toString('base64'));
  }
  return result;
}
