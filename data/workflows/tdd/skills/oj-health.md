# Skill: oj-health

Used by the **same** five commands (intake → release). Policy: `.stackguide/oj.md`.

## Load when

- **intake / plan** — constraints only (do not execute OJ)
- **implement / verify / release** — run or require OJ evidence

## Run (implement + verify)

```bash
bash .stackguide/scripts/oj-verify.sh          # changed vs base branch
bash .stackguide/scripts/oj-verify.sh --full   # audit only
```

## Interpret

| Result | intake/plan | implement | verify | release |
|--------|-------------|-----------|--------|---------|
| PASS | — | handoff OK | continue | evidence OK |
| FAIL | — | fix own files | **block MR** | do not open/tag |
| skipped (127) | note missing tool/contract | continue | continue | note in MR |

## Verify sequence

1. StackGuide `agent action:"verify"`
2. `oj-verify.sh` (mechanical)
3. ponytail-review on feature diff (judgment) — after OJ, do not re-litigate size limits

## Never

- New StackGuide commands for OJ
- Raise contract limits to pass
- `oj repair` / `oj init` without explicit user request
- Hard-gate `--full` on an MR
