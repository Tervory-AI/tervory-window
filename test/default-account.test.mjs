import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {source} from '../build/prepare.mjs';
import {resolve} from 'node:path';
import {patchDefaultAccount} from '../build/default-account.mjs';

test('actual patched Code-OSS account service settles without a Microsoft provider',async()=>{
  const text=await readFile(resolve(source,'src/vs/workbench/services/accounts/browser/defaultAccount.ts'),'utf8');
  assert.equal(patchDefaultAccount(text),text);
  assert.throws(()=>patchDefaultAccount('unexpected source'),/Pinned default account source changed/);
  const begin=text.indexOf('function toDefaultAccountConfig('),end=text.indexOf('\ninterface IAccountPolicyData');
  assert(begin>=0&&end>begin);
  const actual=stripTypeScriptTypes(text.slice(begin,end).replace('export class DefaultAccountService','class DefaultAccountService').replace('@IProductService ',''));
  class Disposable{_register(value){return value;}}
  class Emitter{event=()=>({dispose(){}});fire(){} }
  class Barrier{constructor(){this.promise=new Promise(resolve=>{this.resolve=resolve;});}open(){this.resolve();}wait(){return this.promise;}}
  const Service=new Function('Disposable','Emitter','Barrier','equals','MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED',actual+';return DefaultAccountService;')(Disposable,Emitter,Barrier,(a,b)=>a===b,{state:'notRequired'});
  const absent=new Service({});
  assert.equal(await absent.getDefaultAccount(),null);
  assert.equal(await absent.refresh(),null);
  assert.equal(await absent.signIn(),null);
  await absent.signOut();
  assert.deepEqual(absent.getDefaultAccountAuthenticationProvider(),{id:'',name:'',enterprise:false});
  const configured=new Service({defaultChatAgent:{chatExtensionId:'fixture.chat',extensionId:'fixture.completions',provider:{default:{id:'fixture',name:'placeholder'},enterprise:{id:'fixture-enterprise',name:'placeholder'}},providerScopes:[[]],completionsAdvancedSetting:'placeholder',entitlementUrl:'placeholder',tokenEntitlementUrl:'placeholder',mcpRegistryDataUrl:'placeholder',managedSettingsUrl:'placeholder'}});
  assert.deepEqual(configured.getDefaultAccountAuthenticationProvider(),{id:'fixture',name:'placeholder',enterprise:false});
});
