import { readFile } from 'node:fs/promises';
const patch = JSON.parse(await readFile(new URL('../patches/product.json', import.meta.url)));
export function applyProduct(upstream) {
  const product = {...upstream, ...patch};
  delete product.defaultChatAgent; delete product.aiConfig; delete product.tasConfig;
  delete product.extensionTelemetry; delete product.telemetry;
  product.extensionAllowedProposedApi = (product.extensionAllowedProposedApi ?? []).filter(id => !/copilot/i.test(id));
  product.builtInExtensions = (product.builtInExtensions ?? []).filter(item => !/copilot/i.test(item.name));
  return product;
}
