# Skill: React TDD

Testing and architecture guide for React frontends.

## Testing stack

- **Vitest** as the runner.
- **React Testing Library (RTL)** for components.
- **MSW** (Mock Service Worker) to simulate the API in UI integration tests.
- **@testing-library/user-event** for realistic interactions.

## Structure

```
frontend/src/
├── components/         # Reusable UI
├── features/           # Functional modules (vertical slices)
│   └── <feature>/
│       ├── __tests__/
│       ├── api/        # Isolated HTTP calls
│       ├── hooks/
│       └── ui/
├── lib/                # Pure utilities
└── test/
    ├── setup.ts
    └── msw/            # Handlers and server
```

Tests live next to the code (`__tests__` or `*.test.tsx`), never in a global parallel tree.

## What to test and how

- **Components**: user-facing behavior (roles, labels, text).
  - Prefer `getByRole`, `getByLabelText`, `findBy*` over `getByTestId`.
- **Hooks**: interesting logic via `renderHook` + assertions on returned values / side effects.
- **API / contracts**: intercept with MSW instead of manually mocking `fetch`.

## Examples

### Component

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientForm } from './ClientForm'

it('shows error when name is empty', async () => {
  const user = userEvent.setup()
  render(<ClientForm onSubmit={vi.fn()} />)

  await user.click(screen.getByRole('button', { name: /save/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/name required/i)
})
```

### Hook

```ts
import { renderHook, act } from '@testing-library/react'
import { useCounter } from './useCounter'

it('increments the value', () => {
  const { result } = renderHook(() => useCounter())
  act(() => result.current.increment())
  expect(result.current.value).toBe(1)
})
```

### API integration (MSW)

```ts
server.use(
  http.post('/api/clients', async () => HttpResponse.json({ id: 1 }, { status: 201 }))
)
```

## TypeScript

- `strict: true`.
- No `any` unless justified with a comment linking to a ticket.
- Types shared with the backend via OpenAPI or generated types when a contract exists.

## Minimum accessibility in tests

- Every input has an associated label.
- Buttons and links have an accessible name.
- Error states are announceable (`role="alert"` or `aria-live`).

## Recommended queries (in order)

1. `getByRole`, `getByLabelText`, `getByPlaceholderText`.
2. `getByText` when there is no role.
3. `getByTestId` **only** if nothing above applies (add a comment with the reason).

## MSW: handlers per feature

```
src/test/msw/
├── server.ts
└── handlers/
    └── clients.ts
```

Each feature registers its handlers; per-test overrides with `server.use(...)`.

## Performance and preferences

- Stateless components as default; extract state to hooks or context.
- `React.memo` only after measuring.
- Lazy-load per route when it adds value.

## Forbidden anti-patterns

- Manual `act()` except in justified cases.
- `waitFor(() => expect(...))` when `findBy*` exists.
- Huge snapshots that nobody reviews.
- `console.log` in tests.
- Global `fetch` mocks instead of MSW.
- `data-testid` as a first resort.
- Assertions on className or internal DOM structure.
- Mocking the full router when `MemoryRouter` is enough.

## Mandatory linters before commit

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test -- --run
```
