import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installExtensions} from '../build/extensions.mjs';
import {applyProduct} from '../build/product.mjs';

test('every sibling built-in extension and its local model assets are packaged',async()=>{
 const root=await mkdtemp(join(tmpdir(),'window-builtins-'));const out=join(root,'out');
 try{
  for(const name of ['tervory-complete','tervory-index','tervory-agents']){
   const dir=join(root,'extensions',name);await mkdir(join(dir,'models'),{recursive:true});
   await writeFile(join(dir,'package.json'),JSON.stringify({name,publisher:'tervory',main:'main.cjs'}));
   await writeFile(join(dir,'main.cjs'),'exports.activate = () => {};\n');
   await writeFile(join(dir,'models/fixture.bin'),'placeholder-model');
  }
  assert.deepEqual(await installExtensions(root,out),['tervory.tervory-agents','tervory.tervory-complete','tervory.tervory-index']);
  for(const name of ['tervory-complete','tervory-index','tervory-agents'])assert.equal(await readFile(join(out,'extensions',name,'models/fixture.bin'),'utf8'),'placeholder-model');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('real product patch isolates Tervory identities, Open VSX and telemetry policy',()=>{
 const p=applyProduct({nameShort:'Code - OSS',win32x64AppId:'old',defaultChatAgent:{extensionId:'GitHub.copilot'},aiConfig:{ariaKey:'placeholder'},builtInExtensions:[{name:'GitHub.copilot'},{name:'debugger'}]});
 assert.equal(p.nameShort,'Tervory');assert.equal(p.nameLong,'Tervory');assert.equal(p.applicationName,'tervory');assert.notEqual(p.win32x64AppId,'old');
 assert.equal(p.extensionsGallery.serviceUrl,'https://open-vsx.org/vscode/gallery');assert.equal(p.enableTelemetry,false);assert.equal(p.enableCrashReporter,false);assert.equal(p.defaultChatAgent,undefined);assert.equal(p.aiConfig,undefined);assert.deepEqual(p.builtInExtensions,[{name:'debugger'}]);
});
