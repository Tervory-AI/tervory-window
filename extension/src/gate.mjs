// Client side of Tank's gate before (tank/code_preflight.py, code_progress.py,
// code_context.py). This wraps the transport handed to the CLI's Tank class, so
// the CLI's own code session, approvals and redaction run unchanged. Nothing
// here chooses or names a model: every call still goes to Tank.
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const CODE_TURN = /^\/v1\/command\/threads\/([^/]+)\/code-turn$/;
// Tank's slicer keeps only an unchanging prefix of the session (HISTORY_PREFIX_TOKENS
// = 1024, about 4 bytes a token); the server already remembers the full history.
export const HISTORY_PREFIX_BYTES = 4096;
export const PROJECT_NOTE_BYTES = 12000;
const SKIP = new Set(['.git', 'node_modules', '.tmp', 'dist', 'out', 'build-cache']);
const TREE_FILES = 20000; const TREE_BYTES = 64 * 1024 * 1024;

// Plain words for each hold Tank can return (code_preflight.LABELS, code_gate and code_progress reasons).
export const REASONS = {
  question: 'Tank needs one detail before planning: which file or behaviour should change, and how you will know it works.',
  too_many_tasks: 'This prompt has too many separate asks. Send at most eight at a time.',
  listing: 'Tank is listing the folder to choose which files this task may touch.',
  needs_files: 'Tank could not tell which files to change. Name them and send the prompt again.',
  outside_plan: 'A result for a file outside the plan was refused and not sent to a model.',
  setting: 'A task budget setting on Tank is not a valid number.',
  no_policy: 'Code tasks have no routing policy on Tank yet.',
  awaiting_approval: 'This paid step needs approval before the model call.',
  declined: 'The paid step was declined.',
  paid_paused: 'Paid work is paused on this account.',
  price_unknown: 'This task has a dollar budget but the price is not known.',
  budget: 'This task reached its budget.',
  turn_limit: 'This task reached its round limit.',
  complete: 'Every task in this prompt is done.',
  repeated_error: 'The same local error happened three times, so Tank stopped before paying again.',
  error_limit: 'This task produced too many different errors.',
  invalid_command_result: 'A local check result was incomplete. Run the check again.',
  local_checks_required: 'Run the local checks and report their progress before continuing.',
  repeated_tool_round: 'The same tool results were sent twice in a row.',
  oscillating_changes: 'The work was undone and redone. Return to the last green checkpoint.',
  no_progress: 'Two rounds passed with no more tests passing and no build progress.',
};
export const plainReason = (status, message) => REASONS[status] ?? (typeof message === 'string' ? message : 'Tank stopped before the model call.');

const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));

/** Only the stable prefix Tank's context slicing keeps: short project notes, then the oldest turns that fit. */
export function stablePrefix(history = []) {
  const kept = []; let used = 0;
  for (const item of history) if (item?.kind === 'project' && bytes(item.content) <= PROJECT_NOTE_BYTES) { kept.push(item); break; }
  for (const item of history) {
    if (!item || item.kind === 'project') continue;
    const size = bytes(item);
    if (used + size > HISTORY_PREFIX_BYTES) break;
    kept.push(item); used += size;
  }
  return kept;
}

const resultOf = output => { try { return JSON.parse(output)?.result ?? null; } catch { return null; } };
const PASSES = [/^# pass (\d+)$/m, /\b(\d+) passed\b/, /\bTests:\s+(\d+) passed/, /\bok (\d+) tests?\b/i, /\b(\d+) passing\b/];
export function testsPassed(output) {
  for (const pattern of PASSES) { const match = pattern.exec(String(output ?? '')); if (match) return Math.min(1_000_000_000, Number(match[1])); }
  return null;
}

/** A digest of the project files, so Tank can see undo/redo loops without receiving any file. */
export async function treeDigest(folder) {
  const root = await realpath(folder); const files = [];
  async function walk(directory, prefix) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= TREE_FILES) return;
      if (SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(directory, entry.name), name);
      else if (entry.isFile()) files.push(name);
    }
  }
  await walk(root, '');
  const hash = createHash('sha256'); let total = 0;
  for (const name of files) {
    let data;
    try { data = await readFile(join(root, name)); } catch { continue; }
    total += data.length; if (total > TREE_BYTES) break;
    hash.update(name).update('\0').update(createHash('sha256').update(data).digest()).update('\0');
  }
  return hash.digest('hex');
}

/** The envelope code_progress.Progress accepts: {tree, tests_passed, build_stage}; extra keys are refused there. */
export class Progress {
  tests = 0; stage = 0;
  observe(results) {
    for (const item of results) {
      if (item?.name !== 'run_command') continue;
      const result = resultOf(item.output);
      if (!result || result.ran !== true) continue;
      const passed = testsPassed(result.output);
      if (passed !== null) this.tests = passed;
      // 0: no check ran yet; 1: the latest check failed; 2: the latest check passed.
      // Tank fingerprints the error itself from the run_command output it receives.
      this.stage = result.code === 0 && !result.timed_out ? 2 : 1;
    }
  }
  async envelope(folder) { return { tree: await treeDigest(folder), tests_passed: this.tests, build_stage: this.stage }; }
}

