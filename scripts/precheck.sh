#!/usr/bin/env bash
# Extension-repository precheck; reuse Tank's pinned scanners and finding policy.
# No scanner suppressions or exceptions. The existing Tank CI is unchanged.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
root=$PWD
folder=$(basename "$root")
export TMPDIR="$root/.tmp"
mkdir -p "$TMPDIR"
cli_root=${TERVORY_CLI_ROOT:-"$root/.tmp/tank-client/cli"}
tank_root=$(dirname "$cli_root")
scanner="$tank_root/.github/scripts/security_scan.py"
[ -f "$scanner" ] || { echo 'Prepare the pinned Tank client checkout described in the extension README.'; exit 2; }
git fetch -q origin main
base=$(git merge-base origin/main HEAD)
bin="$TMPDIR/security-bin"
if [ ! -x "$bin/gitleaks" ]; then
  RUNNER_TEMP="$TMPDIR" GITHUB_PATH=/dev/null bash "$tank_root/.github/scripts/install-security-tools.sh"
fi
{
  git diff --name-only -z "$base"
  git ls-files --others --exclude-standard -z
} | sort -zu > "$TMPDIR/semgrep-targets"
mkdir -p "$TMPDIR/semgrep-empty" "$TMPDIR/semgrep-home"
cat > "$bin/semgrep" <<SH
#!/usr/bin/env bash
set -euo pipefail
mapfile -d '' -t changed_targets < "$TMPDIR/semgrep-targets"
targets=()
for target in "\${changed_targets[@]}"; do
  [ ! -f "\$target" ] || targets+=("./\$target")
done
[ \${#targets[@]} -gt 0 ] || targets=("$TMPDIR/semgrep-empty")
args=("\$@")
if [ "\${args[-1]}" = . ]; then unset 'args[-1]'; fi
container_name="${folder}-semgrep-\$\$"
printf '%s\n' "\$container_name" > "$TMPDIR/semgrep-container"
exec docker run --user "$(id -u):$(id -g)" --env HOME="$TMPDIR/semgrep-home" --rm --label tervory.test=1 --name "\$container_name" \\
  --volume "$root:$root" --volume "$TMPDIR:$TMPDIR" --workdir "\$PWD" \\
  --env GIT_CONFIG_COUNT=1 --env GIT_CONFIG_KEY_0=safe.directory --env "GIT_CONFIG_VALUE_0=$root" \\
  --entrypoint semgrep \\
  semgrep/semgrep:1.182.1@sha256:c8f333ab0ad103d2bcd3b55cbeabcfc556bfeaa7446ba18594a4320f3807ffc9 "\${args[@]}" --jobs 2 "\${targets[@]}"
SH
chmod +x "$bin/semgrep"
export PATH="$bin:$PATH" GITHUB_WORKSPACE="$root" RUNNER_TEMP="$TMPDIR"
mkdir -p "$TMPDIR/security-results"
for tool in gitleaks semgrep; do
  scan_status=0
  python3 "$scanner" "$tool" --base "$base" --output "$TMPDIR/security-results" || scan_status=$?
  if [ "$tool" = semgrep ] && [ -f "$TMPDIR/semgrep-container" ]; then
    read -r scanner_container < "$TMPDIR/semgrep-container"
    case "$scanner_container" in
      "$folder"-semgrep-*) docker rm -f "$scanner_container" >/dev/null 2>&1 || true ;;
    esac
  fi
  [ "$scan_status" -eq 0 ] || exit "$scan_status"
done
# A new repository may have no dependency inputs on main yet. Scan all HEAD
# dependencies in that case and block every finding, including lower severities.
has_baseline_dependencies=false
while IFS= read -r -d '' path; do
  case "$path" in
    package-lock.json|*/package-lock.json|*requirements*.txt|*requirements*.lock) has_baseline_dependencies=true ;;
  esac
done < <(git ls-tree -r --name-only -z "$base")
if [ "$has_baseline_dependencies" = true ]; then
  python3 "$scanner" osv --base "$base" --output "$TMPDIR/security-results"
else
  python3 "$scanner" osv --output "$TMPDIR/security-results"
  python3 - "$TMPDIR/security-results/osv.json" <<'PYOSV'
import json
import sys
with open(sys.argv[1]) as report:
    if json.load(report)['findings']:
        raise SystemExit('New dependency vulnerabilities block this push.')
PYOSV
fi
npm test --prefix extensions/tervory-complete
echo 'precheck: all passed. Push.'
