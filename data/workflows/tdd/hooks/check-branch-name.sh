#!/usr/bin/env bash
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  exit 0
fi

PATTERN="^(feature|fix|hotfix|chore|release)/[A-Z]+-[0-9]+-[a-z0-9-]+$|^(main|master|develop|staging)$|^chore/[a-z0-9-]+$"

if [[ ! "$BRANCH" =~ $PATTERN ]]; then
  echo "ERROR: Branch name '$BRANCH' does not match convention." >&2
  echo "Expected: feature/<TICKET-KEY>-<slug>, fix/<TICKET-KEY>-<slug>, or chore/<slug>" >&2
  exit 1
fi
