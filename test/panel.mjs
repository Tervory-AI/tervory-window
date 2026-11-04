// External boundaries only: real panel, real CLI and CodeFolder execute below.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { activate } from '../extension/src/extension.mjs';
const token = region => `tv1.${region}.${'1'.repeat(32)}.${('placeholder'+'x'.repeat(43)).slice(0,43)}`;
const receipt = {rows:[{cost_usd:0.01,baseline_cost_usd:0.04,saved_usd:0.03}]};
const patch = name => `--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-old\n+new\n`;
export async function scenario(name) {
  const root = await mkdtemp(join(tmpdir(),'window-proof-'));
  execFileSync('git',['init','-q',root]);
  for(const file of ['file.txt','second.txt'])await writeFile(join(root,file),'old\n');
  let message; let disposed; let api; let round=0; let region='us-east'; let prompt='Confirm'; const calls=[]; const outputs=[]; const previews=[]; const terminals=[];
  const secrets=new Map([['tervory.session',token(region)]]);
  const original=globalThis.fetch;
  const uri = value=>({scheme:value.startsWith('tervory-diff:')?'tervory-diff':'file',fsPath:value,toString:()=>value});
  const context={subscriptions:[],secrets:{get:async key=>secrets.get(key),store:async(key,value)=>secrets.set(key,value),delete:async key=>secrets.delete(key)}};
  const commands=new Map();
  const vscode={
    Uri:{parse:uri}, EventEmitter:class{event=()=>({dispose(){}});fire(value){terminals.push(value);}dispose(){}},
    workspace:{isTrusted:true,workspaceFolders:[{uri:uri(root)}],asRelativePath:()=> 'file.txt',registerTextDocumentContentProvider:()=>({dispose(){}})},
    env:{openExternal:async value=>{assert(value.toString().startsWith('https://'));}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return{dispose(){}};},executeCommand:async(...args)=>{previews.push(args);}},
    window:{activeTextEditor:{document:{uri:uri(join(root,'file.txt'))}},showQuickPick:async items=>items.find(item=>item.value===region),
      showWarningMessage:async()=>prompt,createTerminal:()=>({show(){},dispose(){}}),
      registerWebviewViewProvider:(id,provider)=>{api=provider;return{dispose(){}};}},
  };
  const until=async predicate=>{for(let n=0;n<300;n++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Panel fixture timed out: '+name);};
  globalThis.fetch=async(url,init={})=>{
    const parsed=new URL(url);const body=init.body?JSON.parse(init.body):null;
    assert.equal(parsed.origin,region==='za'?'https://za.tervory.com':'https://app.tervory.com');
    calls.push({path:parsed.pathname,body});
    if(parsed.pathname.endsWith('/device/code'))return Response.json({device_code:'placeholder-device',user_code:'BCDF-GHJK',verification_uri:'https://app.tervory.com/cli/device',expires_in:20,interval:1});
    if(parsed.pathname.endsWith('/device/token'))return Response.json({access_token:token(region),refresh_token:`tvr1.${region}.${'1'.repeat(32)}.${('placeholder'+'r'.repeat(43)).slice(0,43)}`,expires_at:new Date(Date.now()+3600000).toISOString(),refresh_expires_at:new Date(Date.now()+86400000).toISOString()});
    assert.equal(init.headers.Authorization,`Bearer ${token(region)}`);
    if(parsed.pathname.endsWith('/threads'))return Response.json({thread_id:'placeholder-thread'});
    if(parsed.pathname.endsWith('/turn')) {
      assert.equal(body.model,'auto');assert(body.text.includes('file.txt'));assert(body.text.includes('old'));
      return new Response('event: token\ndata: '+JSON.stringify({text:'Project answer.'})+'\n\nevent: receipt\ndata: '+JSON.stringify(receipt)+'\n\nevent: done\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream'}});
    }
    if(parsed.pathname.endsWith('/code-turn')) {
      assert.equal(body.model,'auto');
      if(!body.continuation)round=0;
      const requests=round++===0?[{name:'read_file',arguments:{path:'file.txt'}},{name:'read_file',arguments:{path:'second.txt'}}]:round===2?[{name:'propose_edit',arguments:{diff:patch('file.txt')+patch('second.txt')}}]:[];
      return Response.json({answer:'',receipt,requests});
    }
    throw Error('Unexpected fixture route: '+parsed.pathname);
  };
  try {
    const result=await activate(vscode,context);
    api.resolveWebviewView({webview:{options:{},postMessage:value=>{outputs.push(value);if(value.type==='approval')queueMicrotask(()=>message({type:'approve',id:value.id,approved:prompt==='Confirm'}));},onDidReceiveMessage:fn=>{message=fn;return{dispose(){}};}},onDidDispose:fn=>{disposed=fn;return{dispose(){}};}});
    if(name==='ask') {await message({type:'ask',text:'read this project'});assert(outputs.some(x=>x.text?.includes('Project answer.')));assert(outputs.some(x=>x.text?.includes('0.01')));}
    else if(name==='signin-us'||name==='signin-za') {
      region=name==='signin-za'?'za':'us-east';secrets.clear();
      // Current CLI ZA requires its pinned Zitadel response. No desktop-specific provider flow.
      if(region==='za') {
        const transport=globalThis.fetch;
        globalThis.fetch=async(url,init)=>{const response=await transport(url,init);if(String(url).endsWith('/device/code'))return Response.json({...await response.json(),identity_provider:'zitadel',user_code:'1234-5678',verification_uri:'https://auth-za.tervory.com/device',verification_uri_complete:'https://auth-za.tervory.com/device?user_code=1234-5678'});return response;};
      }
      await result.signIn();assert(JSON.parse(secrets.get('tervory.session')).region===region);
    } else if(name==='trust') {vscode.workspace.isTrusted=false;await message({type:'code',text:'change files'});assert.equal(calls.length,0);assert(outputs.some(x=>x.text?.includes('Trust')));}
    else {
      const running=message({type:'code',text:'change both files'});
      await until(()=>outputs.some(x=>x.type==='review'));
      const review=outputs.find(x=>x.type==='review');assert.equal(review.files.length,2);
      assert.equal(await readFile(join(root,'file.txt'),'utf8'),'old\n');
      await message({type:'preview',name:'file.txt'});assert.equal(previews.at(-1)[0],'vscode.diff');
      if(name==='reject') {await message({type:'accept',hunks:[]});await until(()=>outputs.filter(x=>x.type==='ready').length>=1);assert.equal(await readFile(join(root,'file.txt'),'utf8'),'old\n');}
      else {
        await message({type:'accept',hunks:name==='partial'?[0]:[0,1]});
        await until(async()=>await readFile(join(root,'file.txt'),'utf8')==='new\n' && await readFile(join(root,'second.txt'),'utf8')===(name==='partial'?'old\n':'new\n'));
        assert.equal(await readFile(join(root,'second.txt'),'utf8'),name==='partial'?'old\n':'new\n');
        if(name==='undo') {await until(()=>outputs.filter(x=>x.type==='ready').length>=1);await message({type:'undo'});await until(async()=>await readFile(join(root,'file.txt'),'utf8')==='old\n' && await readFile(join(root,'second.txt'),'utf8')==='old\n');assert.equal(await readFile(join(root,'second.txt'),'utf8'),'old\n');}
      }
      await message({type:'cancel'});await running;
    }
    return {calls:calls.length};
  } finally {
    disposed?.();for(const subscription of context.subscriptions)subscription.dispose?.();
    globalThis.fetch=original;await rm(root,{recursive:true,force:true});
  }
}
if(process.argv[2]){await scenario(process.argv[2]);console.log('passed '+process.argv[2]);}
