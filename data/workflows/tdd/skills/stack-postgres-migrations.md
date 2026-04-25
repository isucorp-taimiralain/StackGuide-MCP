# Skill: Postgres Migrations Testing

Strategy for reversible Postgres migrations and schema testing.

## Principles

- Every migration must be **reversible** (real `down()`, not empty).
- Migrations must be **idempotent** when re-executed across branches.
- Destructive changes (drop column, rename) require a prior compatibility plan (two steps: add new, migrate data, drop old).

## Recommended patterns

### Add nullable column + backfill

```php
Schema::table('clients', function (Blueprint $table) {
    $table->string('tax_id')->nullable()->after('name');
    $table->index('tax_id');
});
```

Backfill in a separate Artisan command, not inside the migration (avoids long locks).

### Rename with compatibility

1. Migration A: create the new column, write to both.
2. Intermediate deployment.
3. Migration B: drop the old column.

### Concurrent indexes (Postgres)

```php
DB::statement('CREATE INDEX CONCURRENTLY idx_clients_tax_id ON clients(tax_id)');
```

Only outside a transaction. In Laravel: extend the migration to disable the transaction when applicable.

## What to test

- `migrate --env=testing`: runs cleanly.
- `migrate:rollback --step=1`: rolls back without errors.
- `migrate:fresh --seed`: consistent state.
- Feature test ensuring the new field/index behaves as the domain expects.

## Forbidden anti-patterns

- Migrations with mass `DB::table(...)->update(...)` inside `up()`.
- Dropping columns without a compatibility plan.
- Type changes without an intermediate migration (e.g. `varchar` → `uuid`).
- Empty `down()` "because it is easier".

## In CI

The `test_backend` job should at least run:

- `migrate:fresh` against the Postgres service.
- A Feature test validating the happy path of the schema change.

## In release notes (Releaser)

For each migration, document:

- Deployment command (`php artisan migrate --force`).
- Rollback command (`php artisan migrate:rollback --step=N`).
- Estimated time if touching a large table.
- Maintenance window if applicable.
