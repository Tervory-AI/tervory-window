// Real editor APIs and project files; only Tank, credentials and the webview
// message boundary are fixtures. Browser rendering is covered separately.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
exports.run=async vscode=>{
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath;
 const file=path.join(root,'native-flow.txt');await fs.writeFile(file,'old\n');execFileSync('git',['init','-q',root]);
 await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(file)));
 const subscriptions=[];let receive;let provider;let round=0;const output=[];
 const original=globalThis.fetch;
 const token='tv1.us-east.'+'1'.repeat(32)+'.'+('placeholder'+'x'.repeat(43)).slice(0,43);
 const secrets=new Map([['tervory.session',token]]);
 const receipt={rows:[{cost_usd:0,baseline_cost_usd:0.04,saved_usd:0.04}]};
 const until=async fn=>{for(let n=0;n<1000;n++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Native panel flow timed out');};
 globalThis.fetch=async(url,options={})=>{
  const route=new URL(url).pathname;assert.equal(options.headers.Authorization,'Bearer '+token);
  if(route.endsWith('/threads'))return Response.json({thread_id:'native-fixture'});
  if(route.endsWith('/turn')){assert(JSON.parse(options.body).text.includes('old'));return new Response('event: token\ndata: {"text":"Native project answer."}\n\nevent: done\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream'}});}
  if(route.endsWith('/code-turn')){
   const requests=round++===0?[{name:'read_file',arguments:{path:'native-flow.txt'}}]:round===2?[{name:'propose_edit',arguments:{diff:'--- a/native-flow.txt\n+++ b/native-flow.txt\n@@ -1 +1 @@\n-old\n+new\n'}}]:[];
   return Response.json({answer:'',receipt,requests});
  }
  throw Error('Unexpected native fixture route '+route);
 };
 const {activate}=await import('../extension/src/extension.mjs');
 const context={subscriptions,secrets:{get:async key=>secrets.get(key),store:async(key,value)=>secrets.set(key,value),delete:async key=>secrets.delete(key)}};
 try{
  const native={Uri:vscode.Uri,EventEmitter:vscode.EventEmitter,workspace:vscode.workspace,env:vscode.env,window:new Proxy(vscode.window,{get(target,key){if(key==='registerWebviewViewProvider')return(id,value)=>{provider=value;return{dispose(){}};};return Reflect.get(target,key);}}),commands:new Proxy(vscode.commands,{get(target,key){return key==='registerCommand'?()=>({dispose(){}}):Reflect.get(target,key);}})};
  await activate(native,context);
  provider.resolveWebviewView({webview:{options:{},postMessage:value=>{output.push(value);if(value.type==='approval')queueMicrotask(()=>receive({type:'approve',id:value.id,approved:true}));},onDidReceiveMessage:fn=>{receive=fn;return{dispose(){}};}},onDidDispose:()=>({dispose(){}})});
  await receive({type:'ask',text:'Explain the open file'});assert(output.some(x=>x.text?.includes('Native project answer.')));
  const edit=receive({type:'code',text:'Change old to new'});
  await until(()=>output.some(x=>x.type==='review'));
  await receive({type:'preview',name:'native-flow.txt'});
  assert(vscode.window.tabGroups.all.some(group=>group.tabs.some(tab=>tab.input instanceof vscode.TabInputTextDiff)),'Native diff editor opened');
  await receive({type:'accept',hunks:[0]});await until(async()=>await fs.readFile(file,'utf8')==='new\n');
  await until(()=>output.filter(x=>x.type==='ready').length>=2);
  await receive({type:'undo'});await until(async()=>await fs.readFile(file,'utf8')==='old\n');
  await receive({type:'cancel'});await edit;
  console.log('PASS native editor ask → diff → accept → undo');
 }finally{globalThis.fetch=original;for(const item of subscriptions)item.dispose?.();}
};
