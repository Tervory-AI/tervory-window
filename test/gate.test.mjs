import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateTransport, stablePrefix, Progress, testsPassed, treeDigest, plainReason, HISTORY_PREFIX_BYTES } from '../extension/src/gate.mjs';
import { signInState, expiredSignIn } from '../extension/src/sign-in.mjs';
import { report } from './bytes.mjs';

const URL_ = 'https://app.tervory.com/v1/command/threads/t1/code-turn';
const init = body => ({ method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify(body) });
const command = (output, code = 0) => ({ name: 'run_command', output: JSON.stringify({ arguments: { command: 'node --test' }, result: { ran: true, code, timed_out: false, output } }) });
const quote = { rung: 2, tokens_in_estimate: 5000, tokens_out_limit: 1000, cost_usd_estimate: 0.02, price_status: 'priced', files: ['a.py'] };
async function folder() { const root = await mkdtemp(join(tmpdir(), 'opli-gate-')); await writeFile(join(root, 'a.py'), 'x = 1\n'); return root; }

test('history is cut to the stable prefix Tank slices; the project note stays first', () => {
  const history = [{ kind: 'project', content: 'notes' }, ...Array.from({ length: 30 }, (_, n) => ({ kind: n % 2 ? 'assistant' : 'user', content: 'x'.repeat(400) + n }))];
  const kept = stablePrefix(history);
  assert.equal(kept[0].kind, 'project');
  assert.deepEqual(kept.slice(1), history.slice(1, kept.length));
  assert(Buffer.byteLength(JSON.stringify(kept.slice(1))) <= HISTORY_PREFIX_BYTES + kept.length);
  assert.deepEqual(stablePrefix([{ kind: 'project', content: 'y'.repeat(20000) }]), []);
});

