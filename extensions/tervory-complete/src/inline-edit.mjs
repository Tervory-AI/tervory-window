import * as vscode from 'vscode';

// Read-only virtual documents let the editor render a native inline diff while
// the source stays untouched until Accept. No shell, webview or file writes.
export function installInlineEdit(context, { call, contextFor, paidMode }) {
  let pending;
  let running;
  let sequence = 0;
  const documents = new Map();
  const changes = new vscode.EventEmitter();
  const lenses = new vscode.EventEmitter();
  const scheme = 'tervory-edit';
  const clear = () => {
    pending = undefined;
    documents.clear();
    lenses.fire();
    vscode.commands.executeCommand('setContext', 'tervory.complete.hasEdit', false);
  };
  const preview = {
    onDidChange: changes.event,
    provideTextDocumentContent: uri => documents.get(uri.toString()) ?? '',
  };
  const review = {
    onDidChangeCodeLenses: lenses.event,
    provideCodeLenses: document => {
      if (!pending || document.uri.toString() !== pending.after.toString()) return [];
      const range = new vscode.Range(pending.range.start.line, 0, pending.range.start.line, 0);
      return ['Accept', 'Reject'].map(title => new vscode.CodeLens(range, {
        title, tooltip: 'Review the diff in place before applying it.', command: `tervory.complete.${title.toLowerCase()}Edit`, arguments: [pending.id],
      }));
    },
  };
  async function propose(instruction) {
    const editor = vscode.window.activeTextEditor;
    if (!vscode.workspace.isTrusted || !editor || editor.document.uri.scheme !== 'file' || editor.selection.isEmpty) return;
    if (editor.document.getText(editor.selection).length > 16000) {
      vscode.window.showErrorMessage('Selection exceeds the limit'); return;
    }
    running?.abort();
    const stop = new AbortController(); running = stop;
    const document = editor.document;
    const version = document.version;
    const range = new vscode.Range(editor.selection.start, editor.selection.end);
    const source = document.getText();
    const changed = vscode.workspace.onDidChangeTextDocument(event => { if (event.document === document) stop.abort(); });
    const closed = vscode.workspace.onDidCloseTextDocument(doc => { if (doc === document) stop.abort(); });
    try {
      instruction ??= await vscode.window.showInputBox({ title: 'Inline edit', prompt: 'Describe the change for the selected code.',
        placeHolder: 'Describe edit', ignoreFocusOut: true });
      if (!instruction?.trim() || instruction.length > 2000 || stop.signal.aborted) return;
      const mode = paidMode();
      const confirmed = mode === 'auto' || await vscode.window.showWarningMessage(
        'Allow this request?', { modal: true }, 'Allow') === 'Allow';
      if (!confirmed || stop.signal.aborted) return;
      const payload = await contextFor(document, range.start, range);
      if (stop.signal.aborted) return;
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
        title: 'Propose edit', cancellable: true }, async (_, token) => {
        const listener = token.onCancellationRequested(() => stop.abort());
        try { return await call({ ...payload, mode: 'edit', instruction, paid_mode: mode, confirmed }, stop.signal, 8500); }
        finally { listener.dispose(); }
      });
      if (stop.signal.aborted || document.version !== version || result.status !== 'ok') return;
      clear();
      const id = ++sequence;
      const before = vscode.Uri.from({ scheme, path: `/${id}/before/${document.uri.path.split('/').pop()}` });
      const after = vscode.Uri.from({ scheme, path: `/${id}/after/${document.uri.path.split('/').pop()}` });
      const proposed = source.slice(0, document.offsetAt(range.start)) + result.text + source.slice(document.offsetAt(range.end));
      documents.set(before.toString(), source);
      documents.set(after.toString(), proposed);
      // Language-scoped defaults affect only these read-only review documents.
      // vscode.diff drops nonstandard options such as renderSideBySide.
      for (const uri of [before, after]) {
        await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(uri), 'tervory-review');
      }
      pending = { id, document, version, range, replacement: result.text, after };
      await vscode.commands.executeCommand('setContext', 'tervory.complete.hasEdit', true);
      await vscode.commands.executeCommand('vscode.diff', before, after, 'Inline edit', {
        preview: true, viewColumn: editor.viewColumn,
        selection: new vscode.Range(range.start, range.start),
      });
      lenses.fire();
    } catch {
      if (!stop.signal.aborted) vscode.window.showErrorMessage('Change failed');
    } finally {
      changed.dispose(); closed.dispose();
      if (running === stop) running = undefined;
    }
  }
  async function finish(accept, id) {
    const proposal = pending;
    if (!proposal) return false;
    if (typeof id === 'number' && id !== proposal.id) return false;
    // Editor-title actions supply the clicked resource URI; CodeLens uses an ID.
    if (id instanceof vscode.Uri && id.toString() !== proposal.after.toString()) return false;
    if (accept) {
      // Any intervening edit, even an undo, invalidates the snapshot.
      if (proposal.document.isClosed || proposal.document.version !== proposal.version) {
        clear();
        if (!proposal.document.isClosed) await vscode.window.showTextDocument(proposal.document, { preview: false });
        vscode.window.showErrorMessage('Selection changed'); return false;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(proposal.document.uri, proposal.range, proposal.replacement);
      // Clear before the apply event to prevent a second acceptance.
      clear();
      if (!await vscode.workspace.applyEdit(edit)) return false;
    } else clear();
    await vscode.window.showTextDocument(proposal.document, { preview: false });
    return true;
  }
  context.subscriptions.push(changes, lenses,
    vscode.workspace.registerTextDocumentContentProvider(scheme, preview),
    vscode.languages.registerCodeLensProvider({ scheme }, review),
    vscode.commands.registerCommand('tervory.complete.inlineEdit', propose),
    vscode.commands.registerCommand('tervory.complete.acceptEdit', id => finish(true, id)),
    vscode.commands.registerCommand('tervory.complete.rejectEdit', id => finish(false, id)),
    { dispose: () => { running?.abort(); documents.clear(); } });
  return { review, getPending: () => pending };
}
