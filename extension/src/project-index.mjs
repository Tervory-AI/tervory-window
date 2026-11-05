// Index results select context; the CLI re-reads each selected source through its
// own folder and secret checks before any text reaches the panel or Tank.
export async function projectMatches(vscode, CodeFolder, root, query, context = false) {
  const extension = vscode.extensions?.getExtension('tervory.tervory-index');
  if (!extension) return [];
  const api = await extension.activate();
  const options = { workspaceUri: root.toString(), limit: 20 };
  const hits = context ? await api.getRelevantCode(query, { ...options, maxCharacters: 12000 }) : await api.search(query, options);
  const local = await CodeFolder.create(root.fsPath); const matches = []; let remaining = 12000;
  for (const hit of hits) {
    if (!Number.isInteger(hit.startLine) || !Number.isInteger(hit.endLine) || hit.startLine < 1 || hit.endLine < hit.startLine || hit.endLine - hit.startLine > 200) continue;
    try {
      const data = await local.read(hit.path);
      if (!data.exists) continue;
      const text = data.text.split('\n').slice(hit.startLine - 1, hit.endLine).join('\n');
      if (!text || text.length > remaining) continue;
      matches.push({ path: hit.path, startLine: hit.startLine, endLine: hit.endLine, text }); remaining -= text.length;
    } catch { /* stale or refused source is omitted; never use cached text */ }
  }
  return matches;
}
