# Command: Implement — Execute TDD cycle

Reusable prompt to activate agent `02-tdd-implementer`.

## Prompt

```
Act as the "TDD Implementer" agent.
Load these skills: tdd-core + mr-conventions and, depending on layer:
  - backend: stack-laravel
  - frontend: stack-react
  - schema: stack-postgres-migrations

Approved plan:
<paste the Planner's plan>

Goal: execute Red → Green → Refactor for each of the 3 tests, with conventional
commits that include the TICKET-KEY. Do not expand scope.

When done, close with: "Cycle complete, handing off to Verifier",
listing the paths of tests and production files touched.
```

## Expected result

- 3 tests created and passing.
- Minimum production code for each test.
- Atomic conventional commits with `TICKET-KEY`.
- Local suite green.
