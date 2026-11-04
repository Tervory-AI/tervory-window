import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {testEditor} from '../build/test-editor.mjs';
const root=resolve(import.meta.dirname,'..');
const executable=await testEditor();
const headless=process.platform==='linux'&&!process.env.DISPLAY;
const child=spawn(headless?'xvfb-run':process.execPath,headless?['-a',process.execPath,'scripts/electron.mjs']:['scripts/electron.mjs'],{
 cwd:resolve(root,'extensions/tervory-index'),stdio:'inherit',detached:process.platform!=='win32',
 env:{...process.env,VSCODE_EXECUTABLE_PATH:executable,TERVORY_EDITOR_CACHE:resolve(root,'.tmp/index-editor')},
});
function kill(){if(process.platform==='win32')execKill();else try{process.kill(-child.pid,'SIGKILL')}catch{}}
async function execKill(){const{execFileSync}=await import('node:child_process');try{execFileSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'})}catch{}}
const timer=setTimeout(()=>{console.error('Index editor acceptance exceeded 240 seconds');kill()},240000);
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1});
child.on('exit',code=>{clearTimeout(timer);if(process.platform!=='win32')kill();process.exitCode=code??1});
