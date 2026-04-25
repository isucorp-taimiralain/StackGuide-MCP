# Skill: MR / PR Conventions

Rules for Merge Requests / Pull Requests and CI across GitLab, GitHub, Bitbucket.

## MR convention

- **Title**: `<TICKET-KEY>: <short scope>` (e.g. `PROJ-123: customer onboarding`).
- **Description**: use the project's MR template when present.
- **Branch**: `feature/<TICKET-KEY>-<slug>`, `fix/<TICKET-KEY>-<slug>`, `chore/<slug>`.
- Every MR links to its ticket in the description.

## Quality gate (Verifier)

An MR is not merged if:

- The pipeline is not green.
- The 3-test baseline or an explicit justification is missing.
- Title or branch do not contain `TICKET-KEY` (when applicable).
- Production code is introduced without a previously failing test (except for tagged spikes).
- It contains `console.log`, `dd()`, `dump()`, `ray()` or equivalent.
- It contains `skip`/`only` in tests without a ticket reference.

## CI

- Typical stages: `test` → `build` → `release` (the last only on tags).
- Backend job runs against the real database service.
- Frontend job runs the test suite.
- Build job validates production compilation.
- `rules:changes` avoids running the whole pipeline when the change is one-dimensional.

## Expected agent behavior

- Before opening the MR: run the full local suite of the affected layer.
- Propose the title and description already aligned with the template.
- If CI fails, reproduce locally before iterating.
- Do not `force push` on shared branches or destructive `rebase` without notice.

## Conventional commits

See [`tdd-core`](./tdd-core.md). Commits feed the Releaser notes, keep them clean.

```
test(scope): description (TICKET-KEY)
feat(scope): description (TICKET-KEY)
fix(scope): description (TICKET-KEY)
refactor(scope): description (TICKET-KEY)
chore: description
docs: description
```
