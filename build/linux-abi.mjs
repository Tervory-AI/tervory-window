import { execFileSync } from 'node:child_process';
import { readdir, open, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
export async function checkLinuxAbi(built, builtinIds) {
  const files = [resolve(built, 'tervory'), resolve(built, 'bin/tervory-tunnel'), resolve(built, 'chrome-sandbox'), resolve(built, 'chrome_crashpad_handler')];
  async function visit(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = resolve(folder, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.isFile() && (item.name.endsWith('.node') || /\.so(?:\.|$)/.test(item.name))) {
        const handle=await open(file,'r');const header=Buffer.alloc(20);
        try {await handle.read(header,0,20,0);}finally{await handle.close();}
        if(header.subarray(0,4).equals(Buffer.from([127,69,76,70])) && header.readUInt16LE(18)===(process.arch==='x64'?62:183))files.push(file);
      }
    }
  }
  await visit(resolve(built, 'resources/app/node_modules.asar.unpacked'));
  // The upstream dependency contract covers its core runtime. Apply the same
  // baseline to every built-in we add, including its native dependencies.
  // Upstream optional brokers keep their own platform compatibility/fallbacks.
  const extensions=resolve(built,'resources/app/extensions');
  const found=new Set();
  for(const entry of await readdir(extensions,{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    const folder=resolve(extensions,entry.name);
    let pkg;
    try {pkg=JSON.parse(await readFile(resolve(folder,'package.json'),'utf8'));}
    catch(error){if(error.code==='ENOENT')continue;throw error;}
    const id=`${pkg.publisher}.${pkg.name}`;
    if(builtinIds.includes(id)){found.add(id);await visit(folder);}
  }
  for(const id of builtinIds)if(!found.has(id))throw Error(`Missing installed built-in: ${id}`);
  for (const file of files) {
    const output = execFileSync('readelf', ['--version-info', file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const versions = [...new Set(output.match(/GLIBC_[0-9.]+/g) ?? [])];
    console.log(`ABI ${relative(built, file)}: ${versions.join(', ')}`);
    if (versions.some(version => { const [major, minor] = version.slice(6).split('.').map(Number); return major > 2 || major === 2 && minor > 28; })) throw Error(`GLIBC newer than 2.28 required by ${relative(built, file)}`);
  }
}
