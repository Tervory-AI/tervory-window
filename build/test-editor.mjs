import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..');
export async function testEditor(download=false){
let executable=process.env.VSCODE_EXECUTABLE_PATH;
if(!executable){
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('Set VSCODE_EXECUTABLE_PATH to the built native editor.');
 const archive=resolve(root,'.tmp/codium.tar.gz'),out=resolve(root,'.tmp/codium');
 await mkdir(out,{recursive:true});
 try{await access(archive);}catch{if(!download)throw Error('Run node build/test-editor.mjs before offline tests.');const response=await fetch('https://github.com/VSCodium/vscodium/releases/download/1.143.17232/VSCodium-linux-x64-1.143.17232.tar.gz');if(!response.ok)throw Error('Editor fixture download failed');await writeFile(archive,Buffer.from(await response.arrayBuffer()));}
 if(createHash('sha256').update(await readFile(archive)).digest('hex')!=='ca1895aa040bd91a09c709d79eac7862d8c1aa0237fdc25b503deeb8bcd87efd')throw Error('Editor fixture checksum mismatch');
 executable=resolve(out,'codium');try{await access(executable);}catch{execFileSync('tar',['-xzf',archive,'-C',out]);}
}
return executable;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(await testEditor(true));
