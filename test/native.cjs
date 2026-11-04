const vscode=require('vscode');
const assert=require('node:assert/strict');
exports.run=async()=>{
 const extension=vscode.extensions.getExtension('tervory.tervory-panel');
 assert(extension,'Built-in Tervory panel is installed');
 await extension.activate();
 assert(extension.isActive,'Panel activates in the real extension host');
 await vscode.commands.executeCommand('tervory.panel.focus');
 for(const id of ['tervory.tervory-complete','tervory.tervory-index','tervory.tervory-agents'])assert(vscode.extensions.getExtension(id),'Built-in extension installed: '+id);
 assert(vscode.workspace.workspaceFolders?.length,'Native window opened its project');
 const {scenario}=await import('./panel.mjs');
 for(const name of ['ask','undo','partial','reject','trust','command','command-deny','plugins','offline','stale','cancel-review','index-context','search','rules']){await scenario(name);console.log('PASS panel '+name);}
 await require('./native-flow.cjs').run(vscode);
 if(!process.env.TERVORY_PANEL_TEST_RESULT)throw Error('Missing panel result path');
 await require('node:fs/promises').writeFile(process.env.TERVORY_PANEL_TEST_RESULT,'passed');
};
