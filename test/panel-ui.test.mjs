import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {html} from '../extension/src/extension.mjs';

test('approved panel states render safely and send the matching actions',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:448,height:836}});
  await page.addInitScript(()=>{window.calls=[];window.acquireVsCodeApi=()=>({postMessage:value=>window.calls.push(value)});});
  await page.route('http://panel.test/',route=>route.fulfill({contentType:'text/html',body:html('fixture-nonce')}));
  await page.goto('http://panel.test/');
  const post=data=>page.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),data);
  await post({type:'auth',signedIn:false});
  await page.getByRole('button',{name:'ZA',exact:true}).click();
  await page.getByRole('button',{name:'Trigger sign-in',exact:true}).click();
  assert.equal(await page.evaluate(()=>calls.at(-1).region),'za');
  await post({type:'auth',signedIn:true});
  assert.equal(await page.locator('header').evaluate(e=>e.getBoundingClientRect().height),80);
  assert.equal(await page.getByRole('button',{name:'Send',exact:true}).evaluate(e=>e.getBoundingClientRect().height),48);
  await page.locator('#text').fill('Run the tests.');await page.getByRole('button',{name:'Send',exact:true}).click();
  assert.equal(await page.evaluate(()=>calls.at(-1).type),'code');
  await post({type:'approval',id:'command',label:'Waiting for Run',action:'Run',text:'node --test\nFolder: project'});
  await page.getByRole('button',{name:'Run',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{type:'approve',id:'command',approved:true});
  await post({type:'review',files:[{name:'<img src=x onerror=alert(1)>',hunks:[{index:0,label:'@@ -1 +1 @@',diff:'-old\n+new'}]}]});
  assert.equal(await page.locator('img').count(),0);
  await page.getByRole('button',{name:'Accept hunk',exact:true}).click();
  await page.getByRole('button',{name:'Accept',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>calls.at(-1).hunks),[0]);
  await post({type:'approval',id:'undo',label:'Undo',action:'Undo',text:'-new\n+old'});
  assert(await page.getByText('Restore the last change set?').isVisible());
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await post({type:'receipt',receipt:{rows:[{cost_usd:0.01,baseline_cost_usd:0.04,saved_usd:0.03}]}});
  assert(await page.getByText('Saved: $0.03').isVisible());
  await post({type:'plugins',items:[{title:'MCP / GitHub',text:'6 read tools'}]});
  assert(await page.getByText('MCP / GitHub').isVisible());
  await post({type:'error',text:'Code tool refused.',offline:false});
  assert(await page.getByText('No action was retried.').isVisible());
  await post({type:'newChat'});await post({type:'error',offline:true});await post({type:'ready'});
  assert(await page.getByText('Connection lost.').isVisible());assert(await page.getByRole('button',{name:'Send',exact:true}).isDisabled());
  await page.screenshot({path:'.tmp/panel-offline.png'});
 }finally{await browser.close();}
});
