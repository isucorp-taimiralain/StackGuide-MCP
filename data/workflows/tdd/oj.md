# OJ in StackGuide

[OJ](https://github.com/WajoAI/OJ) improves the **same** five StackGuide commands — no new commands.

```text
intake → plan → implement → verify → release
              (all OJ-aware)
```

Lives only under `.stackguide/`. No CI/scripts/package.json changes required.

## Prerequisites

```sh
git clone https://github.com/WajoAI/OJ.git ~/src/OJ
export OJ_ROOT=~/src/OJ
# optional: cd ~/src/OJ && npm ci && npm link
```

**Contract** (first match wins):

1. `.repo-health.json` (repo root)
2. `.stackguide/repo-health.json` (preferred for this setup)

If neither exists: agents note `OJ contract: missing` and treat OJ as skipped until you add one (do not invent a loose contract mid-ticket unless the user asks).

## Canonical check

```bash
bash .stackguide/scripts/oj-verify.sh           # --changed (default, MR gate)
bash .stackguide/scripts/oj-verify.sh --full    # whole repo (audit only, never MR hard gate)
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `OJ_ROOT` | — | OJ checkout when `oj` not on PATH |
| `OJ_CHANGED_BASE` | `development` | merge-base for `--changed` (match `vcs.defaultBranch`) |
| `OJ_FORMAT` | `json` | output format |
| `OJ_MODE` | `changed` | `changed` \| `full` |

Exit `127` → `OJ: ⏭ skipped` (not installed) — **never** blocks the five commands.

## Same commands, OJ behavior

| Command | OJ role | Must do |
|---------|---------|---------|
| **intake** | Shape the brief | Detect architecture/large-module risk; state `OJ contract: present \| missing`; constraints in Technical constraints. **Do not** run OJ. |
| **plan** | Shape the slice | Name files/modules within contract limits; never plan to raise limits; include `## OJ constraints` in the plan. **Do not** run OJ. |
| **implement** | Advisory gate | After Green suite: run `oj-verify.sh`; fix findings on **own** files; hand off with `OJ: PASS \| FAIL \| skipped`. |
| **verify** | Hard gate (+ judgment) | After lint/test/build + TDD budget: run `oj-verify.sh`; block on FAIL; then ponytail-review on the diff (judgment). Report both lines. |
| **release** | Evidence | Require Verifier OJ line; paste checkbox; refuse contract loosen without follow-up. |

## Verify order (fixed)

```text
1. agent action:"verify"     → tests / lint / build / TDD budget
2. bash .stackguide/scripts/oj-verify.sh   → mechanical health on --changed
3. ponytail-review on the feature diff     → delete/stdlib/yagni (judgment)
```

OJ findings first. Ponytail does not re-argue OJ size rules.

## MR checkbox

```markdown
- [ ] OJ (changed vs <base-branch>): PASS | FAIL | skipped
- [ ] Ponytail review: done | n/a
```

## Rules

- Default gate is `--changed` vs the base branch. `--full` is audit only.
- Do not loosen `.repo-health.json` / `.stackguide/repo-health.json` to silence findings.
- Do not `oj repair` / `oj init` unless the user explicitly asks.
- Do not add OJ outside `.stackguide/` from these commands.
- Do not invent new StackGuide commands for OJ — improve intake/plan/implement/verify/release only.
