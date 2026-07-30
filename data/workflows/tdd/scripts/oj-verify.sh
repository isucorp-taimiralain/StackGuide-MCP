#!/usr/bin/env bash
# StackGuide OJ gate — used by implement / verify (same five commands).
# Modes: changed (default) | full
set -euo pipefail

ROOT=$(CDPATH= cd "$(dirname "$0")/../.." && pwd)
BASE="${OJ_CHANGED_BASE:-development}"
FMT="${OJ_FORMAT:-json}"
MODE="${OJ_MODE:-changed}"
SG_CONTRACT="${ROOT}/.stackguide/repo-health.json"
ROOT_CONTRACT="${ROOT}/.repo-health.json"
LINKED=0

usage() {
  echo "Usage: bash .stackguide/scripts/oj-verify.sh [--changed|--full] [oj-args...]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --changed) MODE=changed; shift ;;
    --full) MODE=full; shift ;;
    -h|--help) usage; exit 0 ;;
    *) break ;;
  esac
done

cleanup() {
  if [[ "${LINKED}" -eq 1 && -L "${ROOT_CONTRACT}" ]]; then
    rm -f "${ROOT_CONTRACT}"
  fi
}
trap cleanup EXIT

ensure_contract() {
  if [[ -f "${ROOT_CONTRACT}" || -L "${ROOT_CONTRACT}" ]]; then
    return 0
  fi
  if [[ -f "${SG_CONTRACT}" ]]; then
    ln -s ".stackguide/repo-health.json" "${ROOT_CONTRACT}"
    LINKED=1
    return 0
  fi
  echo "OJ skipped: no contract (.repo-health.json or .stackguide/repo-health.json)." >&2
  exit 127
}

run_oj() {
  if command -v oj >/dev/null 2>&1; then
    oj "$@"
    return
  fi
  if [[ -n "${OJ_ROOT:-}" && -f "${OJ_ROOT}/scripts/oj.mjs" ]]; then
    node "${OJ_ROOT}/scripts/oj.mjs" "$@"
    return
  fi
  echo "OJ skipped: install https://github.com/WajoAI/OJ and set OJ_ROOT or npm-link oj." >&2
  exit 127
}

ensure_contract

args=(verify --root "${ROOT}" --format "${FMT}")
if [[ "${MODE}" == "changed" ]]; then
  # oj's --changed expects a path value; the MR gate is changed SCOPE vs base ref
  args+=(--scope changed --changed-base "${BASE}")
fi
args+=("$@")

# No exec: it replaces the shell and the EXIT trap would never remove the symlink.
run_oj "${args[@]}"
