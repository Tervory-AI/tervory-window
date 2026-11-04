import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
export async function checkLinuxAbi(built) {
  const files = [resolve(built, 'tervory'), resolve(built, 'bin/tervory-tunnel'), resolve(built, 'chrome-sandbox'), resolve(built, 'chrome_crashpad_handler')];
  async function visit(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = resolve(folder, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.isFile() && item.name.endsWith('.node')) files.push(file);
    }
  }
  await visit(resolve(built, 'resources/app/node_modules.asar.unpacked'));
  for (const file of files) {
    const output = execFileSync('readelf', ['--version-info', file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const versions = [...new Set(output.match(/GLIBC_[0-9.]+/g) ?? [])];
    console.log(`ABI ${relative(built, file)}: ${versions.join(', ')}`);
    if (versions.some(version => { const [major, minor] = version.slice(6).split('.').map(Number); return major > 2 || major === 2 && minor > 28; })) throw Error(`GLIBC newer than 2.28 required by ${relative(built, file)}`);
  }
}
