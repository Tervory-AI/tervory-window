#!/usr/bin/env bash
set -euo pipefail
mkdir -p .tmp/security
curl --fail --location --retry 3 https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz -o .tmp/security/gitleaks.tar.gz
printf '%s  %s\n' 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb .tmp/security/gitleaks.tar.gz | sha256sum -c -
tar -xzf .tmp/security/gitleaks.tar.gz -C .tmp/security gitleaks
.tmp/security/gitleaks git --redact --no-banner .
