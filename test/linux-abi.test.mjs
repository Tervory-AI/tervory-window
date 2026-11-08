import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { checkLinuxAbi } from '../build/linux-abi.mjs';

test('Linux ABI discovery handles shared extension dependencies and still rejects incompatible owned modules', {skip:process.platform!=='linux'}, async()=>{
  const built=await mkdtemp(resolve(tmpdir(),'tervory-abi-'));
  try{
    for(const name of ['bin','resources/app/node_modules.asar.unpacked','resources/app/extensions/node_modules','resources/app/extensions/fixture','resources/app/extensions/optional'])await mkdir(resolve(built,name),{recursive:true});
    // The pinned portable Node runtime has the same GLIBC 2.28 baseline.
    for(const name of ['opli-code','bin/tervory-tunnel','chrome-sandbox','chrome_crashpad_handler'])await symlink(process.execPath,resolve(built,name));
    await writeFile(resolve(built,'resources/app/extensions/fixture/package.json'),JSON.stringify({publisher:'tervory',name:'fixture'}));
    await writeFile(resolve(built,'resources/app/extensions/optional/package.json'),JSON.stringify({publisher:'upstream',name:'optional'}));
    const incompatible='/usr/bin/true';
    assert.match(execFileSync('readelf',['--version-info',incompatible],{encoding:'utf8'}),/GLIBC_2\.3[4-9]/);
    await copyFile(incompatible,resolve(built,'resources/app/extensions/optional/broker.so'));
    await checkLinuxAbi(built,['tervory.fixture']);
    await assert.rejects(checkLinuxAbi(built,['tervory.missing']),/Missing installed built-in: tervory.missing/);
    await copyFile(incompatible,resolve(built,'resources/app/extensions/fixture/addon.node'));
    await assert.rejects(checkLinuxAbi(built,['tervory.fixture']),/GLIBC newer than 2\.28 required by .*fixture\/addon.node/);
  }finally{await rm(built,{recursive:true,force:true});}
});
