// All context consumers share a UTF-8 wire budget. Counting one token per byte
// is deliberately conservative for byte-level tokenizers; no model/tokenizer runs.
export const CONTEXT_LIMITS = Object.freeze({ maxBytes: 24000, maxTokens: 24000 });
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
export function boundedContext(input, limits = CONTEXT_LIMITS) {
  const cap = Math.max(0, Math.min(CONTEXT_LIMITS.maxBytes, CONTEXT_LIMITS.maxTokens,
    Number.isFinite(limits.maxBytes) ? Math.floor(limits.maxBytes) : CONTEXT_LIMITS.maxBytes,
    Number.isFinite(limits.maxTokens) ? Math.floor(limits.maxTokens) : CONTEXT_LIMITS.maxTokens));
  const result = { rules: input.rules ?? '', ...(input.language ? { language: input.language } : {}),
    ...(input.selection !== undefined ? { selection: input.selection } : {}), prefix: '', suffix: '', tabs: [] };
  if (bytes(result) > cap) throw Error(input.selection !== undefined ? 'Selection exceeds the limit' : 'Project rules exceed the limit');
  // Keep rules and selected code intact. Take source nearest the cursor first.
  const fit = (key, text, tail, ceiling = cap) => {
    const chars = [...text]; let low = 0, high = Math.min(chars.length, cap);
    while (low < high) {
      const n = Math.ceil((low + high) / 2);
      result[key] = (tail ? chars.slice(-n) : chars.slice(0, n)).join('');
      if (bytes(result) <= ceiling) low = n; else high = n - 1;
    }
    result[key] = low ? (tail ? chars.slice(-low) : chars.slice(0, low)).join('') : '';
  };
  // Leave cursor windows room even when a large map or neighboring file fits.
  const reserve = input.prefix || input.suffix ? Math.floor((cap - bytes(result)) * 0.6) : 0;
  for (const tab of (input.tabs ?? []).slice(0, 50)) {
    if (result.tabs.some(item => item.path === tab.path)) continue;
    const item = { path: tab.path, text: tab.text };
    result.tabs.push(item);
    if (bytes(result) > cap - reserve) result.tabs.pop();
    if (result.tabs.length === 20) break;
  }
  const prefixCeiling = input.suffix ? bytes(result) + Math.floor((cap - bytes(result)) * 0.65) : cap;
  fit('prefix', input.prefix ?? '', true, prefixCeiling);
  fit('suffix', input.suffix ?? '', false);
  return result;
}
