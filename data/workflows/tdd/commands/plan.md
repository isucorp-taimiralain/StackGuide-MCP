# Command: Plan — Produce TDD plan

Reusable prompt to activate agent `01-tdd-planner`.
OJ-aware: designs the slice inside the contract; does **not** run OJ. Policy: `.stackguide/oj.md`.

## Prompt

```
Act as the "TDD Planner" agent.
Load skills: tdd-core, oj-health, and as applicable stack-laravel, stack-react,
stack-postgres-migrations.

Brief received:
<paste the Intake brief>

Goal: produce a TDD Plan with a vertical slice, observable criteria and exactly
3 tests (1 unit + 1 integration + 1 UI/API) unless justified.
Design so implement/verify can pass OJ --changed without raising limits.

## Branch (mandatory when TICKET-KEY is known)
Before closing the plan, create the feature branch:
  bash .stackguide/scripts/tdd-feature-branch.sh <TICKET-KEY> <slug>
Slug = kebab-case from ticket summary. Base = vcs.defaultBranch from .stackguide/config.json.
If already on feature/<TICKET-KEY>-*, note the current branch instead.
Include "Branch created: feature/<TICKET-KEY>-<slug>" in the plan output.

## OJ section (mandatory in the plan)
Add:

## OJ constraints
- Contract: present | missing (.stackguide/repo-health.json or .repo-health.json)
- Target modules / folders: …
- Keep new/changed files within contract limits (split early if a file would grow past limits)
- Do not plan to raise .repo-health.json limits or broad ignores
- Refactor plan if needed so the slice stays OJ-clean on --changed

Do not write code. Do not run OJ.
When done close with: "TDD Plan ready, handing off to TDD Implementer"
and wait for human approval.
```

## Expected result

- Plan with the agent format + `## OJ constraints`.
- 3 tests with concrete paths and observable cases.
- Feature branch created or confirmed.
- Slice sized so Implement can stay OJ-clean.
