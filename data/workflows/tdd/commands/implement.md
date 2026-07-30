# Command: Implement — Execute TDD cycle

Reusable prompt to activate agent `02-tdd-implementer`.
OJ-aware: advisory gate before handoff. Policy: `.stackguide/oj.md`.

## Prompt

```
Act as the "TDD Implementer" agent.
Load skills: tdd-core, mr-conventions, oj-health, and depending on layer:
  - backend: stack-laravel
  - frontend: stack-react
  - schema: stack-postgres-migrations

Approved plan:
<paste the Planner's plan>

## Branch (first step when TICKET-KEY is known)
Ensure feature branch exists before any file edit:
  bash .stackguide/scripts/tdd-feature-branch.sh <TICKET-KEY> <slug>
Never implement on the base branch (development/main) when a ticket key is known.

Goal: Red → Green → Refactor for each of the 3 tests. Do not expand scope.
Respect the plan's ## OJ constraints (split files early; no limit raises).
Do NOT run `git commit` or `git push` unless the user explicitly requests it.
Leave changes in the working tree for Verify.

## OJ before handoff (advisory — same workflow, no extra command)
After the suite is green:
  bash .stackguide/scripts/oj-verify.sh
- Fix findings on files YOU touched.
- Do not loosen .repo-health.json / .stackguide/repo-health.json.
- Do not oj repair / oj init unless the user asks.
- Exit 127 / skipped → report OJ: skipped and continue.

When done, close with: "Cycle complete, handing off to Verifier",
listing: branch, test/production paths touched, OJ (changed): PASS | FAIL | skipped.
```

## Expected result

- Feature branch checked out.
- 3 tests created and passing; minimum production code.
- Changes uncommitted for verify.
- OJ changed-scope run (PASS | FAIL | skipped) reported in the handoff.
