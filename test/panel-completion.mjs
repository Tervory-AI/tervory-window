import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The input message enqueues work; it does not await the CLI transaction.
// Do not poll/open its target files until the next ready transition.
export async function completePanelAction({ send, events, until, files, approval, read = readFile }) {
  const before = events.length;
  await send();
  await until(() => events.slice(before).some(event => event.type === 'ready'));
  const current = events.slice(before);
  assert(!current.some(event => event.type === 'error' || event.text?.includes('Code tool refused.')),
    'Panel action refused: ' + JSON.stringify(current));
  if (approval) assert(current.some(event => event.type === 'approval' && event.action === approval), `${approval} approval was not requested`);
  for (const file of files) assert.equal(await read(file.path, 'utf8'), file.expected, file.path);
}
