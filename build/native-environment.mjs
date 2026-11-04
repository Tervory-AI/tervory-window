import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Use Code-OSS's release sysroots, Electron libc++ and V8 header adjustments.
// Capture only toolchain variables, never the runner's credential environment.
export function linuxEnvironment(source) {
  const keys = ['CC', 'CXX', 'CXXFLAGS', 'LDFLAGS', 'VSCODE_CLIENT_SYSROOT_DIR', 'VSCODE_REMOTE_SYSROOT_DIR',
    'VSCODE_REMOTE_CC', 'VSCODE_REMOTE_CXX', 'VSCODE_REMOTE_CXXFLAGS', 'VSCODE_REMOTE_LDFLAGS'];
  const capture = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,process.env[key]]))))`;
  const output = execFileSync('bash', ['-c', 'source build/azure-pipelines/linux/setup-env.sh; "$1" -e "$2"', 'tervory-toolchain', process.execPath, capture], {
    cwd: source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_arch: process.arch, VSCODE_ARCH: process.arch },
  });
  const lines = output.trimEnd().split('\n');
  const env = JSON.parse(lines.pop()); process.stdout.write(lines.join('\n') + '\n');
  if (process.arch === 'arm64') {
    // The upstream GCC executables are x64-hosted. Native ARM Clang can use
    // their ARM headers, crt objects and libraries without executing those tools.
    const client = resolve(env.VSCODE_CLIENT_SYSROOT_DIR, 'aarch64-linux-gnu');
    const remote = resolve(env.VSCODE_REMOTE_SYSROOT_DIR, 'aarch64-linux-gnu');
    env.CC = `clang --target=aarch64-linux-gnu --gcc-toolchain=${client}`;
    env.CXX = `clang++ --target=aarch64-linux-gnu --gcc-toolchain=${client}`;
    env.VSCODE_REMOTE_CC = `clang --target=aarch64-linux-gnu --gcc-toolchain=${remote}`;
    env.VSCODE_REMOTE_CXX = `clang++ --target=aarch64-linux-gnu --gcc-toolchain=${remote}`;
    env.LDFLAGS += ' -fuse-ld=lld'; env.VSCODE_REMOTE_LDFLAGS += ' -fuse-ld=lld';
  }
  return env;
}
