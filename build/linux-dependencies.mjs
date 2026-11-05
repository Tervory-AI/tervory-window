// ARM core modules use Electron libc++ like x64. The index's separate libstdc++
// requirement remains declared in the DEB control template. Retain strict
// comparison against this exact measured core reference, not a filtered result.
export function patchArmDependencyReference(text) {
  const marker = '// Tervory ARM core uses Electron libc++; index dependencies are declared separately.';
  if (text.includes(marker)) return text;
  const match = /\t'arm64': \[([\s\S]*?)\n\t\]/.exec(text);
  if (!match) throw Error('Pinned ARM dependency reference changed');
  let body = match[1];
  for (const version of ['4.1.1', '5', '5.2', '6', '9']) {
    const line = `\n\t\t'libstdc++6 (>= ${version})',`;
    if (!body.includes(line)) throw Error('Pinned ARM C++ dependency reference changed');
    body = body.replace(line, '');
  }
  return text.replace(match[0], `\t${marker}\n\t'arm64': [${body}\n\t]`);
}
