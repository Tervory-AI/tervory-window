import * as vscode from 'vscode';
import { Tank, run, session, safe, receiptLines } from '@tervory/cli-client';

const config = () => vscode.workspace.getConfiguration('tervory.complete');
const PATH = '/v1/command/complete';
const decoder = new TextDecoder();
const delay = (ms, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
});

export async function contextFor(document, position, selection) {
  const root = vscode.workspace.getWorkspaceFolder(document.uri);
  let rules = '';
  if (root) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root.uri, '.tervory', 'rules'));
      rules = decoder.decode(bytes);
      if (rules.length > 12000) throw new Error('Project rules exceed the limit');
    } catch (error) {
      if (error.code !== 'FileNotFound') throw error;
    }
  }
  const text = document.getText();
  const start = selection ? document.offsetAt(selection.start) : document.offsetAt(position);
  const end = selection ? document.offsetAt(selection.end) : start;
  const group = vscode.window.tabGroups.all.find(g => g.tabs.some(t => t.input?.uri?.toString() === document.uri.toString()));
  const ordered = group?.tabs ?? [];
  const current = ordered.findIndex(t => t.input?.uri?.toString() === document.uri.toString());
  const neighbors = ordered.map((tab, i) => ({ tab, distance: Math.abs(i - current) }))
    .filter(({ tab }) => tab.input?.uri && tab.input.uri.toString() !== document.uri.toString())
    .sort((a, b) => a.distance - b.distance);
  const tabs = [];
  for (const { tab } of neighbors) {
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === tab.input.uri.toString());
    if (!doc || !root || vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.toString() !== root.uri.toString()) continue;
    tabs.push({ path: vscode.workspace.asRelativePath(doc.uri).slice(0, 500), text: doc.getText().slice(0, 4000) });
    if (tabs.length === 3) break;
  }
  return { prefix: text.slice(Math.max(0, start - 12000), start), suffix: text.slice(end, end + 8000),
    language: document.languageId, rules, tabs, ...(selection ? { selection: text.slice(start, end) } : {}) };
}

export async function activate(context) {
  const output = vscode.window.createOutputChannel('Tervory');
  const store = { get: () => context.secrets.get('cli-session'), set: value => context.secrets.store('cli-session', value),
    remove: () => context.secrets.delete('cli-session') };
  let transport = fetch;
  let credentialStore = store;
  let active;
  let epoch = 0;
  const cancel = () => { epoch++; active?.abort(); active = undefined; };
  const changed = vscode.workspace.onDidChangeTextDocument(cancel);
  const moved = vscode.window.onDidChangeTextEditorSelection(cancel);
  const switched = vscode.window.onDidChangeActiveTextEditor(cancel);
  const io = { interactive: true, write: text => output.append(safe(text)),
    open: url => vscode.env.openExternal(vscode.Uri.parse(url)),
    deviceName: () => 'tervory-window', prompt: prompt => vscode.window.showInputBox({ prompt }) };

  async function call(payload, signal, timeoutMs) {
    // Authentication, refresh and response parsing all share the short deadline.
    const deadline = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, deadline]);
    const boundedTransport = (url, options) => transport(url, { ...options,
      signal: options?.signal ? AbortSignal.any([options.signal, combined]) : combined });
    const request = async () => {
      const token = await session(credentialStore, boundedTransport);
      const result = await new Tank(token, boundedTransport, combined).json(PATH, payload);
      if (!['ok', 'ask', 'rejected'].includes(result?.status) || typeof result.text !== 'string'
          || result.text.length > (payload.mode === 'edit' ? 16000 : 8000) || !Array.isArray(result.receipts)) {
        throw new Error('Invalid completion');
      }
      for (const receipt of result.receipts) output.appendLine(receiptLines({ rows: [receipt] }).map(safe).join('\n'));
      return result;
    };
    // Bound even a stuck secret-store read or a transport ignoring abort.
    let abort;
    try {
      return await Promise.race([request(), new Promise((_, reject) => {
        abort = () => reject(new Error('Completion stopped'));
        if (combined.aborted) abort();
        else combined.addEventListener('abort', abort, { once: true });
      })]);
    } finally { combined.removeEventListener('abort', abort); }
  }

  const provider = { async provideInlineCompletionItems(document, position, inlineContext, token) {
    cancel();
    if (!vscode.workspace.isTrusted || !config().get('enabled') || document.uri.scheme !== 'file') return [];
    // Ask has no popup while typing. The explicit Complete command asks once.
    if (config().get('paidMode') !== 'auto' && !explicit) return [];
    const confirmed = explicit;
    explicit = false;
    const version = document.version;
    const generation = epoch;
    const stop = new AbortController(); active = stop;
    const listener = token.onCancellationRequested(() => stop.abort());
    if (token.isCancellationRequested) stop.abort();
    try {
      await delay(120, stop.signal);
      const payload = await contextFor(document, position);
      if (stop.signal.aborted) return [];
      const result = await call({ ...payload, mode: 'complete', paid_mode: config().get('paidMode'), confirmed }, stop.signal, 1800);
      if (stop.signal.aborted || version !== document.version || generation !== epoch || result.status !== 'ok' || !result.text) return [];
      return [new vscode.InlineCompletionItem(result.text, new vscode.Range(position, position))];
    } catch { return []; }
    finally { listener.dispose(); if (active === stop) active = undefined; }
  } };
  let explicit = false;
  const register = (name, handler) => context.subscriptions.push(vscode.commands.registerCommand(`tervory.complete.${name}`, handler));
  register('signIn', async () => {
    try { await run(['login', '--region', config().get('region')], { store, transport, io }); }
    catch { vscode.window.showErrorMessage('Sign in failed'); }
  });
  register('signOut', async () => { cancel(); await run(['logout'], { store, transport, io }); });
  register('togglePaid', async () => {
    const mode = await vscode.window.showQuickPick(['ask', 'auto'], { title: 'Ask / Auto' });
    if (mode) { cancel(); await config().update('paidMode', mode, vscode.ConfigurationTarget.Global); }
  });
  register('request', async () => {
    if (config().get('paidMode') !== 'auto'
        && await vscode.window.showWarningMessage('Allow this request?', { modal: true }, 'Allow') !== 'Allow') return;
    explicit = true;
    try { await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger'); }
    finally { explicit = false; }
  });
  context.subscriptions.push(output, changed, moved, switched, { dispose: cancel },
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('tervory.complete')) cancel(); }),
    vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, provider));
  return { provider, contextFor,
    // Injection exists only for the extension-test host, never a setting or command.
    configureTest: context.extensionMode === vscode.ExtensionMode.Test ? options => {
      transport = options.transport; credentialStore = options.store;
    } : undefined };
}
