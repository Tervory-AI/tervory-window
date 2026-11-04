#!/usr/bin/env bash
set -euo pipefail
export TMPDIR="$PWD/.tmp"
mkdir -p "$TMPDIR"
git diff --check
npm ci --prefix vendor/cli --ignore-scripts --no-audit --no-fund
npm run lint
npm test
node --test extensions/tervory-agents/test/*.test.cjs
npm --prefix extensions/tervory-index test
TERVORY_CLI_ROOT="$PWD/vendor/cli" npm --prefix extensions/tervory-complete run build
node build/test-editor.mjs
python3 -m unittest discover -s tests/acceptance -p 'test_window.py'
bash scripts/scan-secrets.sh
