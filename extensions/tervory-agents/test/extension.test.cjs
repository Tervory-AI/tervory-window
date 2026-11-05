const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const manifest = require('../package.json');

function fixture(t, { invalidToken = false, region = 'us-east', prUrl = 'https://github.com/alice/other/pull/8' } = {}) {
  const commands = new Map();
  const executed = [];
  const requests = [];
  const inputs = [];
  const picks = [];
  const clipboard = [];
  const opened = [];
  const documents = [];
  const inputOptions = [];
  const subscriptions = [];
  const errors = [];
  let provider;
  const secrets = new Map([['tervory.personal', invalidToken ? 'refused' : ['tv1', region, 'a'.repeat(32), 'b'.repeat(43)].join('.')]]);
  const vscode = {
    extensions: { getExtension(id) { assert.equal(id, 'tervory.tervory-panel'); return { activate: async () => ({ getSessionToken: async () => secrets.get('tervory.personal') }) }; } },
    EventEmitter: class { event() {} fire() {} dispose() {} },
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    TreeItemCollapsibleState: { Expanded: 2 },
    Uri: { parse: value => value },
    workspace: { async openTextDocument(value) { return value; } },
    window: {
      registerTreeDataProvider(id, value) { provider = value; return { dispose() {} }; },
      async showInputBox(options) { inputOptions.push(options); return inputs.shift(); },
      async showQuickPick(options) { return picks.length ? picks.shift() : options[0]; },
      async showTextDocument(document) { documents.push(document); },
      showErrorMessage(message) { errors.push(message); },
    },
    env: { async openExternal(uri) { opened.push(uri); }, clipboard: { async writeText(value) { clipboard.push(value); } } },
    commands: { async executeCommand(id) { executed.push(id); }, registerCommand(id, callback) { commands.set(id, callback); return { dispose() {} }; } },
  };
  const activeId = '12345678-1234-1234-1234-123456789abc';
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(new URL(url).origin, region === 'us-east' ? 'https://app.tervory.com' : 'https://za.tervory.com');
    const request = { path: new URL(url).pathname, method: options.method, body: options.body ? JSON.parse(options.body) : null };
    requests.push(request);
    let data = null;
    if (request.path.endsWith('/vault/github') && options.method === 'GET') data = ['github'];
    if (request.path.endsWith('/receipt')) data = { status: 'recorded', totals: { cost_usd: .01, baseline_cost_usd: .03, saved_usd: .02 }, rows: [{ cost_usd: .01, tokens_in: 3, tokens_out: 5, ledger_id: 'should-not-be-rendered' }] };
    if (request.path.endsWith('/webhooks')) data = { enabled: request.body.enabled, url: 'https://app.tervory.com/v1/command/window-agents/webhooks/fixture', secret: 'fixture-webhook-secret' };
    if (request.path.endsWith('/jobs') && options.method === 'GET') data = [
      { job_id: activeId, repo: 'alice/project', status: 'running' },
      { job_id: '87654321-4321-4321-4321-cba987654321', repo: 'alice/other', status: 'done', kind: 'review', pull_number: 8, result: { pr_url: prUrl } },
    ];
    return { ok: true, status: options.method === 'PUT' ? 204 : 200, async json() { return data; } };
  });
  const file = path.resolve(__dirname, '../extension.cjs');
  const load = Module._load;
  try {
    Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : load.call(this, request, ...rest); };
    delete require.cache[file];
    require(file).activate({ subscriptions, secrets: { async get(name) { return secrets.get(name); }, async store(name, value) { secrets.set(name, value); } } });
  } finally { Module._load = load; }
  const close = () => { for (const item of subscriptions) item.dispose(); delete require.cache[file]; };
  t.after(close);
  return { commands, executed, requests, inputs, picks, clipboard, inputOptions, provider, errors, activeId, close, opened, documents };
}

test('task uses only the credential name and continues after window disposal', async t => {
  const f = fixture(t);
  f.inputs.push('alice/project', 'Fix the counter');
  await f.commands.get('tervory.agents.start')();
  const task = f.requests.find(r => r.method === 'POST');
  assert.equal(task.body.credential_name, 'github');
  assert.equal(task.body.repo, 'alice/project');
  assert.equal(task.body.prompt, 'Fix the counter');
  assert.equal(task.body.value, undefined);
  assert.ok(task.body.request_id);
  f.close();
  assert.ok(f.requests.every(r => !r.path.endsWith('/cancel')));
});

test('GitHub credential is entered in a masked vault form', async t => {
  const f = fixture(t);
  const value = ['github', 'pat', 'test'.repeat(8)].join('_');
  f.inputs.push('github', value);
  await f.commands.get('tervory.agents.vault')();
  assert.equal(f.inputOptions[1].password, true);
  assert.deepEqual(f.requests[0], { path: '/v1/command/window-agents/vault/github', method: 'POST', body: { name: 'github', value } });
});

