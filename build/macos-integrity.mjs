import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
// Branding, the tunnel and built-ins change the upstream app seal. Re-seal with
// an ad-hoc identity for local execution; this is not Developer ID signing or
// notarization and needs no certificate/account. Use upstream entitlements.
export async function sealMacApp(source, app) {
  const require = createRequire(resolve(source, 'build/package.json'));
  const { sign } = await import(pathToFileURL(require.resolve('@electron/osx-sign')).href);
  await sign({ app, platform: 'darwin', identity: '-', identityValidation: false,
    preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    optionsForFile: file => {
      const helper = file.includes(' Helper (GPU).app') ? 'helper-gpu' : file.includes(' Helper (Renderer).app') ? 'helper-renderer' : file.includes(' Helper (Plugin).app') ? 'helper-plugin' : file.includes(' Helper.app') ? 'helper' : 'app';
      return { entitlements: resolve(source, `build/azure-pipelines/darwin/${helper}-entitlements.plist`), hardenedRuntime: true, timestamp: 'none' };
    },
  });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
}
