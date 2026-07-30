# Command: Verify — Quality gate before the MR

Reusable prompt to activate agent `03-verifier`.
OJ-aware: hard gate when OJ runs, then ponytail on the diff. Policy: `.stackguide/oj.md`.

## Prompt

```
Act as the "Verifier" agent.
Load skills: tdd-core, mr-conventions, traceability, oj-health.

Run the quality gate for this feature branch (same verify command — OJ included).

Order (do not skip):
1. StackGuide: agent action:"verify" path:"<project-root>"
   (lint / typecheck / test / build + TDD budget + branch)
2. OJ mechanical gate:
     bash .stackguide/scripts/oj-verify.sh
   - FAIL → Verifier Report ❌, hand back to Implementer (rule id, path, fix).
     Do NOT open the MR. Do NOT loosen the contract.
   - skipped (127) → OJ: ⏭ skipped (not a blocker).
   - PASS → continue.
3. Ponytail judgment (after OJ):
   Review the feature diff for over-engineering (delete/stdlib/native/yagni/shrink).
   Do not re-argue OJ size/complexity findings. One line per finding or "Lean already. Ship."

Emit the Verifier Report with both OJ and Ponytail lines.

Do NOT git reset --soft or rewrite history unless the user explicitly asks.
If pass: "Verifier Report: ✅ — MR ready to open"
If fail: "Verifier Report: ❌ — handing back to Implementer"
```

## Expected result

- Tests/lint/build results + TDD budget.
- `OJ (changed vs <base-branch>): PASS | FAIL | skipped`
- `Ponytail: Lean already | N findings`
- Block on tests/TDD/OJ FAIL (skipped OJ does not block).
