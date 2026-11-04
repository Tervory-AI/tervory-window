// Build-time only. Runtime explicitly disables all model network access.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../models/Xenova/all-MiniLM-L6-v2/',import.meta.url));
const manifest = JSON.parse(await readFile(new URL('./model-lock.json',import.meta.url),'utf8'));
for (const [file,hash] of Object.entries(manifest.files)) {
  const existing = await readFile(path.join(root,file)).catch(()=>null);
  if (existing && createHash('sha256').update(existing).digest('hex') === Buffer.from(hash).toString('hex')) continue;
  const response = await fetch(`https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${manifest.revision}/${file}`);
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== Buffer.from(hash).toString('hex')) throw new Error(`Model checksum failed: ${file}`);
  await mkdir(path.dirname(path.join(root,file)),{recursive:true});
  await writeFile(path.join(root,file),data);
}
console.log('Pinned local model assets verified.');
// ONNX Node 1.30 has no Intel macOS binary. Build a local-file-only WASM
// variant from the locked Transformers distribution; never fall back to a server.
const packageRoot = path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const browser = await readFile(path.join(packageRoot,'node_modules/@huggingface/transformers/dist/transformers.web.js'),'utf8');
const environment = 'var IS_NODE_ENV = IS_PROCESS_AVAILABLE && process?.release?.name === "node" && !IS_DENO_WEB_RUNTIME;';
if (browser.split(environment).length !== 2 || !browser.includes('import { Tensor } from "onnxruntime-common";')) throw new Error('Review the pinned Transformers WASM patch');
const wasm = browser.replace(environment,'var IS_NODE_ENV = false;').replace('import { Tensor } from "onnxruntime-common";','import { Tensor } from "onnxruntime-web";').replace('import * as ONNX_WEB from "onnxruntime-web/webgpu";','import * as ONNX_WEB from "onnxruntime-web";');
await mkdir(path.join(packageRoot,'runtime'),{recursive:true});
await writeFile(path.join(packageRoot,'runtime/transformers-wasm.mjs'),wasm);
