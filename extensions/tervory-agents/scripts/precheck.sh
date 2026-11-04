#!/usr/bin/env bash
# Reuse Tank's founder-mandated security gates until the window root has its own.
set -euo pipefail
security_source=$(cd "${1:?Pass the tervory-tank checkout containing the shared security scripts}" && pwd)
runtime=${2:-docker}
case "$runtime" in docker|podman) ;; *) printf 'Use docker or podman.\n' >&2; exit 2;; esac
runtime_options=''
image='semgrep/semgrep:1.182.1@sha256:c8f333ab0ad103d2bcd3b55cbeabcfc556bfeaa7446ba18594a4320f3807ffc9'
if [ "$runtime" = podman ]; then
 runtime_options="--userns keep-id --user $(id -u):$(id -g) --cap-drop ALL --security-opt no-new-privileges --env SEMGREP_SETTINGS_FILE=/tmp/semgrep-settings.yml --env XDG_CACHE_HOME=/tmp/semgrep-cache"
 image='docker.io/semgrep/semgrep@sha256:c8f333ab0ad103d2bcd3b55cbeabcfc556bfeaa7446ba18594a4320f3807ffc9'
fi
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
exec $runtime run $runtime_options --rm --label tervory.test=1 --name "${folder}-semgrep-\$\$" \\
 --volume "$root:$root" --volume "$TMPDIR:$TMPDIR" --workdir "\$PWD" \\
 --env GIT_CONFIG_COUNT=1 --env GIT_CONFIG_KEY_0=safe.directory --env "GIT_CONFIG_VALUE_0=$root" \\
 --entrypoint semgrep \\
 $image "\$@"
EOF
chmod +x "$bin/semgrep"
export PATH="$bin:$PATH"
# security_scan.py expects these paths. A fresh window repository uses every
# default rule and an empty fingerprint list, without importing Tank exceptions.
created_config=0
created_ignore=0
if [ ! -f .gitleaks.toml ]; then
 printf '[extend]\nuseDefault = true\n' > .gitleaks.toml
 created_config=1
fi
if [ ! -f .gitleaksignore ]; then
 : > .gitleaksignore
 created_ignore=1
fi
cleanup() {
 if [ "$created_config" = 1 ]; then rm .gitleaks.toml; fi
 if [ "$created_ignore" = 1 ]; then rm .gitleaksignore; fi
}
trap cleanup EXIT
# This component has no external packages: VS Code and Node provide its APIs.
# OSV cannot scan an empty dependency baseline. Enforce that invariant instead of
# inventing a lockfile or treating a scanner failure as a clean report.
python3 - <<'PY_DEPS'
import json
import subprocess
from pathlib import Path
files = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
for name in filter(None, files):
    path = Path(name)
    if path.name == 'package.json':
        package = json.loads(path.read_text())
        if any(package.get(key) for key in ('dependencies','devDependencies','optionalDependencies','peerDependencies')):
            raise SystemExit('External dependencies require the repository dependency scan before pushing.')
    if 'requirements' in path.name and path.suffix in ('.txt', '.lock'):
        raise SystemExit('External dependencies require the repository dependency scan before pushing.')
print('OSV: no external dependencies; dependency-free manifests verified.')
PY_DEPS
for check in gitleaks semgrep; do
 python3 "$security_source/.github/scripts/security_scan.py" "$check" --base "$base" --output "$TMPDIR/security-results"
done
printf 'Window agents precheck passed.\n'
