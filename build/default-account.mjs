// Code-OSS's Microsoft account is optional in Tervory. Keep its service contract
// settled with no provider; Tervory authentication stays in the CLI-backed panel.
export function patchDefaultAccount(text) {
  const marker = '// Tervory has no Microsoft default account provider.';
  if (text.includes(marker)) return text;
  const changes = [
    ['function toDefaultAccountConfig(defaultChatAgent: IDefaultChatAgent): IDefaultAccountConfig {', `function toDefaultAccountConfig(defaultChatAgent: IDefaultChatAgent | undefined): IDefaultAccountConfig | undefined {\n\t${marker}\n\tif (!defaultChatAgent) { return undefined; }`],
    ['private readonly defaultAccountConfig: IDefaultAccountConfig;', 'private readonly defaultAccountConfig: IDefaultAccountConfig | undefined;'],
    ['this.defaultAccountConfig = toDefaultAccountConfig(productService.defaultChatAgent);', 'this.defaultAccountConfig = toDefaultAccountConfig(productService.defaultChatAgent);\n\t\tif (!this.defaultAccountConfig) { this.initBarrier.open(); }'],
    ['...this.defaultAccountConfig.authenticationProvider.default,', "...(this.defaultAccountConfig?.authenticationProvider.default ?? { id: '', name: '' }),"],
    ['const defaultAccountProvider = this._register(instantiationService.createInstance(DefaultAccountProvider, toDefaultAccountConfig(productService.defaultChatAgent)));', 'const config = toDefaultAccountConfig(productService.defaultChatAgent);\n\t\tif (!config) { return; }\n\t\tconst defaultAccountProvider = this._register(instantiationService.createInstance(DefaultAccountProvider, config));'],
    ['async run(accessor: ServicesAccessor): Promise<void> {\n\t\tconst defaultAccountService = accessor.get(IDefaultAccountService);', "async run(accessor: ServicesAccessor): Promise<void> {\n\t\tif (!accessor.get(IProductService).defaultChatAgent) {\n\t\t\tawait accessor.get(ICommandService).executeCommand('tervory.signIn');\n\t\t\treturn;\n\t\t}\n\t\tconst defaultAccountService = accessor.get(IDefaultAccountService);"],
  ];
  for (const [before, after] of changes) {
    if (!text.includes(before)) throw Error('Pinned default account source changed');
    text = text.replace(before, after);
  }
  return text;
}
