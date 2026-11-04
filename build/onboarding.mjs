// Code-OSS 1.145 imports the Copilot welcome wizard eagerly. Its module-level
// assertion prevents forks without Microsoft's chat product config from booting.
// Keep the service and redirect its entry point to Tervory's approved panel.
export function patchOnboarding(text) {
  const assertion = "assertDefined(product.defaultChatAgent, 'Onboarding requires a default chat agent product configuration.');\nconst defaultChat = product.defaultChatAgent;";
  const entry = '\tshow(): void {\n';
  const marker = '// Tervory owns sign-in and onboarding in its panel.';
  if (text.includes(marker)) return text;
  if (!text.includes(assertion) || !text.includes(entry)) throw Error('Pinned onboarding source changed');
  return text.replace("import { assertDefined } from '../../../../base/common/types.js';\n", '')
    .replace(assertion, 'const defaultChat = product.defaultChatAgent!;')
    .replace(entry, `${entry}\t\t${marker}\n\t\tif (!defaultChat) {\n\t\t\tvoid this.commandService.executeCommand('tervory.panel.focus').then(\n\t\t\t\t() => this._onDidDismiss.fire(),\n\t\t\t\terror => this.notificationService.error(error)\n\t\t\t);\n\t\t\treturn;\n\t\t}\n`);
}
