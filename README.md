# Tervory desktop window

Tervory reuses Code-OSS on Windows, macOS and Linux. The implementation is reviewed
on `codex/window`; native installers remain unsigned until founder signing
accounts are configured.

The built-in chat and agent panel lives in `extension/` and reuses the pinned
Tervory CLI. The other built-in components live under `extensions/`:

- `tervory-complete`: autocomplete and inline edits.
- `tervory-index`: private local project indexing.
- `tervory-agents`: project rules, background agents and PR review.

Build scripts discover every component under `extensions/`. Code-OSS source is
fetched at a fixed commit; the whole fork is never vendored here.
# Tervory desktop window

The window reuses Microsoft Code-OSS (MIT), pinned by release **and commit** in
`upstream.json`. Only build scripts, product patches, the built-in extension and
license notices are tracked here; the upstream source stays in `.tmp/code-oss-source`.

Use the Node version in `upstream.json`. Run `npm ci`, then
`npm run prepare-source` and `npm run build`.
Build on the target OS/CPU: Windows x64/arm64, macOS x64/arm64, Linux x64/arm64.
Code-OSS requires its native build prerequisites (C++ toolchain, Python; GTK,
X11, libsecret and Kerberos development libraries on Linux). Build output is an
unsigned portable archive in `dist`, with SHA256SUMS and build metadata.
Check the checksum before extracting; launch Tervory.exe, Tervory.app, or bin/tervory.

`window-v<package.json version>` tags build all six distributions in CI.
No release tag is created by these scripts. Until founder signing accounts are
configured, distributions are explicitly unsigned; no notarization or
Authenticode claim is made. Code-OSS third-party notices remain in each build.

The exact supplied `workspace/public/brand/tervory-logo.png` is copied for PNG
assets and converted to ICO/ICNS for native icons. No logo is redrawn. Open VSX
supplies extensions. The product disables Microsoft telemetry/crash reporting
and removes the default Copilot provider. Every Tervory model request uses Tank.

The CLI is fetched by `build/vendor-cli.mjs` from the immutable commit in
`cli-source.json`; generated `vendor/` is never committed. Run `npm run vendor-cli`
and `npm ci --prefix vendor/cli --ignore-scripts` before offline panel tests.
Run `bash scripts/precheck.sh` before every push. See `docs/acceptance/window.md`.

The build uses the standard Code-OSS product profile, without Microsoft's release
channel and its optional prewarmed Node cache. Native boot and editor tests remain
required on every build target. Windows uses the runner's SDK signature tool to
verify and remove upstream signatures before patching metadata; no signing key
is used, and Tervory installers remain unsigned.
