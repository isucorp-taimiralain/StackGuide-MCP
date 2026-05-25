# Skill: Core TDD Workflow

Project-wide TDD policy. Applies to **every** agent that writes or reviews code.

## Mandatory cycle

1. **Red**: write the smallest test that fails with a clear message.
2. **Green**: implement the minimum to make it pass. Nothing more.
3. **Refactor**: improve readability/structure with the suite green.

## Test policy per vertical slice

Initial baseline: **3 tests per slice**.

- 1 **unit** test (domain / pure logic).
- 1 **integration** test (HTTP handler, Feature test, real service boundary).
- 1 **UI or API contract** test (Vitest + RTL, contract test, etc.).

**E2E only** when it adds real value (critical flows, cross-layer risk). If a slice does not apply the baseline, it must be explicitly justified in the MR.

## Implement → Verify → Commit

1. **Implementer**: code + tests, **no git commit**. Working tree may be clean or dirty.
2. **Verifier**: `agent action:"verify"` — TDD budget uses branch diff vs configured base branch (e.g. `development`).
3. **Human / Releaser**: conventional commit(s) and MR **after** verify passes.

Never use `git reset --soft` only to trick the verifier.

## Definition of Done (DoD)

- All tests green locally **and** in CI.
- No `skip`/`only` or silenced tests.
- No coverage drop on touched modules.
- Linter and type-check clean.
- Migrations reversible and tested against the real database engine.
- MR with title `<TICKET-KEY>: <scope>`, Verifier checklist and link to the ticket.

## Commit conventions (after verify)

Conventional Commits format:

- `test:` new test or test adjustment.
- `feat:` new user-visible functionality.
- `fix:` defect correction.
- `refactor:` internal change without behavior shift.
- `chore:` maintenance.
- `docs:` documentation.

## Expected agent behavior

- **Never** write production code without first seeing the test fail (or justifying a spike).
- **Never** expand scope beyond the agreed slice.
- **Never** modify configuration/versions without explicit agreement.
- Always use branch names `feature/<TICKET-KEY>-<slug>`.
