import { build } from 'esbuild';
import { resolve } from 'node:path';
const cliRoot = resolve(process.env.TERVORY_CLI_ROOT ?? '../../.tmp/tank-client/cli');
import { mkdir, cp } from 'node:fs/promises';
await build({ entryPoints: ['src/extension.mjs'], outfile: 'dist/extension.cjs', bundle: true,
  alias: { '@tervory/cli-client': resolve(cliRoot, 'src/client.mjs') },
  platform: 'node', format: 'cjs', target: 'node20', external: ['vscode', '@napi-rs/keyring'],
  define: { 'import.meta.url': 'bundleUrl' },
  banner: { js: 'const bundleUrl = require("node:url").pathToFileURL(__filename).href;' }, logLevel: 'info' });
// Preserve the existing CLI sandbox resource beside its bundle.
await mkdir('dist', { recursive: true });
await cp(resolve(cliRoot, 'src/seatbelt-base.sbpl'), 'dist/seatbelt-base.sbpl');
