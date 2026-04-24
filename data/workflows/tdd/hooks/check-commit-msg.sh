#!/usr/bin/env bash
set -euo pipefail

COMMIT_MSG_FILE="${1:-}"

if [[ -z "$COMMIT_MSG_FILE" || ! -f "$COMMIT_MSG_FILE" ]]; then
  echo "Usage: check-commit-msg.sh <commit-msg-file>" >&2
  exit 1
fi

MSG=$(head -1 "$COMMIT_MSG_FILE")

PATTERN="^(feat|fix|test|refactor|chore|docs|style|perf|ci|build|revert)(\(.+\))?: .{3,}"

if [[ ! "$MSG" =~ $PATTERN ]]; then
  echo "ERROR: Commit message does not follow Conventional Commits." >&2
  echo "Expected: type(scope): description" >&2
  echo "Got: $MSG" >&2
  exit 1
fi
