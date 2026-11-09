// Fixture session: bytes sent to Tank per code turn, with and without the gate client.
// The real CLI code session and CodeFolder run; only Tank is a fixture.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli } from '../extension/src/session.mjs';
import { gateTransport } from '../extension/src/gate.mjs';

const ORIGIN = 'https://app.tervory.com';
const token = `tv1.us-east.${'1'.repeat(32)}.${('placeholder' + 'x'.repeat(43)).slice(0, 43)}`;
const source = n => Array.from({ length: 160 }, (_, line) => `export function step${n}_${line}(value) { return value + ${line}; }`).join('\n') + '\n';
export const PROMPTS = 6;

export async function measureSession({ gated }) {
  const { codeSession } = await cli('code-mode.mjs');
  const { Tank, safe } = await cli('client.mjs');
  const root = await mkdtemp(join(tmpdir(), 'opli-bytes-'));
  execFileSync('git', ['init', '-q', root]);
  await writeFile(join(root, 'AGENTS.md'), '# Conventions\n' + 'Run node --test before finishing. Keep functions small.\n'.repeat(40));
  for (let n = 0; n < PROMPTS; n++) await writeFile(join(root, `module${n}.mjs`), source(n));
  const turns = []; let round = 0;
  const tankFetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === '/v1/command/threads') return Response.json({ thread_id: 'bytes-thread' });
    if (path === '/v1/command/threads/bytes-thread') return Response.json({ steps: [] });
    if (path.endsWith('/code-turn')) {
      const body = JSON.parse(init.body); turns.push(Buffer.byteLength(init.body));
      if (!body.continuation) round = 0;
      const n = Number(/module(\d)/.exec(body.text)[1]); const file = `module${n}.mjs`;
      const requests = [
        [{ name: 'read_file', arguments: { path: file } }],
        [{ name: 'propose_edit', arguments: { diff: `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-export function step${n}_0(value) { return value + 0; }\n+export function step${n}_0(value) { return value; }\n` } }],
        [{ name: 'git', arguments: { action: 'diff' } }],
      ][round++] ?? [];
      return Response.json({ answer: requests.length ? '' : `Changed ${file}: step${n}_0 now returns its input unchanged, and the rest of the module is as before.`, requests, receipt: { rows: [] } });
    }
    throw Error('Unexpected fixture route ' + path);
  };
  const transport = gated ? gateTransport(tankFetch, { folder: () => root }) : tankFetch;
  const prompts = Array.from({ length: PROMPTS }, (_, n) => `In module${n}.mjs make step${n}_0 return its input unchanged.`);
  const io = { interactive: true, write() {}, prompt: async label => label === '> ' ? prompts.shift() ?? null : 'y' };
  try { await codeSession(new Tank(token, transport), root, 'auto', io, () => [], safe); }
  finally { await rm(root, { recursive: true, force: true }); }
  return turns;
}

export async function report() {
  const before = await measureSession({ gated: false }); const after = await measureSession({ gated: true });
  const sum = list => list.reduce((a, b) => a + b, 0);
  return { turns: before.length, before, after, beforeTotal: sum(before), afterTotal: sum(after),
    beforeMean: Math.round(sum(before) / before.length), afterMean: Math.round(sum(after) / after.length), origin: ORIGIN };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await report();
  console.log('turn | before bytes | after bytes');
  result.before.forEach((value, index) => console.log(`${index + 1} | ${value} | ${result.after[index]}`));
  console.log(`total | ${result.beforeTotal} | ${result.afterTotal}`);
  console.log(`mean per turn | ${result.beforeMean} | ${result.afterMean}`);
}
