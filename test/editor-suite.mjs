import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {testEditor} from '../build/test-editor.mjs';
const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'extensions/tervory-complete');
const executable=await testEditor();
const env={...process.env,TERVORY_CLI_ROOT:resolve(root,'vendor/cli'),VSCODE_EXECUTABLE_PATH:executable};
execFileSync(process.execPath,['build.mjs'],{cwd:folder,env,stdio:'inherit'});
if(process.platform==='linux'&&!process.env.DISPLAY)execFileSync('xvfb-run',['-a',process.execPath,'test/run.cjs'],{cwd:folder,env,stdio:'inherit',timeout:240000});
else execFileSync(process.execPath,['test/run.cjs'],{cwd:folder,env,stdio:'inherit',timeout:240000});
