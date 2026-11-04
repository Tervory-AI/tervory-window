import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { redactSecrets } from '../vendor/cli/src/code-tools.mjs';
const root = resolve(import.meta.dirname, '..');
const tmp = resolve(root, '.tmp');
const output = resolve(tmp, 'diagnostics');
await mkdir(output, { recursive: true });
const secrets = Object.entries(process.env).filter(([key, value]) => /TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY/i.test(key) && value?.length >= 8).map(([, value]) => value);
if (process.env.GITHUB_TOKEN) secrets.push(Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString('base64'), Buffer.from(process.env.GITHUB_TOKEN).toString('base64'));
async function collect(folder) {
  for (const item of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const path = resolve(folder, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) await collect(path);
    else if (item.isFile() && /\.(log|txt|json)$/.test(item.name)) {
      let text = (await readFile(path)).subarray(0, 2 * 1024 * 1024).toString('utf8');
      for (const value of secrets) text = text.replaceAll(value, '[REDACTED]');
      await writeFile(resolve(output, relative(tmp, path).replaceAll(/[\\/]/g, '_')), redactSecrets(text));
    }
  }
}
await collect(resolve(tmp, 'boot-user/logs'));
for (const name of await readdir(tmp)) if (name.startsWith('complete-electron-')) await collect(resolve(tmp, name, 'user/logs'));
