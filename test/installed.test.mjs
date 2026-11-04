import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,access,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installExtensions} from '../build/extensions.mjs';
test('actual integrated built-ins install with loadable CLI, fonts and entry points',async()=>{
 const root=resolve(import.meta.dirname,'..');const out=await mkdtemp(resolve(root,'.tmp/installed-'));
 try{
  const ids=await installExtensions(root,out);
  for(const id of ['tervory.tervory-panel','tervory.tervory-complete','tervory.tervory-agents'])assert(ids.includes(id));
  for(const name of ['extension','tervory-complete','tervory-agents']){
   const folder=resolve(out,'extensions',name),pkg=JSON.parse(await readFile(resolve(folder,'package.json')));
   await access(resolve(folder,pkg.main));
  }
  const panel=resolve(out,'extensions/extension');
  const {html}=await import(pathToFileURL(resolve(panel,'src/extension.mjs')).href);
  assert(html('fixture').includes('Trigger sign-in'));
  const {cli}=await import(pathToFileURL(resolve(panel,'src/session.mjs')).href);
  assert.equal(typeof (await cli('client.mjs')).Tank,'function');
 }finally{await rm(out,{recursive:true,force:true});}
});
