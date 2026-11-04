const vscode = require('vscode');
const { randomUUID } = require('node:crypto');
const ORIGINS = { 'us-east': 'https://app.tervory.com', za: 'https://za.tervory.com' };

function activate(context) {
  async function call(path, body, method) {
    const token = await context.secrets.get('tervory.personal');
    const match = /^tv1\.(us-east|za)\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.exec(token || '');
    if (!match) throw new Error('Connect Tervory first.');
    const response = await fetch(ORIGINS[match[1]] + '/v1/window-agents/' + path, {
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
    async getChildren() {
      try {
        return (await call('jobs')).map(row => {
          const item = new vscode.TreeItem(row.repo);
          item.description = row.status;
          item.tooltip = row.job_id;
          item.jobId = row.job_id;
          item.contextValue = ['queued', 'running'].includes(row.status) ? 'tervoryAgent.running' : 'tervoryAgent.finished';
          return item;
        });
      } catch { return []; }
    },
  };
  context.subscriptions.push(vscode.window.registerTreeDataProvider('tervory.agents', provider), changes);
  const refresh = setInterval(() => changes.fire(), 10000);
  context.subscriptions.push({ dispose: () => clearInterval(refresh) });
  const register = (name, action) => context.subscriptions.push(vscode.commands.registerCommand(name, async (...args) => {
    try { await action(...args); changes.fire(); }
    catch (error) { vscode.window.showErrorMessage(error.message); }
  }));
  register('tervory.agents.connect', async () => {
    const value = await vscode.window.showInputBox({ prompt: 'Tervory personal token', password: true, ignoreFocusOut: true });
    if (value) {
      if (!/^tv1\.(us-east|za)\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Personal token refused.');
      await context.secrets.store('tervory.personal', value);
    }
  });
  register('tervory.agents.vault', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'Credential name' });
    if (!name) return;
    const value = await vscode.window.showInputBox({ prompt: 'GitHub token — saved in your vault', password: true, ignoreFocusOut: true });
    if (value) await call('vault/github', { name, value }, 'PUT');
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
  register('tervory.agents.cancel', async item => {
    if (item?.jobId) await call(`jobs/${encodeURIComponent(item.jobId)}/cancel`, {});
  });
}
module.exports = { activate };
