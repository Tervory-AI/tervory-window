import { wizardBitmap } from './brand.mjs';
import { vendorCli } from './vendor-cli.mjs';
import { applyProduct } from './product.mjs';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createICO, createICNS } = require('png2icons');
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const pin = JSON.parse(await readFile(resolve(root, 'upstream.json')));
export const source = resolve(root, '.tmp/code-oss-source');
export async function prepare() {
  await vendorCli(process.env.TERVORY_CLI_SOURCE);
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  const archive = resolve(root, '.tmp/code-oss.tar.gz');
  try { await access(archive); }
  catch {
    const response = await fetch(`https://codeload.github.com/microsoft/vscode/tar.gz/${pin.commit}`, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw Error('Code-OSS source download failed.');
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (createHash('sha256').update(await readFile(archive)).digest('hex') !== pin.sha256) throw Error('Code-OSS source checksum mismatch.');
  try { await access(resolve(source, 'package.json')); }
  catch {
    await mkdir(source, { recursive: true });
    execFileSync('tar', ['-xzf', '../code-oss.tar.gz', '--strip-components=1'], { cwd: source });
  }
  if (JSON.parse(await readFile(resolve(source, 'package.json'))).version !== pin.release) throw Error('Wrong Code-OSS release.');
  const product = applyProduct(JSON.parse(await readFile(resolve(source, 'product.json'))));
  await writeFile(resolve(source, 'product.json'), JSON.stringify(product, null, 2) + '\n');
  // Tervory supplies the agent. The upstream Copilot build requires Microsoft's
  // publishing environment and must not be compiled or shipped in this product.
  const gulpfile = resolve(source, 'build/gulpfile.vscode.ts');
  const tasks = await readFile(gulpfile, 'utf8');
  const patched = tasks.replace(', compileCopilotExtensionBuildTask', '').replace(/^\s*compileCopilotExtensionBuildTask,\r?\n/gm, '').replace(/^\s*prepareCopilotRipgrepShimTask\(platform, arch, destinationFolderName\)\r?\n/gm, '');
  await writeFile(gulpfile, patched);
  // The local ONNX embedding runtime needs GLIBCXX_3.4.22 (GCC 6).
  // Keep upstream core dependency generation strict and declare our extension's
  // additional runtime requirement in the installer control template.
  const control = resolve(source, 'resources/linux/debian/control.template');
  await writeFile(control, (await readFile(control, 'utf8')).replace('Depends: @@DEPENDS@@\n', 'Depends: @@DEPENDS@@, libstdc++6 (>= 6)\n'));
  const logo = await readFile(resolve(root, 'vendor/brand/tervory-logo.png'));
  // Format conversion of the exact supplied logo, never a replacement drawing.
  const ico = createICO(logo, 0, 0, true); const icns = createICNS(logo, 0, 0);
  if (!ico || !icns) throw Error('Brand icon conversion failed.');
  await writeFile(resolve(source, 'resources/win32/code.ico'), ico);
  await writeFile(resolve(source, 'resources/darwin/code.icns'), icns);
  for (const file of ['resources/linux/code.png', 'resources/win32/code_70x70.png', 'resources/win32/code_150x150.png']) await writeFile(resolve(source, file), logo);
  const installer = resolve(source, 'build/win32/code.iss');
  let setup = await readFile(installer, 'utf8');
  setup = setup.replaceAll('AppPublisher=Microsoft Corporation', 'AppPublisher=Tervory').replaceAll('https://code.visualstudio.com/', 'https://tervory.com/');
  setup = setup.replace(/^WizardImageFile=.*$/m, 'WizardImageFile="{#RepoDir}\\resources\\win32\\tervory-wizard-large.bmp"').replace(/^WizardSmallImageFile=.*$/m, 'WizardSmallImageFile="{#RepoDir}\\resources\\win32\\tervory-wizard-small.bmp"');
  await writeFile(resolve(source, 'resources/win32/tervory-wizard-large.bmp'), wizardBitmap(logo, true));
  await writeFile(resolve(source, 'resources/win32/tervory-wizard-small.bmp'), wizardBitmap(logo));
  await writeFile(installer, setup);
  await writeFile(resolve(root, 'CODE-OSS.LICENSE'), (await readFile(resolve(source, 'LICENSE.txt'), 'utf8')).replaceAll('\r\n', '\n'));
  return source;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await prepare());
