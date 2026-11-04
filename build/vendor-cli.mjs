import {execFileSync} from 'node:child_process';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(import.meta.dirname,'..');
export async function vendorCli(local){
 const pin=JSON.parse(await readFile(resolve(root,'cli-source.json')));
 const cache=resolve(root,'.tmp/cli-source');
 await mkdir(cache,{recursive:true});
 const git=args=>execFileSync('git',['-C',cache,...args],{encoding:'utf8'});
 git(['init','--quiet']);
 git(['fetch','--depth=1',local||pin.repository,pin.commit]);
 if(git(['rev-parse','FETCH_HEAD']).trim()!==pin.commit)throw Error('CLI commit mismatch.');
 const output=resolve(root,'vendor');await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
 const archive=execFileSync('git',['-C',cache,'archive',pin.commit,'cli/src','cli/package.json','cli/package-lock.json','workspace/public/brand/tervory-logo.png'],{maxBuffer:32*1024*1024});
 execFileSync('tar',['-x','-C',output],{input:archive});
 await mkdir(resolve(output,'brand'),{recursive:true});
 const {rename}=await import('node:fs/promises');
 await rename(resolve(output,'workspace/public/brand/tervory-logo.png'),resolve(output,'brand/tervory-logo.png'));
 await rm(resolve(output,'workspace'),{recursive:true,force:true});
}
if(process.argv[1]===fileURLToPath(import.meta.url))await vendorCli(process.argv[2]);
