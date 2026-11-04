#!/usr/bin/env bash
# Reuse Tank's founder-mandated security gates until the window root has its own.
set -euo pipefail
security_source=$(cd "${1:?Pass the tervory-tank checkout containing the shared security scripts}" && pwd)
root=$(git rev-parse --show-toplevel)
folder=$(basename "$root")
cd "$root"
export TMPDIR="$root/.tmp" RUNNER_TEMP="$root/.tmp" GITHUB_WORKSPACE="$root"
mkdir -p "$TMPDIR"
node --check extensions/tervory-agents/extension.cjs
node --test extensions/tervory-agents/test/*.test.cjs
git diff --check
git fetch -q origin main
base=$(git merge-base origin/main HEAD)
RUNNER_TEMP="$TMPDIR" GITHUB_PATH=/dev/null bash "$security_source/.github/scripts/install-security-tools.sh"
bin="$TMPDIR/security-bin"
# One scan process keeps memory bounded without omitting any rule or target.
cat > "$bin/semgrep" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = scan ]; then shift; set -- scan --jobs 1 "\$@"; fi
exec docker run --rm --label tervory.test=1 --name "${folder}-semgrep-\$\$" \\
 --volume "$root:$root" --volume "$TMPDIR:$TMPDIR" --workdir "\$PWD" \\
 --env GIT_CONFIG_COUNT=1 --env GIT_CONFIG_KEY_0=safe.directory --env "GIT_CONFIG_VALUE_0=$root" \\
 --entrypoint semgrep \\
 semgrep/semgrep:1.182.1@sha256:c8f333ab0ad103d2bcd3b55cbeabcfc556bfeaa7446ba18594a4320f3807ffc9 "\$@"
EOF
chmod +x "$bin/semgrep"
export PATH="$bin:$PATH"
for check in gitleaks semgrep osv; do
 python3 "$security_source/.github/scripts/security_scan.py" "$check" --base "$base" --output "$TMPDIR/security-results"
done
printf 'Window agents precheck passed.\n'
