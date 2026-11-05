import { parentPort, workerData } from 'node:worker_threads';
import { readFile,realpath } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
// Model and tokenizer are packaged assets. No fallback to a Hub or inference API.
const ready = (async () => {
  const wasm=workerData.backend==='wasm';
  const {env,pipeline} = wasm ? await import(pathToFileURL(workerData.runtime).href) : await import('@huggingface/transformers');
  const roots=await Promise.all([workerData.modelRoot,workerData.wasmRoot].map((root:string)=>realpath(root)));
  globalThis.fetch = async input => {
    if (!wasm) throw new Error('Network disabled in local embedding worker');
    const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
    if(url.protocol!=='file:')throw new Error('Network disabled in local embedding worker');
    const file=await realpath(fileURLToPath(url));
    if(!roots.some(root=>{const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative)}))throw new Error('Local model path refused');
    const data=await readFile(file);return new Response(new Uint8Array(data),{headers:{'Content-Length':String(data.length),'Content-Type':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'application/octet-stream'}});
  };
  env.fetch=globalThis.fetch;
  if(wasm){
    env.useFS=false;
    env.backends.onnx.wasm.wasmPaths={mjs:pathToFileURL(path.join(workerData.wasmRoot,'ort-wasm-simd-threaded.mjs')).href,wasm:pathToFileURL(path.join(workerData.wasmRoot,'ort-wasm-simd-threaded.wasm')).href};
    env.backends.onnx.wasm.numThreads=2;env.useWasmCache=false;
  }
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = wasm ? pathToFileURL(workerData.modelRoot).href+'/' : workerData.modelRoot;
  env.useBrowserCache = false;
  return pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',local_files_only:true,device:wasm?'wasm':'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
})();
let queue = Promise.resolve();
parentPort!.on('message', (m: {id:number;texts:string[]}) => {
  queue = queue.then(async () => {
    try {
      const model = await ready;
      const output = await model(m.texts,{pooling:'mean',normalize:true});
      parentPort!.postMessage({id:m.id,vectors:output.tolist()});
    } catch (error) { parentPort!.postMessage({id:m.id,error:String(error)}); }
  });
});
// Attach a rejection handler before the first request arrives.
void ready.catch(() => {});
