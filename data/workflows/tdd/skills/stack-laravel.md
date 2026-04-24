# Skill: Laravel TDD

Testing and architecture guide for Laravel backends.

## Test framework

- Preference: **Pest** over PHPUnit for expressiveness.
- If PHPUnit is used directly, keep the style consistent across the module.

## Test structure

```
backend/tests/
├── Unit/         # Pure logic, no framework or DB
├── Feature/      # HTTP, middleware, authorization, DB
└── Integration/  # Services that touch DB/queues/cache
```

Rule: if the test needs the Laravel container or the DB, it goes in `Feature` or `Integration`, never in `Unit`.

## Database in tests

- Use `RefreshDatabase` or transactions for Feature tests.
- In CI use the **real Postgres service**. Locally you may use SQLite only if tests do not depend on Postgres-specific features.
- No tests depending on pre-existing data: always `factory()` + explicit `seed`.

## Layered architecture

Separate clearly:

- **HTTP** (`app/Http`): thin controllers, validation via `FormRequest`, no business logic.
- **Domain / Services** (`app/Services`, `app/Domain`): pure business logic, testable in `Unit`.
- **Persistence** (`app/Models`, repositories): Eloquent isolated behind services when logic grows.

Principles:

- Dependency injection always (no `new` inside services).
- Single Responsibility per class and per method.
- Typed domain exceptions, not generic `Exception`.

## What to test at each level

| Level | Typical example |
|-------|-----------------|
| Unit | Domain rules, calculations, pure policies |
| Feature | `POST /api/resource` with auth, validation, persistence |
| Integration | Artisan commands, queue jobs, integration with external services (mocked) |

## Typical Pest pattern

```php
it('rejects empty payload on POST /api/clients', function () {
    $response = $this->postJson('/api/clients', []);
    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});
```

- Use `->freezeTime()` and `Carbon::setTestNow()` for time-sensitive tests.
- Explicit assertions: `->assertJsonPath('data.id', $expected)`.

## Factories and seeders

```php
User::factory()->create(['email' => 'foo@bar.test']);
Client::factory()->for($user)->count(3)->create();
```

- Do not chain business logic inside factories: only minimum valid data.
- States with `state()` when one dimension varies.

## Authorization

- Policies registered in `AuthServiceProvider`.
- Every protected endpoint uses `authorize(...)` in `FormRequest` or controller.
- Feature tests must cover at least: authorized user / unauthorized / unauthenticated.

## Mandatory linters before commit

```bash
cd backend
./vendor/bin/pint --test
./vendor/bin/phpstan analyse
php artisan test --parallel
```

## Forbidden anti-patterns

- `dd()`, `dump()`, `ray()` left in code.
- Global `Model::unguard()`.
- `DB::raw()` queries without escaping parameters.
- Tests asserting translated messages without fixing locale.
- Excessive Eloquent mocking: prefer a real test DB.
- `sleep()` / `usleep()` to synchronize tests.
- Tests depending on execution order.

## Migrations

- Every migration must be reversible (`down()` implemented).
- Test `migrate:fresh` in CI at least once per pipeline.
- Destructive changes require a note in the MR description.