test('one inline cancel action applies only to queued or running tasks', async t => {
  const f = fixture(t);
  const groups = await f.provider.getChildren();
  assert.deepEqual(groups.map(g => g.label), ['Running', 'Finished']);
  const items = await f.provider.getChildren(groups[0]);
  const finished = await f.provider.getChildren(groups[1]);
  assert.equal(items[0].contextValue, 'tervoryAgent.running');
  assert.equal(items[0].description, 'Running');
  assert.equal(finished[0].description, 'Finished');
  assert.equal(manifest.contributes.views.tervory[0].name, 'Background agents');
  assert.equal(finished[0].contextValue, 'tervoryAgent.pr');
  assert.equal(manifest.contributes.menus['view/item/context'].filter(x => x.command === 'tervory.agents.cancel').length, 1);
  await f.commands.get('tervory.agents.cancel')(items[0]);
  assert.equal(f.requests.at(-1).path, `/v1/command/window-agents/jobs/${f.activeId}/cancel`);
});

test('an invalid Tervory credential cannot select an arbitrary server', async t => {
  const f = fixture(t, { invalidToken: true });
  const items = await f.provider.getChildren();
  assert.equal(f.requests.length, 0);
  assert.equal(items[0].label, 'Trigger sign-in');
  assert.equal(items[0].command.command, 'tervory.agents.connect');
});


test('PR review sends a named credential and a validated PR number', async t => {
  const f = fixture(t);
  f.inputs.push('alice/project', '8');
  await f.commands.get('tervory.agents.review')();
  const request = f.requests.at(-1);
  assert.equal(request.path, '/v1/command/window-agents/reviews');
  assert.equal(request.body.credential_name, 'github');
  assert.equal(request.body.pull_number, 8);
  assert.equal(request.body.model, undefined);
  assert.equal(request.body.value, undefined);
});

test('disabling a webhook never copies its secret', async t => {
  const f = fixture(t);
  f.inputs.push('alice/project');
  f.picks.push('github', 'Disable');
  await f.commands.get('tervory.agents.webhook')();
  assert.equal(f.requests.at(-1).body.enabled, false);
  assert.deepEqual(f.clipboard, []);
});

test('webhook secret is copied only after the explicit copy choice', async t => {
  const f = fixture(t);
  f.inputs.push('alice/project');
  f.picks.push('github', 'Enable', 'Copy webhook secret');
  await f.commands.get('tervory.agents.webhook')();
  assert.equal(f.requests.at(-1).body.enabled, true);
  assert.deepEqual(f.clipboard, ['fixture-webhook-secret']);
});


test('finished reviews link to their GitHub PR', async t => {
  const f = fixture(t);
  const groups = await f.provider.getChildren();
  assert.deepEqual(groups.map(group => group.label), ['Running', 'Finished']);
  const finished = await f.provider.getChildren(groups[1]);
  assert.equal(finished[0].label, 'alice/other #8');
  await f.commands.get('tervory.agents.open')(finished[0]);
  assert.deepEqual(f.opened, ['https://github.com/alice/other/pull/8']);
});

test('receipt view shows recorded costs and token counts', async t => {
  const f = fixture(t);
  const groups = await f.provider.getChildren();
  const items = await f.provider.getChildren(groups[0]);
  await f.commands.get('tervory.agents.receipt')(items[0]);
  assert.equal(f.documents[0].language, 'plaintext');
  assert.match(f.documents[0].content, /Recorded cost: \$0\.010000/);
  assert.match(f.documents[0].content, /input 3, output 5 tokens/);
  assert.ok(!f.documents[0].content.includes('should-not-be-rendered'));
});

test('PR links cannot open another host or a script URL', async t => {
  const f = fixture(t, { prUrl: 'javascript:refused' });
  const groups = await f.provider.getChildren();
  const finished = await f.provider.getChildren(groups[1]);
  assert.equal(finished[0].command, undefined);
  await f.commands.get('tervory.agents.open')({ prUrl: 'https://other.example/alice/project/pull/8' });
  assert.deepEqual(f.opened, []);
});


test('ZA uses its local public Tank while Boston uses the existing command proxy', async t => {
  const f = fixture(t, { region: 'za' });
  await f.provider.getChildren();
  assert.equal(f.requests[0].path, '/v1/window-agents/jobs');
});

test('agents reuse Trigger sign-in instead of requesting a separate personal token', async t => {
  const f = fixture(t);
  await f.commands.get('tervory.agents.connect')();
  assert.deepEqual(f.executed, ['tervory.signIn']);
  assert.deepEqual(f.inputOptions, []);
});
