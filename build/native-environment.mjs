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
    // Electron's V8 requires C++20 source_location, absent from the SDK's
    // GCC 10 headers. Use the matching Electron libc++ release, as x64 does.
    execFileSync(process.execPath, ['build/linux/libcxx-fetcher.ts'], {
      cwd: source, stdio: 'inherit', env: { ...process.env,
        VSCODE_ARCH: 'arm64', VSCODE_LIBCXX_OBJECTS_DIR: resolve(source, '.build/libcxx-objects'),
        VSCODE_LIBCXX_HEADERS_DIR: resolve(source, '.build/libcxx_headers'),
        VSCODE_LIBCXXABI_HEADERS_DIR: resolve(source, '.build/libcxxabi_headers') },
    });
    const client = resolve(env.VSCODE_CLIENT_SYSROOT_DIR, 'aarch64-linux-gnu');
    const remote = resolve(env.VSCODE_REMOTE_SYSROOT_DIR, 'aarch64-linux-gnu');
    env.CC = `clang-23 --target=aarch64-linux-gnu --gcc-toolchain=${client} --sysroot=${client}/aarch64-linux-gnu/sysroot`;
    env.CXX = `clang++-23 --target=aarch64-linux-gnu --gcc-toolchain=${client} --sysroot=${client}/aarch64-linux-gnu/sysroot`;
    env.VSCODE_REMOTE_CC = `clang-23 --target=aarch64-linux-gnu --gcc-toolchain=${remote} --sysroot=${remote}/aarch64-linux-gnu/sysroot`;
    env.VSCODE_REMOTE_CXX = `clang++-23 --target=aarch64-linux-gnu --gcc-toolchain=${remote} --sysroot=${remote}/aarch64-linux-gnu/sysroot`;
    // Match the upstream Clang profile: old glibc stat inline wrappers have
    // incompatible C++ exception declarations under Clang.
    env.CXXFLAGS += ` -nostdinc++ -D__NO_INLINE__ -DSPDLOG_USE_STD_FORMAT -I${source}/.build/libcxx_headers -isystem${source}/.build/libcxx_headers/include -isystem${source}/.build/libcxxabi_headers/include -fPIC -D_LIBCPP_ABI_NAMESPACE=Cr -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE`;
    env.LDFLAGS += ` -stdlib=libc++ -L${source}/.build/libcxx-objects -lc++abi`;
    env.VSCODE_REMOTE_CXXFLAGS += ' -D__NO_INLINE__';
    env.LDFLAGS += ' -fuse-ld=lld-23'; env.VSCODE_REMOTE_LDFLAGS += ' -fuse-ld=lld-23';
  }
  return env;
}
