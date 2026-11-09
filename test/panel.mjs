// External boundaries only: real panel, real CLI and CodeFolder execute below.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { activate } from '../extension/src/extension.mjs';
import { completePanelAction } from './panel-completion.mjs';
const token = region => `tv1.${region}.${'1'.repeat(32)}.${('placeholder'+'x'.repeat(43)).slice(0,43)}`;
const receipt = {rows:[{cost_usd:0.01,baseline_cost_usd:0.04,saved_usd:0.03}]};
const patch = name => `--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-old\n+new\n`;
export async function scenario(name, activatePanel = activate) {
  const root = await mkdtemp(join(tmpdir(),'window-proof-'));
  execFileSync('git',['init','-q',root]);
  for(const file of ['file.txt','second.txt'])await writeFile(join(root,file),'old\n');
  let message; let disposed; let api; const approvals=[]; let round=0; let region='us-east'; let prompt='Confirm'; const calls=[]; const outputs=[]; const previews=[]; const terminals=[];
  const secrets=new Map([['tervory.session',token(region)]]);
  const original=globalThis.fetch;
  const uri = value=>({scheme:value.startsWith('tervory-diff:')?'tervory-diff':'file',fsPath:value,toString:()=>value});
  const context={subscriptions:[],secrets:{get:async key=>secrets.get(key),store:async(key,value)=>secrets.set(key,value),delete:async key=>secrets.delete(key)}};
  const commands=new Map();
  const vscode={
    Uri:{parse:uri,file:uri}, Range:class{constructor(...args){this.args=args;}},
    extensions:{getExtension(id){assert.equal(id,'tervory.tervory-index');if(!['index-context','search'].includes(name))return;return{activate:async()=>({getRepositoryMap:async(query,options)=>{assert.equal(options.workspaceUri,root);return[{path:'file.txt',startLine:1,endLine:1,text:'cached text must not be trusted'},{path:'.git/config',startLine:1,endLine:1,text:'must not be sent'}];},search:async()=>[{path:'file.txt',startLine:1,endLine:1,text:'cached text must not be trusted'}]})};}}, EventEmitter:class{event=()=>({dispose(){}});fire(value){terminals.push(value);}dispose(){}},
    workspace:{isTrusted:true,workspaceFolders:[{uri:uri(root)}],asRelativePath:()=> 'file.txt',registerTextDocumentContentProvider:()=>({dispose(){}})},
    env:{openExternal:async value=>{assert(value.toString().startsWith('https://'));}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return{dispose(){}};},executeCommand:async(...args)=>{previews.push(args);}},
    window:{activeTextEditor:{document:{uri:uri(join(root,'file.txt'))}},showQuickPick:async items=>items.find(item=>item.value===region),showTextDocument:async(...args)=>{previews.push(args);},
      showWarningMessage:async()=>prompt,createTerminal:()=>({show(){},dispose(){}}),
      registerWebviewViewProvider:(id,provider)=>{api=provider;return{dispose(){}};}},
  };
  const until=async predicate=>{for(let n=0;n<1000;n++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Panel fixture timed out: '+name+'; last messages: '+JSON.stringify(outputs.slice(-5)));};
  globalThis.fetch=async(url,init={})=>{
    const parsed=new URL(url);const body=init.body?JSON.parse(init.body):null;
    assert.equal(parsed.origin,region==='za'?'https://za.tervory.com':'https://app.tervory.com');
    calls.push({path:parsed.pathname,body});
    if(!parsed.pathname.includes('/device/'))assert.equal(init.headers.Authorization,`Bearer ${token(region)}`);
    if(name==='offline')throw new TypeError('fetch failed');
    if(parsed.pathname.endsWith('/tools'))return Response.json(['plugins.list','mcp.github.list_issues']);
    if(parsed.pathname.endsWith('/actions')){assert.equal(body.tool,'plugins.list');return Response.json({card_id:'plugin-card',tool:'plugins.list',arguments:{},summary:'Plugins',status:'pending'});}
    if(parsed.pathname.endsWith('/cards/plugin-card')){assert.equal(body.action,'confirm');return Response.json({card_id:'plugin-card',status:'executing'});}
    if(parsed.pathname.endsWith('/placeholder-thread'))return Response.json({cards:[{card_id:'plugin-card',status:'done',result:{items:[{name:'github',version:'1.0.0',installed:true}]}}],steps:[{step_id:'plugin-card',status:'done',receipt_status:'recorded'}],receipts:[]});
    if(parsed.pathname.endsWith('/device/code')) {
      // Mirror the already-merged CLI contract; keep the current pin's fixture supported until its separate update.
      if(body.approval==='trigger-signin')return Response.json({device_code:'tzd1.placeholder-device',identity_provider:'trigger-signin',user_code:region==='za'?'1234-5678':'BCDF-GHJK',verification_uri:'https://auth.tervory.com/device',expires_in:20,interval:1});
      return Response.json({device_code:'placeholder-device',user_code:'BCDF-GHJK',verification_uri:'https://app.tervory.com/cli/device',expires_in:20,interval:1});
    }
    if(parsed.pathname.endsWith('/device/revoke')){assert.equal(body.refresh_token, `tvr1.${region}.${'1'.repeat(32)}.${('placeholder'+'r'.repeat(43)).slice(0,43)}`);return Response.json({revoked:true});}
    if(parsed.pathname.endsWith('/device/token'))return Response.json({access_token:token(region),refresh_token:`tvr1.${region}.${'1'.repeat(32)}.${('placeholder'+'r'.repeat(43)).slice(0,43)}`,expires_at:new Date(Date.now()+3600000).toISOString(),refresh_expires_at:new Date(Date.now()+86400000).toISOString()});
    assert.equal(init.headers.Authorization,`Bearer ${token(region)}`);
    if(parsed.pathname.endsWith('/threads'))return Response.json({thread_id:'placeholder-thread'});
    if(parsed.pathname.endsWith('/turn')) {
      assert.equal(body.model,'auto');assert(body.text.includes('file.txt'));assert(body.text.includes('old'));
      return new Response('event: token\ndata: '+JSON.stringify({text:'Project answer.'})+'\n\nevent: receipt\ndata: '+JSON.stringify(receipt)+'\n\nevent: done\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream'}});
    }
    if(parsed.pathname.includes('/paid-steps/approvals/')){assert.equal(parsed.pathname,'/v1/command/paid-steps/approvals/placeholder-approval');approvals.push(body);return Response.json({id:'placeholder-approval',state:body.approve?'approved':'denied'});}
    if(parsed.pathname.endsWith('/code-turn')) {
      assert.equal(body.model,'auto');
      if(name==='expired')return new Response('',{status:401});
      if(name==='quote'||name==='smoke'){
        // tank/code_preflight.py: a held turn carries the plan and quote; Ask waits for approval.
        const quote={rung:3,tokens_in_estimate:4210,tokens_out_limit:2000,cost_usd_estimate:0.0123,price_status:'priced',files:['file.txt'],basis:'Local estimate'};
        if(!body.continuation)return Response.json({answer:'The plan and quote for task 1 of 1 are ready.',requests:[],cards:[],preflight:{status:'awaiting_approval',message:'The plan and quote for task 1 of 1 are ready.',task:1,tasks:1,plan:{files:['file.txt']},quote,approval_id:'placeholder-approval'},receipt:{rows:[]},turn:{model:'Auto',cost_usd:0}});
        assert.deepEqual(body.tool_results,[]);assert.equal(approvals.length,1);
        return Response.json({answer:'Quoted answer.',receipt,requests:[]});
      }
      if(name==='command'||name==='command-deny'){
        if(body.continuation){const result=JSON.parse(body.tool_results[0].output).result;assert.equal(result.ran,name==='command');if(result.ran)assert(result.output.includes('panel-command'));return Response.json({answer:'Command finished.',receipt,requests:[]});}
        return Response.json({answer:'',receipt,requests:[{name:'run_command',arguments:{command:'echo panel-command'}}]});
      }
      if(!body.continuation)round=0;
      if(name==='ask'||name==='index-context'||name==='rules'){
        const requests=round++===0?[{name:'list_files',arguments:{}}]:round===2?[{name:'read_file',arguments:{path:'file.txt'}}]:[];
        if(round===2)assert(body.tool_results.some(item=>item.name==='list_files'&&item.output.includes('file.txt')));
        if(!requests.length)assert(body.tool_results.some(item=>item.output.includes('old')));
        return Response.json({answer:requests.length?'':'Project answer.',receipt,requests});
      }
      const requests=round++===0?[{name:'read_file',arguments:{path:'file.txt'}},{name:'read_file',arguments:{path:'second.txt'}}]:round===2?[{name:'propose_edit',arguments:{diff:patch('file.txt')+patch('second.txt')}}]:[];
      return Response.json({answer:'',receipt,requests});
    }
    throw Error('Unexpected fixture route: '+parsed.pathname);
  };
  try {
    const result=await activatePanel(vscode,context);
    api.resolveWebviewView({webview:{options:{},postMessage:value=>{outputs.push(value);if(value.type==='approval')queueMicrotask(()=>message({type:'approve',id:value.id,approved:prompt==='Confirm'}));},onDidReceiveMessage:fn=>{message=fn;return{dispose(){}};}},onDidDispose:fn=>{disposed=fn;return{dispose(){}};}});
    if(name==='rules'){
      await mkdir(join(root,'.tervory'));await writeFile(join(root,'.tervory/rules'),'Use clear names.');
      const running=message({type:'code',text:'Explain this project'});await until(()=>outputs.some(item=>item.type==='ready'));
      await writeFile(join(root,'.tervory/rules'),'Updated project rule.');await message({type:'code',text:'Explain again'});await until(()=>outputs.filter(item=>item.type==='ready').length>=2);
      const turns=calls.filter(item=>item.path.endsWith('/code-turn')&&!item.body.continuation);assert.equal(turns.length,2);assert(turns[0].body.text.includes('Use clear names.'));assert(turns[1].body.text.includes('Updated project rule.'));assert(turns.every(turn=>turn.body.text.includes('Repository project notes DATA')));
      await message({type:'cancel'});await running;
    }
    else if(name==='quote'||name==='smoke'){
      if(name==='smoke'){
        // Signed out → Trigger sign-in through the CLI's device login → one request → quote → answer.
        secrets.clear();await message({type:'ready'});assert(outputs.some(x=>x.type==='auth'&&x.signedIn===false));
        await message({type:'signIn',region:'us-east'});assert(outputs.some(x=>x.type==='deviceCode'&&x.code==='BCDF-GHJK'));
        assert(outputs.some(x=>x.type==='auth'&&x.signedIn===true));
      }
      const running=message({type:'code',text:'Change old to new in file.txt'});
      await until(()=>outputs.some(x=>x.type==='quote'&&x.id));
      const quote=outputs.find(x=>x.type==='quote'&&x.id);
      assert.deepEqual(quote.quote,{rung:3,tokens_in:4210,tokens_out:2000,cost_usd:0.0123,price_status:'priced',files:['file.txt']});
      assert.equal(quote.waiting,true);assert.match(quote.reason,/needs approval/);
      assert(!outputs.some(x=>x.text?.includes('Quoted answer.')),'Ask waits for approval before the paid call');
      await message({type:'quoteDecision',id:quote.id,approved:true});
      await until(()=>outputs.some(x=>x.text?.includes('Quoted answer.')));
      assert.deepEqual(approvals,[{approve:true,reason:'Approved in Opli Code'}]);
      assert(!JSON.stringify(outputs).match(/zitadel|auth0|okta|google|microsoft/i),'No identity provider name is shown');
      await message({type:'cancel'});await running;
    }
    else if(name==='expired'){
      // An expired stored sign-in shows the sign-in screen with a reason; a refused token does the same mid-chat.
      secrets.set('tervory.session',JSON.stringify({version:1,region:'us-east',access_token:token(region),refresh_token:`tvr1.us-east.${'1'.repeat(32)}.${('placeholder'+'r'.repeat(43)).slice(0,43)}`,expires_at:new Date(Date.now()-7200000).toISOString(),refresh_expires_at:new Date(Date.now()-3600000).toISOString()}));
      await message({type:'ready'});
      assert(outputs.some(x=>x.type==='auth'&&x.signedIn===false&&x.expired===true&&/Trigger sign-in again/.test(x.reason)));
      assert.equal(calls.length,0);
      secrets.set('tervory.session',token(region));
      await message({type:'code',text:'Explain file.txt'});
      assert(outputs.filter(x=>x.type==='auth'&&x.expired===true).length===2,'A refused token asks to sign in again');
      assert(!outputs.some(x=>x.type==='error'),'No silent or raw failure');
    }
    else if(name==='search'){await message({type:'search',query:'old'});const result=outputs.find(item=>item.type==='search');assert.deepEqual(result.matches,[{path:'file.txt',startLine:1,endLine:1,text:'old'}]);await message({type:'searchOpen',index:0});assert(previews.some(args=>args[0].fsPath?.endsWith('file.txt')));assert.equal(calls.length,0);}
    else if(name==='index-context'){const running=message({type:'code',text:'Explain this project'});await until(()=>outputs.some(x=>x.type==='ready'));const turn=calls.find(x=>x.path.endsWith('/code-turn'));assert(turn.body.text.includes('Project context DATA'));assert(turn.body.text.includes('old'));assert(!turn.body.text.includes('cached text'));assert(!turn.body.text.includes('.git/config'));await message({type:'cancel'});await running;}
    else if(name==='ask') {const running=message({type:'code',text:'Explain this project'});await until(()=>outputs.some(x=>x.type==='ready'));assert(outputs.some(x=>x.text?.includes('Project answer.')));assert(outputs.some(x=>x.text?.includes('0.01')));await message({type:'cancel'});await running;}
    else if(name==='plugins'){await message({type:'plugins'});assert(outputs.some(x=>x.type==='plugins'&&JSON.stringify(x.items).includes('list_issues')&&JSON.stringify(x.items).includes('Installed · 1.0.0')));}
    else if(name==='offline'){await message({type:'code',text:'explain'});assert(outputs.some(x=>x.type==='error'&&x.offline));assert.equal(calls.length,1);}
    else if(name==='command'||name==='command-deny'){
      if(name==='command-deny')prompt='Cancel';const running=message({type:'code',text:'echo panel-command'});
      await until(()=>outputs.some(x=>x.type==='ready'));
      assert(outputs.some(x=>x.type==='approval'&&x.action==='Run'));
      if(name==='command'){assert(outputs.some(x=>x.type==='command'&&x.state==='finished'&&x.code===0));assert(terminals.some(x=>x.includes('panel-command')));}
      else assert(!outputs.some(x=>x.type==='command'));
      await message({type:'cancel'});await running;
    }
    else if(name==='signin-us'||name==='signin-za') {
      region=name==='signin-za'?'za':'us-east';secrets.clear();
      // Current CLI ZA requires its pinned Zitadel response. No desktop-specific provider flow.
      if(region==='za') {
        const transport=globalThis.fetch;
        globalThis.fetch=async(url,init)=>{const response=await transport(url,init);if(String(url).endsWith('/device/code') && JSON.parse(init.body).approval!=='trigger-signin')return Response.json({...await response.json(),identity_provider:'zitadel',user_code:'1234-5678',verification_uri:'https://auth-za.tervory.com/device',verification_uri_complete:'https://auth-za.tervory.com/device?user_code=1234-5678'});return response;};
      }
      await result.signIn();assert(outputs.some(x=>x.type==='deviceCode'&&x.code===(region==='za'?'1234-5678':'BCDF-GHJK')));assert(!outputs.some(x=>x.text?.includes('auth-za')));assert(JSON.parse(secrets.get('tervory.session')).region===region);
      assert.equal(await result.getSessionToken(), token(region));
      assert.equal(await result.credentials.get(), secrets.get('tervory.session'));
      await result.signOut();
      assert.equal(secrets.size, 0);
      assert(calls.some(call=>call.path.endsWith('/device/revoke')));
      assert(outputs.some(x=>x.type==='auth'&&x.signedIn===false));
      await assert.rejects(result.getSessionToken(), /Login required/);
    } else if(name==='trust') {vscode.workspace.isTrusted=false;await message({type:'code',text:'change files'});assert.equal(calls.length,0);assert(outputs.some(x=>x.text?.includes('Trust')));}
    else {
      const running=message({type:'code',text:'change both files'});
      await until(()=>outputs.some(x=>x.type==='review'));
      const review=outputs.find(x=>x.type==='review');assert.equal(review.files.length,2);
      assert.equal(await readFile(join(root,'file.txt'),'utf8'),'old\n');
      await message({type:'preview',name:'file.txt'});assert.equal(previews.at(-1)[0],'vscode.diff');
      if(name==='stale'){await writeFile(join(root,'file.txt'),'outside change\n');await message({type:'accept',hunks:[0,1]});await until(()=>outputs.some(x=>x.type==='ready'));assert.equal(await readFile(join(root,'file.txt'),'utf8'),'outside change\n');assert.equal(await readFile(join(root,'second.txt'),'utf8'),'old\n');}
      else if(name==='cancel-review'){await message({type:'newChat'});assert.equal(await readFile(join(root,'file.txt'),'utf8'),'old\n');}
      else if(name==='reject') {await message({type:'accept',hunks:[]});await until(()=>outputs.filter(x=>x.type==='ready').length>=1);assert.equal(await readFile(join(root,'file.txt'),'utf8'),'old\n');}
      else {
        await completePanelAction({ send:()=>message({type:'accept',hunks:name==='partial'?[0]:[0,1]}), events:outputs, until,
          files:[{path:join(root,'file.txt'),expected:'new\n'},{path:join(root,'second.txt'),expected:name==='partial'?'old\n':'new\n'}] });
        if(name==='undo') await completePanelAction({ send:()=>message({type:'undo'}), events:outputs, until, approval:'Undo',
          files:[{path:join(root,'file.txt'),expected:'old\n'},{path:join(root,'second.txt'),expected:'old\n'}] });
      }
      await message({type:'cancel'});await running;
    }
    return {calls:calls.length};
  } finally {
    disposed?.();for(const subscription of context.subscriptions)subscription.dispose?.();
    globalThis.fetch=original;await rm(root,{recursive:true,force:true});
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]){await scenario(process.argv[2]);console.log('passed '+process.argv[2]);}
