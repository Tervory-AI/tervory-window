import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedContext, CONTEXT_LIMITS } from '../extension/src/project-context.mjs';

test('UTF-8 wire and conservative token budgets include rules, paths and JSON overhead', () => {
  const input = { rules: 'Use clear names. Run the existing tests.', prefix: '😀before'.repeat(20000),
    suffix: 'after界'.repeat(20000), language: 'typescript', tabs: [
      { path: 'src/boundary.ts', text: 'export function correctBoundary(input: string)' },
      { path: 'src/boundary.ts', text: 'duplicate definition' },
      ...Array.from({length: 2000}, (_, n) => ({ path: `noise/${n}.ts`, text: 'x'.repeat(1000) })),
    ] };
  const result = boundedContext(input, { maxBytes: 3000, maxTokens: 2000 });
  assert(Buffer.byteLength(JSON.stringify(result)) <= 2000);
  assert.equal(result.rules, input.rules);
  assert.equal(new Set(result.tabs.map(tab => tab.path)).size, result.tabs.length);
  assert(result.tabs.some(tab => tab.text.includes('correctBoundary')));
  assert.deepEqual(result, boundedContext(input, { maxBytes: 3000, maxTokens: 2000 }));
  assert(result.prefix.length > 0 && result.suffix.length > 0, 'a map cannot starve either cursor window');
  assert(!result.prefix.includes('\uFFFD'));
  assert(Buffer.byteLength(JSON.stringify(boundedContext(input))) <= CONTEXT_LIMITS.maxBytes);
});

test('selected code and project rules stay intact; impossible budgets refuse rather than truncate them', () => {
  const result = boundedContext({ rules: 'Test with the existing command.', selection: 'return value;', tabs: [], prefix: 'a'.repeat(100000) });
  assert.equal(result.selection, 'return value;');
  assert.equal(result.rules, 'Test with the existing command.');
  assert.throws(() => boundedContext({ rules: 'x'.repeat(25000) }), /rules exceed/);
  assert.throws(() => boundedContext({ selection: 'x'.repeat(25000) }), /Selection exceeds/);
  assert.throws(() => boundedContext({ rules: 'keep' }, { maxBytes: 0 }), /rules exceed/);
});
