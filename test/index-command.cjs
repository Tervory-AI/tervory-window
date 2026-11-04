// Only VS Code's UI boundary is a fixture. Run the owner's registered command,
// filesystem traversal, persistence and packaged CPU embedding model unchanged.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const Module=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
(async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'index-command-')),root=path.join(base,'project');
 await fs.mkdir(root,{recursive:true});
 await fs.writeFile(path.join(root,'account.ts'),'// Recover access when a user forgets their password.\nexport function resetPassword(email: string) { return email; }\n');
 await fs.writeFile(path.join(root,'landscape.ts'),'// Paint trees, mountains and a river on a canvas.\nexport function drawLandscape() { return "green"; }\n');
 const commands=new Map(),opened=[],notices=[],subscriptions=[];let mode='meaning',query='help someone regain access to their account';
 const uri=file=>({fsPath:file,scheme:'file',toString:()=>pathToFileURL(file).href});const disposable=()=>({dispose(){}});
 const vscode={Uri:{file:uri,parse:value=>uri(fileURLToPath(value)),joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
  Range:class{constructor(startLine,startCharacter,endLine,endCharacter){Object.assign(this,{start:{line:startLine,character:startCharacter},end:{line:endLine,character:endCharacter}})}},Selection:class{constructor(start,end){Object.assign(this,{start,end})}},
  workspace:{isTrusted:true,workspaceFolders:[{uri:uri(root)}],createFileSystemWatcher:()=>({dispose(){},onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable}),onDidChangeWorkspaceFolders:disposable,onDidGrantWorkspaceTrust:disposable},
  window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),showQuickPick:async items=>items.find(item=>item.mode===mode)??items[0],showInputBox:async()=>query,showInformationMessage:text=>notices.push(text),showErrorMessage:text=>{throw Error(text)},showTextDocument:async file=>{const editor={uri:file,revealRange(){}};opened.push(editor);return editor;}},
  commands:{registerCommand:(id,callback)=>{commands.set(id,callback);return disposable()},executeCommand:async()=>undefined}};
 const file=path.resolve('extensions/tervory-index/dist/src/extension.js'),load=Module._load;let extension;const originalFetch=global.fetch;
 global.fetch=async()=>{throw Error('Network forbidden in offline command proof')};
 try{
  Module._load=function(request,...args){return request==='vscode'?vscode:load.call(this,request,...args)};delete require.cache[file];extension=require(file);
  const api=await extension.activate({subscriptions,storageUri:uri(path.join(base,'store')),asAbsolutePath:relative=>path.resolve('extensions/tervory-index',relative)});
  await commands.get('tervory.index.search')();assert.equal(opened.at(-1).uri.fsPath,path.join(root,'account.ts'));assert.equal(opened.at(-1).selection.start.line,1);
  mode='exact';query='resetPassword(email:';await commands.get('tervory.index.search')();assert.equal(opened.at(-1).uri.fsPath,path.join(root,'account.ts'));
  const count=opened.length;query='RESETPASSWORD';await commands.get('tervory.index.search')();assert.equal(opened.length,count);assert.equal(notices.at(-1),'No matches');
  assert.equal(api.fileCount(),2);console.log('passed index-command');
 }finally{Module._load=load;global.fetch=originalFetch;await extension?.deactivate();for(const item of subscriptions)item.dispose();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
