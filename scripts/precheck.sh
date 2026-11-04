#!/usr/bin/env bash
set -euo pipefail
export TMPDIR="$PWD/.tmp"
mkdir -p "$TMPDIR"
git diff --check
npm run lint
npm test
python3 -m unittest discover -s tests/acceptance -p 'test_window.py'
bash scripts/scan-secrets.sh
