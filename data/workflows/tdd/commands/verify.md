# Command: Verify — Quality gate before the MR

Reusable prompt to activate agent `03-verifier`.

## Prompt

```
Act as the "Verifier" agent.
Load these skills: tdd-core, mr-conventions and traceability.

Goal: run the full checklist (backend + frontend + TDD budget + traceability)
and produce the "Verifier Report".

If anything fails, DO NOT open the MR: hand back to the Implementer with the
exact command that failed and the first 20 lines of output.

If everything passes, close with: "Verifier Report: ✅ — MR ready to open".
```

## Expected result

- Report with checkboxes for each verification.
- Canonical commands executed.
- Block if anything fails, with actionable detail.
