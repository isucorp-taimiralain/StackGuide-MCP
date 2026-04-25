# `hooks/` — Reusable validation scripts

Portable POSIX shell scripts, invokable from **Lefthook** / **Husky** (local Git hooks), **CI** (GitLab, GitHub Actions) or any other entry point. They do not depend on an IDE.

## Scripts

| Script | Purpose | Where to use |
|--------|---------|--------------|
| `check-branch-name.sh` | Validates branch format (`feature/<TICKET-KEY>-<slug>`, etc.) | `pre-commit`, `pre-push`, CI |
| `check-ticket-key.sh` | Validates that the branch contains a `TICKET-KEY` like `PROJ-123` | `pre-push`, CI |
| `check-commit-msg.sh` | Validates Conventional Commit format + `TICKET-KEY` when applicable | `commit-msg` |

## How to invoke

From `lefthook.yml`:

```yaml
pre-commit:
  commands:
    check-branch:
      run: .stackguide/workflows/tdd/hooks/check-branch-name.sh

commit-msg:
  commands:
    check-message:
      run: .stackguide/workflows/tdd/hooks/check-commit-msg.sh {1}
```

From GitLab CI:

```yaml
validate_traceability:
  stage: test
  script:
    - .stackguide/workflows/tdd/hooks/check-branch-name.sh
    - .stackguide/workflows/tdd/hooks/check-ticket-key.sh
```

From GitHub Actions:

```yaml
- name: Validate branch name
  run: bash .stackguide/workflows/tdd/hooks/check-branch-name.sh
```

## Requirements

- `bash` 4+ (or compatible).
- `git` in PATH.

## Conventions

- **Exit code 0** if passes, non-zero to block.
- Human-readable output via stderr.
- No external dependencies (POSIX tools only).
- Every script is independent and testable in isolation.

## Permissions

All scripts must be executable:

```bash
chmod +x .stackguide/workflows/tdd/hooks/*.sh
```
