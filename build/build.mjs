import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { prepare, root, pin, source } from './prepare.mjs';
import { installExtensions } from './extensions.mjs';
import { installTunnel } from './tunnel.mjs';
import { linuxEnvironment } from './native-environment.mjs';
import { checkLinuxAbi } from './linux-abi.mjs';
import { sealMacApp } from './macos-integrity.mjs';
const platform = process.platform; const arch = process.arch;
if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw Error('Unsupported build host');
if (process.versions.node.split('.')[0] !== pin.node.split('.')[0]) throw Error(`Use Node ${pin.node}`);
await prepare();
let nativeEnvironment = {};
const npm = (args, cwd = source) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, stdio: 'inherit', env: { ...process.env, ...nativeEnvironment, VSCODE_QUALITY: 'oss', VSCODE_ARCH: arch, BUILD_SOURCEVERSION: pin.commit } });
if (platform === 'linux') {
  npm(['ci'], resolve(source, 'build'));
  nativeEnvironment = linuxEnvironment(source);
}
// Code-OSS postinstall builds its platform-native modules. Do not disable scripts.
npm(['ci']);
npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], resolve(root, 'vendor/cli'));
npm(['run', 'gulp', '--', `vscode-${platform}-${arch}-min`]);
const built = resolve(source, `../VSCode-${platform}-${arch}`);
await installTunnel(source, built, pin);
// Copilot is excluded from the distribution. Tervory's extension is copied from
// our own build below, with the unmodified CLI source, rather than a second agent.
const resources = platform === 'darwin' ? resolve(built, 'Opli Code.app/Contents/Resources/app') : resolve(built, 'resources/app');
await rm(resolve(resources, 'extensions/copilot'), { recursive: true, force: true });
const builtinIds = await installExtensions(root, resources);
if (platform === 'darwin') await sealMacApp(source, resolve(built, 'Opli Code.app'));
const out = resolve(root, 'dist'); await mkdir(out, { recursive: true });
// Use the upstream platform installers. Signing stays off until configured.
if (platform === 'win32') {
  npm(['run', 'gulp', '--', `vscode-win32-${arch}-inno-updater`]);
  npm(['run', 'gulp', '--', `vscode-win32-${arch}-user-setup`]);
  await cp(resolve(source, `.build/win32-${arch}/user-setup/VSCodeSetup.exe`), resolve(out, `opli-code-win32-${arch}-setup.exe`));
} else if (platform === 'linux') {
  await checkLinuxAbi(built, builtinIds);
  npm(['run', 'gulp', '--', `vscode-linux-${arch}-prepare-deb`]);
  npm(['run', 'gulp', '--', `vscode-linux-${arch}-build-deb`]);
  const debs = resolve(source, `.build/linux/deb/${arch === 'x64' ? 'amd64' : 'arm64'}/deb`);
  for (const deb of await readdir(debs)) if (deb.endsWith('.deb')) await cp(resolve(debs, deb), resolve(out, deb));
} else {
  const image = resolve(out, `opli-code-darwin-${arch}.dmg`);
  for (let attempt = 0; ; attempt++) {
    try {
      const output = execFileSync('hdiutil', ['create', '-volname', 'Opli Code', '-srcfolder', built, '-fs', 'HFS+', '-ov', '-format', 'UDZO', image], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      process.stdout.write(output); break;
    } catch (error) {
      const message = String(error.stderr ?? ''); process.stderr.write(message);
      if (attempt === 4 || !message.includes('Resource busy')) throw error;
      await new Promise(done => setTimeout(done, 1000 * 2 ** attempt));
    }
  }
}
const file = `opli-code-${platform}-${arch}.tar.gz`;
const archiveTool = platform === 'win32' ? resolve(process.env.SystemRoot, 'System32/tar.exe') : 'tar';
execFileSync(archiveTool, ['-czf', file, '-C', built, '.'], { cwd: out, stdio: 'inherit' });
let sums = '';
for (const name of await readdir(out)) {
  if (!/\.(deb|exe|dmg|gz)$/.test(name)) continue;
  sums += `${createHash('sha256').update(await readFile(resolve(out, name))).digest('hex')}  ${name}\n`;
}
await writeFile(resolve(out, 'SHA256SUMS'), sums);
await writeFile(resolve(out, 'build.json'), JSON.stringify({ upstream: pin, platform, arch, signed: false, integritySignature: platform === 'darwin' ? 'ad-hoc' : undefined, files: await readdir(out) }, null, 2));
console.log(resolve(out, file));
