# Command: Verify — Quality gate before the MR

Reusable prompt to activate agent `03-verifier`.

## Prompt

```
Run the active quality gate.

Call:
- agent action:"verify" path:"<project-root>"

Interpret the Verifier report:
- If blockers exist, fix and run verify again.
- If pass=true, proceed to release or MR creation.

Do NOT run git reset --soft or rewrite history to satisfy the gate unless the user explicitly asks.
```

## Expected result

- Report with tests/lint/build per layer.
- TDD budget met when the feature branch includes enough new test files vs the merge base.
- Block if anything fails, with actionable detail.
