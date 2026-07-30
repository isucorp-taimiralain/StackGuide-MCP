#!/usr/bin/env bash
# Create or checkout feature/<TICKET>-<slug> (StackGuide TDD).
set -euo pipefail

ticket="${1:?Usage: tdd-feature-branch.sh <TICKET-KEY> <slug> [base-branch]}"
slug="${2:?Usage: tdd-feature-branch.sh <TICKET-KEY> <slug> [base-branch]}"
base_branch="${3:-development}"

# Same convention as hooks/check-branch-name.sh: feature/<TICKET-KEY>-<slug>
if [[ ! "${ticket}" =~ ^[A-Z]+-[0-9]+$ ]]; then
  echo "ERROR: Invalid TICKET-KEY '${ticket}' (expected format: PROJ-123)." >&2
  exit 1
fi
if [[ ! "${slug}" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: Invalid slug '${slug}' (expected kebab-case: [a-z0-9-]+)." >&2
  exit 1
fi

branch="feature/${ticket}-${slug}"

current="$(git branch --show-current)"
if [[ "${current}" == "${branch}" ]]; then
  echo "${branch}"
  exit 0
fi

if [[ "${current}" =~ ^feature/${ticket}- ]]; then
  echo "${current}"
  exit 0
fi

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  git checkout "${branch}"
  echo "${branch}"
  exit 0
fi

if git show-ref --verify --quiet "refs/heads/${base_branch}"; then
  git checkout -b "${branch}" "${base_branch}"
elif git show-ref --verify --quiet "refs/remotes/origin/${base_branch}"; then
  git checkout -b "${branch}" "origin/${base_branch}"
else
  git checkout -b "${branch}"
fi

echo "${branch}"