test('progress envelope has exactly the code_progress.Progress fields and follows local checks', async () => {
  const root = await folder();
  try {
    const progress = new Progress();
    let value = await progress.envelope(root);
    assert.deepEqual(Object.keys(value).sort(), ['build_stage', 'tests_passed', 'tree']);
    assert.match(value.tree, /^[a-f0-9]{64}$/); assert.equal(value.tests_passed, 0); assert.equal(value.build_stage, 0);
    progress.observe([command('# tests 3\n# pass 2\n# fail 1\n', 1)]);
    value = await progress.envelope(root); assert.equal(value.tests_passed, 2); assert.equal(value.build_stage, 1);
    progress.observe([command('==== 5 passed in 0.1s ====')]);
    value = await progress.envelope(root); assert.equal(value.tests_passed, 5); assert.equal(value.build_stage, 2);
    const before = await treeDigest(root); await writeFile(join(root, 'a.py'), 'x = 2\n');
    assert.notEqual(await treeDigest(root), before, 'a change changes the tree digest');
    assert.equal(testsPassed('Tests: 7 passed, 7 total'), 7); assert.equal(testsPassed('no counts'), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('continuation rounds send only new tool results, with progress after every change', async () => {
  const root = await folder(); const sent = [];
  try {
    const transport = gateTransport(async (url, options) => { sent.push(JSON.parse(options.body ?? 'null')); return new URL(url).pathname.endsWith('/code-turn') ? Response.json({ answer: '', requests: [] }) : Response.json({ steps: [] }); }, { folder: () => root });
    const read = { name: 'read_file', output: '{"result":{"text":"x = 1"}}' };
    const history = [{ kind: 'user', content: 'earlier' }];
    await transport(URL_, init({ prompt_id: 'p', request_id: 'r1', text: 'fix a.py', continuation: false, tool_results: [], history }));
    await transport(URL_, init({ prompt_id: 'p', request_id: 'r2', text: 'fix a.py', continuation: true, tool_results: [read], history }));
    await transport(URL_, init({ prompt_id: 'p', request_id: 'r3', text: 'fix a.py', continuation: true, tool_results: [read, command('# pass 4\n')], history }));
    const turns = sent.filter(body => body?.prompt_id);
    assert.deepEqual(turns.map(body => body.tool_results.map(item => item.name)), [[], ['read_file'], ['run_command']]);
    assert(turns.every(body => body.progress && /^[a-f0-9]{64}$/.test(body.progress.tree)));
    assert.equal(turns[2].progress.tests_passed, 4); assert.equal(turns[2].progress.build_stage, 2);
    assert.deepEqual(turns[2].history, history);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a host without progress evidence refuses it once; the turn is resent without it', async () => {
  const root = await folder(); const sent = [];
  try {
    const transport = gateTransport(async (url, options) => {
      if (!new URL(url).pathname.endsWith('/code-turn')) return Response.json({ steps: [] });
      const body = JSON.parse(options.body); sent.push(body);
      return body.progress ? Response.json({ detail: [{ msg: 'Value error, Progress evidence is not enabled on this host' }] }, { status: 422 }) : Response.json({ answer: 'ok', requests: [] });
    }, { folder: () => root });
    for (const id of ['r1', 'r2']) assert.equal((await (await transport(URL_, init({ prompt_id: 'p' + id, request_id: id, text: 'x', tool_results: [] }))).json()).answer, 'ok');
    assert.deepEqual(sent.map(body => [body.request_id, 'progress' in body]), [['r1', true], ['r1', false], ['r2', false]]);
    const other = gateTransport(async () => Response.json({ detail: 'Plan mode permits only read tools' }, { status: 422 }), { folder: () => root });
    assert.equal((await other(URL_, init({ prompt_id: 'q', request_id: 'r3', text: 'x' }))).status, 422, 'other refusals are not retried');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Ask: a held quote waits for approval, records it with Tank, then resends the prompt', async () => {
  const root = await folder(); const calls = []; const quotes = [];
  try {
    const transport = gateTransport(async (url, options) => {
      const path = new URL(url).pathname; const body = options.body ? JSON.parse(options.body) : null; calls.push([path, body]);
      if (path.includes('/paid-steps/approvals/')) return Response.json({ state: 'approved' });
      if (path.endsWith('/threads/t1')) return Response.json({ steps: [] });
      if (!body.continuation) return Response.json({ answer: 'held', requests: [], preflight: { status: 'awaiting_approval', approval_id: 'a1', task: 1, tasks: 1, quote } });
      return Response.json({ answer: 'done', requests: [] });
    }, { folder: () => root, onQuote: info => quotes.push(info), decide: async info => { assert.equal(info.quote.cost_usd_estimate, 0.02); return true; } });
    const answer = await (await transport(URL_, init({ prompt_id: 'p', request_id: 'r1', text: 'fix a.py', continuation: false, tool_results: [{ name: 'list_files', output: '{}' }] }))).json();
    assert.equal(answer.answer, 'done');
    assert.equal(quotes[0].waiting, true); assert.match(quotes[0].reason, /approval/);
    const approval = calls.find(([path]) => path.includes('/approvals/'));
    assert.deepEqual(approval, ['/v1/command/paid-steps/approvals/a1', { approve: true, reason: 'Approved in Opli Code' }]);
    const retry = calls.filter(([path]) => path.endsWith('/code-turn'))[1][1];
    assert.equal(retry.continuation, true); assert.notEqual(retry.request_id, 'r1'); assert.deepEqual(retry.tool_results, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Ask: a declined or refused approval stops without a paid call', async () => {
  for (const [decision, status, expected] of [[false, 200, /declined/], [true, 403, /administrator/]]) {
    const turns = []; const holds = [];
    const transport = gateTransport(async (url, options) => {
      const path = new URL(url).pathname;
      if (path.includes('/approvals/')) return status === 200 ? Response.json({ state: 'denied' }) : new Response('', { status });
      turns.push(JSON.parse(options.body));
      return Response.json({ answer: 'held', requests: [], preflight: { status: 'awaiting_approval', approval_id: 'a1', quote } });
    }, { onHold: info => holds.push(info), decide: async () => decision });
    assert.equal((await (await transport(URL_, init({ prompt_id: 'p', request_id: 'r', text: 'x' }))).json()).answer, 'held');
    assert.equal(turns.length, 1, 'no second request after a refusal'); assert.match(holds[0].reason, expected);
  }
});

test('Auto: a quote recorded on the turn step is shown; holds and gate stops show plain reasons', async () => {
  const quotes = []; const holds = [];
  const transport = gateTransport(async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/threads/t1')) return Response.json({ steps: [{ step_id: 'auto', code_preflight: { status: 'quoted', task: 1, tasks: 2, quote, authorization: 'auto' } }] });
    const body = JSON.parse(options.body);
    if (body.request_id === 'auto') return Response.json({ answer: 'done', requests: [] });
    if (body.request_id === 'files') return Response.json({ answer: 'Name the files', requests: [], preflight: { status: 'needs_files', message: 'Name the files task 1 of 1 should change.' } });
    return Response.json({ answer: 'stop', requests: [], gate: { status: 'stopped', reason: 'repeated_error', message: 'The same local error occurred three times.' } });
  }, { onQuote: info => quotes.push(info), onHold: info => holds.push(info) });
  for (const id of ['auto', 'files', 'gate']) await transport(URL_, init({ prompt_id: id, request_id: id, text: 'x' }));
  assert.equal(quotes.length, 1); assert.equal(quotes[0].quote.rung, 2); assert.equal(quotes[0].waiting, false); assert.match(quotes[0].reason, /automatically/);
  assert.deepEqual(holds.map(item => item.status), ['needs_files', 'repeated_error']);
  assert.match(holds[1].reason, /three times/); assert.equal(plainReason('unknown', 'Tank text'), 'Tank text');
});

test('sign-in state: missing, expired and live credentials; stale errors are recognised', async () => {
  const store = value => ({ get: async () => value });
  const credential = refresh => JSON.stringify({ version: 1, region: 'us-east', access_token: 'a', refresh_token: 'r', expires_at: new Date(0).toISOString(), refresh_expires_at: new Date(refresh).toISOString() });
  assert.deepEqual(await signInState(store(undefined)), { signedIn: false });
  assert.equal((await signInState(store(credential(Date.now() - 1000)))).expired, true);
  assert.deepEqual(await signInState(store(credential(Date.now() + 86400000))), { signedIn: true });
  assert.deepEqual(await signInState({ get: async () => { throw Error('locked'); } }), { signedIn: false });
  for (const message of ['Login expired. Run tervory login.', 'Personal token refused.', 'Login required. Missing OS keyring entry X. Run tervory login.']) assert(expiredSignIn(Error(message)));
  assert(!expiredSignIn(Error('Tank connection failed.')));
});

test('bytes per turn on the fixture session drop once history is not resent', async () => {
  const result = await report();
  assert.equal(result.before.length, result.after.length);
  assert(result.afterTotal < result.beforeTotal * 0.7, JSON.stringify(result));
  // Later rounds of a prompt no longer repeat earlier tool results or the growing history.
  assert(result.after.at(-1) < result.before.at(-1) * 0.5);
  console.log(`bytes per turn: before mean ${result.beforeMean}, after mean ${result.afterMean} (${result.turns} turns)`);
});
