import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, cp, chmod, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Build the MIT Code-OSS CLI from the same pinned source as the window. The
// platform installers and dependency scanners expect this tunnel executable.
export async function installTunnel(source, built, pin) {
  const arch = process.arch === 'x64' ? 'x86_64' : 'aarch64';
  const target = `${arch}-${{ linux: 'unknown-linux-gnu', darwin: 'apple-darwin', win32: 'pc-windows-msvc' }[process.platform]}`;
  const cli = resolve(source, 'cli');
  const run = (command, args, env = process.env) => execFileSync(command, args, { cwd: cli, env, stdio: 'inherit' });
  run('rustup', ['toolchain', 'install', pin.rust, '--profile', 'minimal']);
  run('rustup', ['target', 'add', '--toolchain', pin.rust, target]);
  const openssl = resolve(cli, 'openssl'); await mkdir(openssl, { recursive: true });
  const response = await fetch('https://registry.npmjs.org/@vscode/openssl-prebuilt/-/openssl-prebuilt-0.0.11.tgz');
  if (!response.ok) throw Error(`OpenSSL download: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha512').update(bytes).digest('base64') !== 'rjiSXtuQFN9zvvsUiouSynrK59cXrdQaOY/2D3dk6NWjYoSrI2Q4YfQAYNmNp/YunevGN2tTxQlI7k842HidkA==') throw Error('OpenSSL checksum mismatch');
  await writeFile(resolve(openssl, 'openssl.tgz'), bytes);
  execFileSync('tar', ['-xzf', 'openssl.tgz'], { cwd: openssl, stdio: 'inherit' });
  const platform = process.platform === 'linux' ? 'linux' : process.platform === 'darwin' ? 'osx' : 'windows-static';
  const env = { ...process.env, VSCODE_CLI_PRODUCT_JSON: resolve(source, 'product.json'),
    OPENSSL_DIR: resolve(openssl, `package/out/${process.arch}-${platform}`), OPENSSL_STATIC: '1' };
  await access(resolve(env.OPENSSL_DIR, 'include/openssl/ssl.h'));
  if (process.platform === 'linux') {
    env.VSCODE_SYSROOT_DIR = resolve(source, '.build/tunnel-sysroot');
    // The upstream sysroot download verifies its recorded SHA256. Its cross
    // compiler runs on x64; ARM runners use their native compiler with that
    // same glibc 2.28 sysroot, preserving the DEB dependency contract.
    const previous = process.env.VSCODE_SYSROOT_DIR;
    process.env.VSCODE_SYSROOT_DIR = env.VSCODE_SYSROOT_DIR;
    let sysroot;
    try {
      const { getVSCodeSysroot } = await import(pathToFileURL(resolve(source, 'build/linux/debian/install-sysroot.ts')));
      sysroot = await getVSCodeSysroot(process.arch === 'x64' ? 'amd64' : 'arm64');
    } finally {
      if (previous === undefined) delete process.env.VSCODE_SYSROOT_DIR; else process.env.VSCODE_SYSROOT_DIR = previous;
    }
    const triple = `${arch}-linux-gnu`;
    const compiler = process.arch === 'x64' ? resolve(env.VSCODE_SYSROOT_DIR, triple, 'bin', `${triple}-gcc`) : 'gcc';
    const key = target.toUpperCase().replaceAll('-', '_');
    env[`CARGO_TARGET_${key}_LINKER`] = compiler;
    env[`CARGO_TARGET_${key}_RUSTFLAGS`] = `-C link-arg=--sysroot=${sysroot} -C link-arg=-L${sysroot}/usr/lib/${triple}`;
    env[`CC_${target.replaceAll('-', '_')}`] = `${compiler} --sysroot=${sysroot}`;
    env[`PKG_CONFIG_LIBDIR_${target.replaceAll('-', '_')}`] = `${sysroot}/usr/lib/${triple}/pkgconfig:${sysroot}/usr/share/pkgconfig`;
    env[`PKG_CONFIG_SYSROOT_DIR_${target.replaceAll('-', '_')}`] = sysroot;
  }
  run('cargo', [`+${pin.rust}`, 'build', '--locked', '--release', '--target', target, '--bin', 'code'], env);
  const bin = process.platform === 'darwin' ? resolve(built, 'Tervory.app/Contents/Resources/app/bin') : resolve(built, 'bin');
  await mkdir(bin, { recursive: true });
  const destination = resolve(bin, `tervory-tunnel${process.platform === 'win32' ? '.exe' : ''}`);
  await cp(resolve(cli, `target/${target}/release/code${process.platform === 'win32' ? '.exe' : ''}`), destination);
  await chmod(destination, 0o755);
  execFileSync(destination, ['--help'], { stdio: 'inherit' });
}
