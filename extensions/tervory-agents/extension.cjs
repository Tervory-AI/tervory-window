const vscode = require('vscode');
const { randomUUID } = require('node:crypto');
const ORIGINS = { 'us-east': 'https://app.tervory.com', za: 'https://za.tervory.com' };

function activate(context) {
  async function call(path, body, method) {
    const panel = vscode.extensions.getExtension('tervory.tervory-panel');
    if (!panel) throw new Error('Tervory panel is unavailable');
    const token = await (await panel.activate()).getSessionToken();
    const match = /^tv1\.(us-east|za)\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.exec(token || '');
    if (!match) throw new Error('Trigger sign-in');
    const response = await fetch(ORIGINS[match[1]] + (match[1] === 'us-east' ? '/v1/command/window-agents/' : '/v1/window-agents/') + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000), redirect: 'error',
    });
    if (!response.ok) throw new Error('The request could not be completed. Check your sign-in and repository access.');
    return response.status === 204 ? null : response.json();
  }
  const changes = new vscode.EventEmitter();
  const provider = {
    onDidChangeTreeData: changes.event,
    getTreeItem: item => item,
    async getChildren(group) {
      if (Array.isArray(group?.children)) return group.children;
      try {
        const rows = await call('jobs');
        const render = row => {
          const item = new vscode.TreeItem(row.kind === 'review' ? `${row.repo} #${row.pull_number}` : row.repo);
          item.description = ({ queued: 'Waiting', running: 'Running', done: 'Finished', failed: 'Error', cancelled: 'Cancelled' })[row.status] ?? row.status;
          item.tooltip = row.kind === 'review' ? 'Pull request review' : 'Background task';
          item.jobId = row.job_id;
          const running = ['queued', 'running'].includes(row.status);
          const url = row.result?.pr_url;
          if (typeof url === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(url)) item.prUrl = url;
          item.contextValue = running ? 'tervoryAgent.running' : item.prUrl ? 'tervoryAgent.pr' : 'tervoryAgent.finished';
          if (item.prUrl) item.command = { command: 'tervory.agents.open', title: 'Open pull request', arguments: [item] };
          return item;
        };
        return [['Running', true], ['Finished', false]].map(([label, active]) => {
          const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
          item.children = rows.filter(row => ['queued', 'running'].includes(row.status) === active).map(render);
          item.description = String(item.children.length);
          return item;
        });
      } catch {
        const item = new vscode.TreeItem('Trigger sign-in');
        item.command = { command: 'tervory.agents.connect', title: 'Trigger sign-in' };
        return [item];
      }
    },
  };
  context.subscriptions.push(vscode.window.registerTreeDataProvider('tervory.agents', provider), changes);
  const refresh = setInterval(() => changes.fire(), 10000);
  context.subscriptions.push({ dispose: () => clearInterval(refresh) });
  const register = (name, action) => context.subscriptions.push(vscode.commands.registerCommand(name, async (...args) => {
    try { await action(...args); changes.fire(); }
    catch (error) { vscode.window.showErrorMessage(error.message); }
  }));
  register('tervory.agents.connect', () => vscode.commands.executeCommand('tervory.signIn'));
  register('tervory.agents.vault', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'Credential name' });
    if (!name) return;
    const value = await vscode.window.showInputBox({ prompt: 'GitHub token — saved in your vault', password: true, ignoreFocusOut: true });
    if (value) await call('vault/github', { name, value });
  });
  register('tervory.agents.start', async () => {
    const names = await call('vault/github');
    const credential_name = await vscode.window.showQuickPick(names, { placeHolder: 'GitHub credential name' });
    if (!credential_name) return;
    const repo = await vscode.window.showInputBox({ prompt: 'GitHub owner/repository' });
    if (!repo) return;
    const prompt = await vscode.window.showInputBox({ prompt: 'Task' });
    if (!prompt) return;
    await call('jobs', { repo, credential_name, prompt, request_id: randomUUID() });
  });
  register('tervory.agents.review', async () => {
    const credential_name = await vscode.window.showQuickPick(await call('vault/github'), { placeHolder: 'GitHub credential name' });
    if (!credential_name) return;
    const repo = await vscode.window.showInputBox({ prompt: 'GitHub owner/repository' });
    if (!repo) return;
    const number = await vscode.window.showInputBox({ prompt: 'Pull request number' });
    if (!number) return;
    if (!/^[1-9][0-9]*$/.test(number) || !Number.isSafeInteger(Number(number))) throw new Error('Enter a pull request number.');
    await call('reviews', { repo, credential_name, pull_number: Number(number), request_id: randomUUID() });
  });
  register('tervory.agents.webhook', async () => {
    const credential_name = await vscode.window.showQuickPick(await call('vault/github'), { placeHolder: 'GitHub credential name' });
    if (!credential_name) return;
    const repo = await vscode.window.showInputBox({ prompt: 'GitHub owner/repository' });
    if (!repo) return;
    const action = await vscode.window.showQuickPick(['Enable', 'Disable'], { placeHolder: 'PR review webhook' });
    if (!action) return;
    const hook = await call('webhooks', { repo, credential_name, enabled: action === 'Enable' });
    if (!hook.enabled) return;
    // Copying is explicit; the secret never enters chat or a text document.
    const setup = await vscode.window.showQuickPick(['Copy callback URL', 'Copy webhook secret'], { placeHolder: 'Add a GitHub webhook for pull requests (application/json)' });
    if (setup === 'Copy callback URL') await vscode.env.clipboard.writeText(hook.url);
    if (setup === 'Copy webhook secret') await vscode.env.clipboard.writeText(hook.secret);
  });
  register('tervory.agents.open', async item => {
    if (typeof item?.prUrl === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(item.prUrl)) {
      await vscode.env.openExternal(vscode.Uri.parse(item.prUrl));
    }
  });
  register('tervory.agents.receipt', async item => {
    if (!item?.jobId) return;
    const receipt = await call(`jobs/${encodeURIComponent(item.jobId)}/receipt`);
    const money = value => typeof value === 'number' && Number.isFinite(value) ? '$' + value.toFixed(6) : 'Pending';
    const lines = ['Receipt', '', `Recorded cost: ${money(receipt.totals?.cost_usd)}`,
      `Baseline: ${money(receipt.totals?.baseline_cost_usd)}`, `Saved: ${money(receipt.totals?.saved_usd)}`, ''];
    if (receipt.status === 'pending') lines.push('Some usage is still being recorded.', '');
    for (const [index, row] of (receipt.rows || []).entries()) {
      lines.push(`Step ${index + 1}: ${money(row.cost_usd)}; input ${row.tokens_in ?? 'Pending'}, output ${row.tokens_out ?? 'Pending'} tokens`);
    }
    const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: lines.join('\n') });
    await vscode.window.showTextDocument(document, { preview: true });
  });
  register('tervory.agents.cancel', async item => {
    if (item?.jobId) await call(`jobs/${encodeURIComponent(item.jobId)}/cancel`, {});
  });
}
module.exports = { activate };
