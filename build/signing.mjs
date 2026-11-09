import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Signing runs only when the founder has added the signing settings; values are
// read from the environment by name and never printed. Without them the build
// stays unsigned (macOS keeps its ad-hoc seal) and the release notes say so.
export const MAC_SETTINGS = ['APPLE_DEVELOPER_ID_CERTIFICATE', 'APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD'];
export const NOTARY_SETTINGS = ['APPLE_NOTARY_APPLE_ID', 'APPLE_NOTARY_PASSWORD', 'APPLE_NOTARY_TEAM_ID'];
export const WINDOWS_SETTINGS = ['WINDOWS_CERTIFICATE', 'WINDOWS_CERTIFICATE_PASSWORD'];
const set = (env, names) => names.every(name => typeof env[name] === 'string' && env[name] !== '');

/** What this build can do. The workflow imports certificates and passes the identity/file paths. */
export function signingPlan(env = process.env, platform = process.platform) {
  if (platform === 'darwin' && env.OPLI_MAC_IDENTITY) return { platform, signed: true, identity: env.OPLI_MAC_IDENTITY, notarize: set(env, NOTARY_SETTINGS) };
  if (platform === 'win32' && env.OPLI_WINDOWS_CERTIFICATE_FILE && set(env, ['WINDOWS_CERTIFICATE_PASSWORD'])) return { platform, signed: true, certificate: env.OPLI_WINDOWS_CERTIFICATE_FILE };
  return { platform, signed: false };
}

/** Developer ID signature with hardened runtime and the upstream entitlements. */
export async function signMacApp(source, app, identity) {
  const require = createRequire(resolve(source, 'build/package.json'));
  const { sign } = await import(pathToFileURL(require.resolve('@electron/osx-sign')).href);
  await sign({ app, platform: 'darwin', identity, identityValidation: false, preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    optionsForFile: file => {
      const helper = file.includes(' Helper (GPU).app') ? 'helper-gpu' : file.includes(' Helper (Renderer).app') ? 'helper-renderer' : file.includes(' Helper (Plugin).app') ? 'helper-plugin' : file.includes(' Helper.app') ? 'helper' : 'app';
      return { entitlements: resolve(source, `build/azure-pipelines/darwin/${helper}-entitlements.plist`), hardenedRuntime: true };
    } });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
}

export function signMacImage(image, identity) {
  execFileSync('/usr/bin/codesign', ['--sign', identity, '--timestamp', image], { stdio: 'inherit' });
}

export function notarize(image, env = process.env) {
  execFileSync('/usr/bin/xcrun', ['notarytool', 'submit', image, '--apple-id', env.APPLE_NOTARY_APPLE_ID, '--password', env.APPLE_NOTARY_PASSWORD,
    '--team-id', env.APPLE_NOTARY_TEAM_ID, '--wait'], { stdio: ['ignore', 'inherit', 'inherit'] });
  execFileSync('/usr/bin/xcrun', ['stapler', 'staple', image], { stdio: 'inherit' });
}

export function signWindows(file, plan, env = process.env) {
  execFileSync('signtool.exe', ['sign', '/fd', 'sha256', '/tr', 'http://timestamp.digicert.com', '/td', 'sha256', '/f', plan.certificate, '/p', env.WINDOWS_CERTIFICATE_PASSWORD, file], { stdio: ['ignore', 'inherit', 'inherit'] });
  execFileSync('signtool.exe', ['verify', '/pa', file], { stdio: 'inherit' });
}
