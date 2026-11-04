import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'extensions/tervory-complete');
let executable=process.env.VSCODE_EXECUTABLE_PATH;
if(!executable){
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('Set VSCODE_EXECUTABLE_PATH to the built native editor.');
 const archive=resolve(root,'.tmp/codium.tar.gz'),out=resolve(root,'.tmp/codium');
 await mkdir(out,{recursive:true});
 try{await access(archive);}catch{const response=await fetch('https://github.com/VSCodium/vscodium/releases/download/1.143.17232/VSCodium-linux-x64-1.143.17232.tar.gz');if(!response.ok)throw Error('Editor fixture download failed');await writeFile(archive,Buffer.from(await response.arrayBuffer()));}
 if(createHash('sha256').update(await readFile(archive)).digest('hex')!=='ca1895aa040bd91a09c709d79eac7862d8c1aa0237fdc25b503deeb8bcd87efd')throw Error('Editor fixture checksum mismatch');
 executable=resolve(out,'codium');try{await access(executable);}catch{execFileSync('tar',['-xzf',archive,'-C',out]);}
}
const env={...process.env,TERVORY_CLI_ROOT:resolve(root,'vendor/cli'),VSCODE_EXECUTABLE_PATH:executable};
execFileSync(process.execPath,['build.mjs'],{cwd:folder,env,stdio:'inherit'});
if(process.platform==='linux'&&!process.env.DISPLAY)execFileSync('xvfb-run',['-a',process.execPath,'test/run.cjs'],{cwd:folder,env,stdio:'inherit',timeout:240000});
else execFileSync(process.execPath,['test/run.cjs'],{cwd:folder,env,stdio:'inherit',timeout:240000});
