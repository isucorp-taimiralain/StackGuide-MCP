#!/usr/bin/env bash
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  exit 0
fi

EXEMPT="^(main|master|develop|staging|chore/.*)$"
if [[ "$BRANCH" =~ $EXEMPT ]]; then
  exit 0
fi

if [[ ! "$BRANCH" =~ [A-Z]+-[0-9]+ ]]; then
  echo "ERROR: Branch '$BRANCH' does not contain a ticket key (e.g. PROJ-123)." >&2
  exit 1
fi
