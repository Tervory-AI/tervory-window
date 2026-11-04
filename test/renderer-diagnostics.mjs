import {createServer} from 'node:net';
import {writeFile} from 'node:fs/promises';
export async function diagnosticPort(){
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
// Only the isolated fake-Tank test window exposes loopback CDP. Capture errors
// before the extension host exists; the upload step applies CLI secret redaction.
export function rendererDiagnostics(port,file){
  let stopped=false,socket,timer;const records=[];let next=0;
  const save=async()=>{await writeFile(file,JSON.stringify(records,null,2));};
  const record=(kind,value)=>{if(records.length<200)records.push({kind,value});void save().catch(()=>{});};
  const send=(method,params={})=>socket?.readyState===WebSocket.OPEN&&socket.send(JSON.stringify({id:++next,method,params}));
  const attach=async()=>{
    while(!stopped){
      try{
        const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1500)});
        const pages=await response.json();if(stopped)return;const page=pages.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);
        if(!page)throw Error('Renderer target not created');
        record('target',{url:page.url,title:page.title});socket=new WebSocket(page.webSocketDebuggerUrl);
        socket.addEventListener('open',()=>{
          if(stopped){socket.close();return;}
          for(const method of ['Runtime.enable','Log.enable','Network.enable','Page.enable'])send(method);
          timer=setInterval(()=>send('Runtime.evaluate',{expression:'JSON.stringify({url:location.href,state:document.readyState,body:document.body?.innerText?.slice(0,12000),scripts:[...document.scripts].map(s=>s.src)})',returnByValue:true}),15000);
        });
        socket.addEventListener('message',event=>{
          const data=JSON.parse(String(event.data));
          if(data.id&&data.result?.result?.value)record('document',data.result.result.value);
          if(['Runtime.exceptionThrown','Log.entryAdded','Network.loadingFailed','Inspector.targetCrashed'].includes(data.method))record(data.method,data.params);
          if(data.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(data.params.type))record(data.method,data.params);
        });
        socket.addEventListener('error',()=>record('socket','Renderer diagnostic connection failed'));
        return;
      }catch(error){if(stopped)return;await new Promise(resolve=>setTimeout(resolve,1000));}
    }
  };
  void attach();
  return async()=>{stopped=true;clearInterval(timer);socket?.close();await save();};
}
