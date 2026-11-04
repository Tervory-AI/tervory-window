import {execFileSync,spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {testEditor} from '../build/test-editor.mjs';
const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'extensions/tervory-complete');
const executable=await testEditor();
const env={...process.env,TERVORY_CLI_ROOT:resolve(root,'vendor/cli'),VSCODE_EXECUTABLE_PATH:executable};
execFileSync(process.execPath,['build.mjs'],{cwd:folder,env,stdio:'inherit'});
const headless=process.platform==='linux'&&!process.env.DISPLAY;
const child=spawn(headless?'xvfb-run':process.execPath,headless?['-a',process.execPath,'test/run.cjs']:['test/run.cjs'],{cwd:folder,env,stdio:'inherit',detached:process.platform!=='win32'});
function kill() {
  if(process.platform==='win32')execFileSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});
  else try{process.kill(-child.pid,'SIGKILL')}catch{}
}
const timer=setTimeout(()=>{console.error('Editor acceptance exceeded 240 seconds');kill()},240000);
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1});
child.on('exit',code=>{clearTimeout(timer);if(process.platform!=='win32')kill();process.exitCode=code??1});
