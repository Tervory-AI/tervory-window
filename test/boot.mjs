import {spawn, spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdir,rm,readFile} from 'node:fs/promises';
const root=resolve(import.meta.dirname,'..');
const built=resolve(root,`.tmp/VSCode-${process.platform}-${process.arch}`);
const executable=process.platform==='darwin'?resolve(built,'Tervory.app/Contents/MacOS/Tervory'):resolve(built,process.platform==='win32'?'Tervory.exe':'tervory');
const project=resolve(root,'.tmp/boot-project');await mkdir(project,{recursive:true});
const result=resolve(root,'.tmp/native-panel-result');await rm(result,{force:true});
const panel=resolve(built,process.platform==='darwin'?'Tervory.app/Contents/Resources/app/extensions/extension':'resources/app/extensions/extension');
const args=[project,'--verbose','--log','trace','--no-sandbox','--disable-gpu','--skip-welcome','--skip-release-notes','--disable-workspace-trust','--user-data-dir',resolve(root,'.tmp/boot-user'),'--extensions-dir',resolve(root,'.tmp/boot-extensions'),'--extensionDevelopmentPath='+panel,'--extensionTestsPath='+resolve(root,'test/native.cjs')];
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY/i.test(key)||['NODE_OPTIONS','ELECTRON_RUN_AS_NODE'].includes(key))));
const child=spawn(executable,args,{stdio:'inherit',env:{...env,TERVORY_PANEL_TEST_RESULT:result}});
const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
child.on('exit',async code=>{
 clearTimeout(timer);
 if(code!==0){process.exitCode=code??1;return;}
 try{if(await readFile(result,'utf8')!=='passed')throw Error('Panel suite did not finish');}catch(error){console.error(error);process.exitCode=1;return;}
 const complete=spawnSync(process.execPath,['test/run.cjs'],{cwd:resolve(root,'extensions/tervory-complete'),stdio:'inherit',env:{...env,VSCODE_EXECUTABLE_PATH:executable,TERVORY_BUILT_WINDOW:'1'},timeout:180000});
 process.exitCode=complete.status??1;
});
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1});
