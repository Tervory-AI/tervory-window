import {spawn, spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdir,rm,readFile} from 'node:fs/promises';
import {diagnosticPort,rendererDiagnostics} from './renderer-diagnostics.mjs';
const root=resolve(import.meta.dirname,'..');
const built=resolve(root,`.tmp/VSCode-${process.platform}-${process.arch}`);
const executable=process.platform==='darwin'?resolve(built,'Tervory.app/Contents/MacOS/Tervory'):resolve(built,process.platform==='win32'?'Tervory.exe':'tervory');
const project=resolve(root,'.tmp/boot-project');await mkdir(project,{recursive:true});
const result=resolve(root,'.tmp/native-panel-result');await rm(result,{force:true});
const panel=resolve(built,process.platform==='darwin'?'Tervory.app/Contents/Resources/app/extensions/extension':'resources/app/extensions/extension');
const port=await diagnosticPort();
const logs=resolve(root,'.tmp/boot-user/logs');await mkdir(logs,{recursive:true});
const stopDiagnostics=rendererDiagnostics(port,resolve(logs,'renderer.json'));
const args=[project,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--verbose','--log','trace','--no-sandbox','--disable-gpu','--skip-welcome','--skip-release-notes','--disable-workspace-trust','--user-data-dir',resolve(root,'.tmp/boot-user'),'--extensions-dir',resolve(root,'.tmp/boot-extensions'),'--extensionDevelopmentPath='+panel,'--extensionTestsPath='+resolve(root,'test/native.cjs')];
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY/i.test(key)||['NODE_OPTIONS','ELECTRON_RUN_AS_NODE'].includes(key))));
const child=spawn(executable,args,{stdio:'inherit',env:{...env,ELECTRON_ENABLE_LOGGING:'1',ELECTRON_ENABLE_STACK_DUMPING:'1',ELECTRON_LOG_FILE:resolve(root,'.tmp/boot-user/logs/electron.log'),TERVORY_PANEL_TEST_RESULT:result}});
const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
child.on('exit',async code=>{
 clearTimeout(timer);await stopDiagnostics();
 if(code!==0){process.exitCode=code??1;return;}
 try{if(await readFile(result,'utf8')!=='passed')throw Error('Panel suite did not finish');}catch(error){console.error(error);process.exitCode=1;return;}
 const complete=spawnSync(process.execPath,['test/run.cjs'],{cwd:resolve(root,'extensions/tervory-complete'),stdio:'inherit',env:{...env,VSCODE_EXECUTABLE_PATH:executable,TERVORY_BUILT_WINDOW:'1',TERVORY_COMPLETE_EXTENSION_PATH:resolve(panel,'../tervory-complete')},timeout:180000});
 if(complete.status!==0){process.exitCode=complete.status??1;return;}
 const index=spawnSync(process.execPath,['scripts/electron.mjs'],{cwd:resolve(root,'extensions/tervory-index'),stdio:'inherit',env:{...env,VSCODE_EXECUTABLE_PATH:executable,TERVORY_EDITOR_CACHE:resolve(root,'.tmp/index-native'),TERVORY_INDEX_EXTENSION_PATH:resolve(panel,'../tervory-index')},timeout:180000});
 process.exitCode=index.status??1;
});
child.on('error',async error=>{clearTimeout(timer);await stopDiagnostics();console.error(error);process.exitCode=1});
