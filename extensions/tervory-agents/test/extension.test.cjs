const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const manifest = require('../package.json');

function fixture(t, { invalidToken = false } = {}) {
  const commands = new Map();
  const requests = [];
  const inputs = [];
  const inputOptions = [];
  const subscriptions = [];
  const errors = [];
  let provider;
  const secrets = new Map([['tervory.personal', invalidToken ? 'refused' : ['tv1', 'us-east', 'a'.repeat(32), 'b'.repeat(43)].join('.')]]);
  const vscode = {
    EventEmitter: class { event() {} fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } },
    window: {
      registerTreeDataProvider(id, value) { provider = value; return { dispose() {} }; },
      async showInputBox(options) { inputOptions.push(options); return inputs.shift(); },
      async showQuickPick(options) { return options[0]; },
      showErrorMessage(message) { errors.push(message); },
    },
    commands: { registerCommand(id, callback) { commands.set(id, callback); return { dispose() {} }; } },
  };
  const activeId = '12345678-1234-1234-1234-123456789abc';
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(new URL(url).origin, 'https://app.tervory.com');
    const request = { path: new URL(url).pathname, method: options.method, body: options.body ? JSON.parse(options.body) : null };
    requests.push(request);
    let data = null;
    if (request.path.endsWith('/vault/github') && options.method === 'GET') data = ['github'];
    if (request.path.endsWith('/jobs') && options.method === 'GET') data = [
      { job_id: activeId, repo: 'alice/project', status: 'running' },
      { job_id: 'finished', repo: 'alice/other', status: 'done' },
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
  return { commands, requests, inputs, inputOptions, provider, errors, activeId, close };
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
  assert.deepEqual(f.requests[0], { path: '/v1/window-agents/vault/github', method: 'PUT', body: { name: 'github', value } });
});

test('one inline cancel action applies only to queued or running tasks', async t => {
  const f = fixture(t);
  const items = await f.provider.getChildren();
  assert.equal(items[0].contextValue, 'tervoryAgent.running');
  assert.equal(items[1].contextValue, 'tervoryAgent.finished');
  assert.equal(manifest.contributes.menus['view/item/context'].filter(x => x.command === 'tervory.agents.cancel').length, 1);
  await f.commands.get('tervory.agents.cancel')(items[0]);
  assert.equal(f.requests.at(-1).path, `/v1/window-agents/jobs/${f.activeId}/cancel`);
});

test('an invalid Tervory credential cannot select an arbitrary server', async t => {
  const f = fixture(t, { invalidToken: true });
  await f.commands.get('tervory.agents.start')();
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.errors, ['Connect Tervory first.']);
});
