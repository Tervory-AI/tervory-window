import {spawn, spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const root=resolve(import.meta.dirname,'..');
const built=resolve(root,`.tmp/VSCode-${process.platform}-${process.arch}`);
const executable=process.platform==='darwin'?resolve(built,'Tervory.app/Contents/MacOS/Electron'):resolve(built,process.platform==='win32'?'Tervory.exe':'tervory');
const project=resolve(root,'.tmp/boot-project');await mkdir(project,{recursive:true});
const args=[project,'--no-sandbox','--disable-gpu','--skip-welcome','--skip-release-notes','--user-data-dir',resolve(root,'.tmp/boot-user'),'--extensions-dir',resolve(root,'.tmp/boot-extensions'),'--extensionDevelopmentPath='+resolve(root,'extension'),'--extensionTestsPath='+resolve(root,'test/native.cjs')];
const child=spawn(executable,args,{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
child.on('exit',code=>{
 clearTimeout(timer);
 if(code!==0){process.exitCode=code??1;return;}
 const complete=spawnSync(process.execPath,['test/run.cjs'],{cwd:resolve(root,'extensions/tervory-complete'),stdio:'inherit',env:{...process.env,VSCODE_EXECUTABLE_PATH:executable},timeout:180000});
 process.exitCode=complete.status??1;
});
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1});
