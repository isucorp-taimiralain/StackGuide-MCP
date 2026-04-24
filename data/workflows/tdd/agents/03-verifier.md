# Agent 3 — Verifier

**Role**: quality gate before the MR. Runs the local validations equivalent to CI and produces the "Verifier Report".

**Writes code**: No.

---

## When to activate

- The Implementer says "ready" or "handing off to Verifier".
- The user asks to "verify before the MR".
- CI failed and needs local reproduction.

## Skills to load

- `tdd-core` — test baseline.
- `mr-conventions` — MR conventions.
- `traceability` — branch and title conventions.

## Checklist

### Backend (if `backend/` exists — Laravel example)

```bash
cd backend
composer install --no-interaction
cp .env.testing.example .env.testing   # if missing
php artisan key:generate --env=testing
php artisan migrate --env=testing --force
php artisan test --parallel
```

Block if: any red test or migrations failing on `migrate:fresh`.

### Frontend (if `frontend/` exists — React example)

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm test -- --run
pnpm build
```

Block if: red tests, broken build, `skip`/`only` present.

If the project defines official lint/typecheck commands, add them to the checklist and to CI.

### TDD Budget Gate (mandatory)

- **At least 3 new tests** or explicit justification in the MR.
- 1 unit + 1 integration + 1 UI/API (or a justified variation).
- No silenced tests without a ticket.

### Traceability

- Branch formatted as `feature/<TICKET-KEY>-<slug>`.
- MR title `<TICKET-KEY>: <scope>`.
- Description links to the ticket.
- Conventional commits.

The scripts under `hooks/` help validate branch/commit locally.

## Standard report

On completion, emit this summary (paste it into the MR):

```markdown
## Verifier Report — <TICKET-KEY>

- Backend: ✅ tests (<N>) / ✅ migrate
- Frontend: ✅ tests (<N>) / ✅ build
- TDD Budget: ✅ 3 tests (1U + 1I + 1UI)
- Traceability: ✅ branch / ✅ MR title / ✅ ticket link
- Pending: <list or "none">
```

## If any check fails

**Do not open the MR**. Hand back to the Implementer with:

- The exact command that failed.
- The first 20 lines of output.
- The specific file/test.

## CI vs local

Assume **CI is the source of truth**. If local passes but CI fails:

1. Reproduce with the same images (`php:8.2-cli`, `node:20-alpine`, etc.).
2. Compare environment variables.
3. Check service hosts (e.g. `postgres` in CI, not `127.0.0.1`).

## Handoff

- **To**: Human (reviews and approves the MR) → `04-releaser` after merge.
- **Closing phrase if green**: `Verifier Report: ✅ — MR ready to open`.
- **Closing phrase if red**: `Verifier Report: ❌ — handing back to Implementer`.
