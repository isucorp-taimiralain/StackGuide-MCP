# Command: Plan — Produce TDD plan

Reusable prompt to activate agent `01-tdd-planner`.

## Prompt

```
Act as the "TDD Planner" agent.
Load these skills: tdd-core and, as applicable, stack-laravel, stack-react,
stack-postgres-migrations.

Brief received:
<paste brief from Intake or direct description>

Goal: produce a TDD Plan with a vertical slice, observable criteria and exactly
3 tests (1 unit + 1 integration + 1 UI/API) unless justified.

Do not write code. When done close with: "TDD Plan ready, handing off to TDD Implementer"
and wait for human approval.
```

## Expected result

- Plan with the format defined in the agent.
- 3 tests named with a concrete path and observable case.
- Proposed branch `feature/<TICKET-KEY>-<slug>`.
