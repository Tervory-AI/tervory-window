// Assemble a draft release from the six native build artifacts: installers, archives,
// one SHA256SUMS and notes. The founder publishes the draft; nothing here publishes.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64'];
const ASSET = /\.(deb|exe|dmg|tar\.gz)$/;
const sha256 = path => new Promise((done, fail) => { const hash = createHash('sha256'); createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', fail).on('end', () => done(hash.digest('hex'))); });

export function notes(version, builds) {
  const signed = Object.fromEntries(builds.map(build => [build.target, build.signed]));
  const unsignedMac = TARGETS.filter(target => target.startsWith('darwin') && !signed[target]).length > 0;
  const unsignedWindows = TARGETS.filter(target => target.startsWith('win32') && !signed[target]).length > 0;
  const lines = [`Opli Code ${version}`, '', 'Draft for the founder to publish. Each file is listed in SHA256SUMS.', '',
    '| Desktop | Download |', '|---|---|'];
  for (const build of builds) for (const file of build.files) lines.push(`| ${build.target}${build.signed ? ' (signed)' : ' (unsigned)'} | ${file} |`);
  lines.push('', 'Check a download: `shasum -a 256 -c SHA256SUMS --ignore-missing` (macOS/Linux) or `Get-FileHash <file>` (Windows).', '');
  if (unsignedMac) lines.push('**macOS (unsigned build).** Open the .dmg and drag Opli Code to Applications. The first time, macOS blocks it: open System Settings → Privacy & Security, scroll to "Opli Code was blocked", choose Open Anyway and confirm. Or run `xattr -dr com.apple.quarantine "/Applications/Opli Code.app"` once in Terminal. Apple silicon Macs use darwin-arm64; Intel Macs use darwin-x64.', '');
  else lines.push('**macOS.** Open the .dmg and drag Opli Code to Applications. The build is signed and notarised.', '');
  if (unsignedWindows) lines.push('**Windows (unsigned build).** Run the setup .exe. If SmartScreen shows "Windows protected your PC", choose More info → Run anyway. Most PCs use win32-x64; Surface/Snapdragon PCs use win32-arm64.', '');
  else lines.push('**Windows.** Run the setup .exe. The installer is signed.', '');
  lines.push('**Linux.** Debian/Ubuntu: `sudo apt install ./<file>.deb`, then start Opli Code from the app menu. Other distributions: extract the .tar.gz and run `./opli-code` inside it. Linux packages are not signed.', '',
    'Open Opli Code, open a project folder, then choose Trigger sign-in in the Opli Code panel.');
  return lines.join('\n') + '\n';
}

/** artifacts/<name>/... from the build job → release/ with SHA256SUMS and NOTES.md. */
export async function assemble(artifacts, output, version) {
  await mkdir(output, { recursive: true });
  const builds = []; let sums = '';
  for (const target of TARGETS) {
    const folder = resolve(artifacts, `opli-code-${target}-unsigned`);
    const manifest = JSON.parse(await readFile(resolve(folder, 'build.json'), 'utf8'));
    const files = (await readdir(folder)).filter(name => ASSET.test(name)).sort();
    if (!files.some(name => /\.(deb|exe|dmg)$/.test(name))) throw Error(`Missing installer for ${target}`);
    for (const name of files) {
      await cp(resolve(folder, name), resolve(output, name));
      sums += `${await sha256(resolve(output, name))}  ${name}\n`;
    }
    builds.push({ target, signed: manifest.signed === true, files });
  }
  await writeFile(resolve(output, 'SHA256SUMS'), sums);
  await writeFile(resolve(output, 'NOTES.md'), notes(version, builds));
  const sizes = [];
  for (const name of (await readdir(output)).sort()) sizes.push(`${basename(name)} ${(await stat(resolve(output, name))).size}`);
  return { builds, sizes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [artifacts, output, version] = process.argv.slice(2);
  const result = await assemble(resolve(artifacts), resolve(output), version);
  console.log(result.sizes.join('\n'));
}