/**
 * A fetch-compatible transport. `folder()` is the project root; `onQuote(info)` shows a quote;
 * `onHold(info)` shows a stop; `decide(info)` resolves true/false when Tank waits for approval.
 */
export function gateTransport(base, { folder, onQuote = () => {}, onHold = () => {}, decide = async () => false, measure } = {}) {
  const prompts = new Map(); let progressAccepted;
  const post = (url, init, body) => base(url, { ...init, body: JSON.stringify(body) });
  const forPrompt = id => {
    if (!prompts.has(id)) { prompts.set(id, { sent: new Set(), progress: new Progress() }); while (prompts.size > 16) prompts.delete(prompts.keys().next().value); }
    return prompts.get(id);
  };
  return async function transport(url, init = {}) {
    const parsed = new URL(url); const match = CODE_TURN.exec(parsed.pathname);
    if (!match || init.method !== 'POST' || typeof init.body !== 'string') return base(url, init);
    const original = JSON.parse(init.body); const state = forPrompt(original.prompt_id);
    const results = Array.isArray(original.tool_results) ? original.tool_results : [];
    const fresh = original.continuation ? results.filter(item => !state.sent.has(item.output)) : results;
    state.progress.observe(fresh);
    const body = { ...original, history: stablePrefix(original.history), tool_results: fresh };
    if (progressAccepted !== false && folder) body.progress = await state.progress.envelope(folder());
    measure?.(bytes(body), bytes(original));
    let response = await post(url, init, body);
    if (response.status === 422 && body.progress && progressAccepted === undefined) {
      // Only Tank's request validation names this; it runs before any reservation, and a
      // repeat of the same request_id is refused by Tank anyway. Other 422s pass through.
      const detail = (await response.text().catch(() => '')).slice(0, 4000);
      if (detail.includes('Progress evidence is not enabled')) {
        progressAccepted = false; delete body.progress;
        response = await post(url, init, body);
      } else return new Response(null, { status: 422 });
    } else if (response.ok && body.progress) progressAccepted = true;
    if (!response.ok) return response;
    for (const item of fresh) state.sent.add(item.output);
    let answer = await response.json(); let requestId = body.request_id;
    const thread = decodeURIComponent(match[1]);
    const headers = init.headers;
    const call = async (path, payload) => {
      const reply = await base(parsed.origin + path, { method: payload === undefined ? 'GET' : 'POST', headers, signal: init.signal, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
      if (!reply.ok) { await reply.body?.cancel?.().catch(() => {}); const error = Error(`Tank refused the command (${reply.status}).`); error.status = reply.status; throw error; }
      return reply.json();
    };
    const preflight = answer.preflight ?? (answer.gate ? { ...answer.gate, status: answer.gate.reason ?? 'stopped' } : null);
    if (preflight && preflight.status === 'awaiting_approval' && preflight.approval_id) {
      const info = { ...preflight, reason: plainReason(preflight.status, preflight.message), waiting: true };
      onQuote(info);
      const approved = await decide(info);
      try {
        await call(`/v1/command/paid-steps/approvals/${encodeURIComponent(preflight.approval_id)}`, { approve: approved, reason: approved ? 'Approved in Opli Code' : 'Declined in Opli Code' });
      } catch (error) {
        onHold({ ...info, waiting: false, reason: error.status === 403 ? 'A tenant administrator must approve this paid step. No model call was made.' : 'Tank did not record the decision. No model call was made.' });
        return Response.json(answer);
      }
      if (!approved) { onHold({ ...info, waiting: false, status: 'declined', reason: plainReason('declined') }); return Response.json(answer); }
      // Same prompt, a fresh durable request. Tank has stored the plan; the held round's
      // results were already used to choose it, so they are not sent twice.
      const retry = { ...body, request_id: randomUUID(), continuation: true, tool_results: [] };
      if (retry.progress) retry.progress = await state.progress.envelope(folder());
      measure?.(bytes(retry), bytes({ ...original, request_id: retry.request_id, continuation: true }));
      const again = await post(url, init, retry);
      if (!again.ok) return again;
      answer = await again.json(); requestId = retry.request_id;
    } else if (preflight && preflight.status !== 'quoted') {
      onHold({ ...preflight, reason: plainReason(preflight.status, preflight.message), waiting: false });
      return Response.json(answer);
    }
    if (answer.preflight && answer.preflight.status !== 'quoted') onHold({ ...answer.preflight, reason: plainReason(answer.preflight.status, answer.preflight.message), waiting: false });
    else {
      // Auto: Tank quoted and proceeded. The quote is recorded on this turn's step.
      try {
        const snapshot = await call(`/v1/command/threads/${encodeURIComponent(thread)}`);
        const step = snapshot.steps?.find(item => item.step_id === requestId);
        if (step?.code_preflight?.quote) onQuote({ ...step.code_preflight, reason: 'Quoted before the model call; this account proceeds automatically.', waiting: false });
      } catch { /* The answer stands; a missing snapshot only hides the quote. */ }
    }
    return Response.json(answer);
  };
}
