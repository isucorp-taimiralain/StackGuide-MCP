# React TypeScript Architecture Guide

## Project Structure

### Recommended Folder Organization
```
src/
├── components/          # Reusable UI components
│   ├── common/         # Generic components (Button, Input, Modal)
│   ├── layout/         # Layout components (Header, Footer, Sidebar)
│   └── features/       # Feature-specific components
├── pages/              # Page/route components
├── hooks/              # Custom React hooks
├── services/           # API calls and external services
├── stores/             # State management (Redux, Zustand, etc.)
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
├── constants/          # App constants and config
├── styles/             # Global styles, themes
└── assets/             # Static assets (images, fonts)
```

## Component Architecture

### Component Classification

1. **Presentational Components** - Pure UI, no business logic
2. **Container Components** - Connect to state/services
3. **Page Components** - Route-level components
4. **Layout Components** - Structure and composition

### Component Composition Pattern
```typescript
// Compound component pattern
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  defaultTab: string;
  children: React.ReactNode;
}

const Tabs: React.FC<TabsProps> & {
  Tab: typeof Tab;
  Panel: typeof TabPanel;
} = ({ defaultTab, children }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
};

// Usage
<Tabs defaultTab="tab1">
  <Tabs.Tab id="tab1">Tab 1</Tabs.Tab>
  <Tabs.Tab id="tab2">Tab 2</Tabs.Tab>
  <Tabs.Panel tabId="tab1">Content 1</Tabs.Panel>
  <Tabs.Panel tabId="tab2">Content 2</Tabs.Panel>
</Tabs>
```

## State Management Architecture

### State Layers
1. **Local State** - Component-specific (useState)
2. **Shared State** - Cross-component (Context, Zustand)
3. **Server State** - API data (React Query, SWR)
4. **URL State** - Router params, query strings

### Zustand Store Pattern
```typescript
// stores/userStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isAuthenticated: false,
        login: async (credentials) => {
          const user = await authService.login(credentials);
          set({ user, isAuthenticated: true });
        },
        logout: () => {
          set({ user: null, isAuthenticated: false });
        },
      }),
      { name: 'user-storage' }
    )
  )
);
```

## API Layer Architecture

### Service Layer Pattern
```typescript
// services/api.ts
const API_BASE = process.env.REACT_APP_API_URL;

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  get<T>(endpoint: string): Promise<T> {
    return this.request(endpoint);
  }

  post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();

// services/userService.ts
export const userService = {
  getUsers: () => apiClient.get<User[]>('/users'),
  getUser: (id: string) => apiClient.get<User>(`/users/${id}`),
  createUser: (data: CreateUserDTO) => apiClient.post<User>('/users', data),
};
```

## Routing Architecture

### Route Configuration
```typescript
// routes/index.tsx
import { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const Settings = lazy(() => import('../pages/Settings'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<LoadingSpinner />}>
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<LoadingSpinner />}>
            <ProtectedRoute requiredRole="admin">
              <Settings />
            </ProtectedRoute>
          </Suspense>
        ),
      },
    ],
  },
];
```

## Testing Architecture

### Test File Organization
```
src/
├── components/
│   └── Button/
│       ├── Button.tsx
│       ├── Button.test.tsx      # Unit tests
│       └── Button.stories.tsx   # Storybook stories
├── __tests__/
│   └── integration/             # Integration tests
└── e2e/                         # End-to-end tests
```

### Testing Patterns
```typescript
// Component test with React Testing Library
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('LoginForm', () => {
  it('submits form with valid data', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });
});
```

## Performance Architecture

### Code Splitting Strategy
- Route-based splitting with lazy()
- Component-based splitting for heavy features
- Vendor bundle optimization

### Memoization Guidelines
```typescript
// Use React.memo for expensive pure components
const ExpensiveList = React.memo<ListProps>(({ items }) => {
  return items.map(item => <ExpensiveItem key={item.id} {...item} />);
});

// Use useMemo for expensive calculations
const sortedItems = useMemo(
  () => items.sort((a, b) => a.name.localeCompare(b.name)),
  [items]
);

// Use useCallback for stable function references
const handleClick = useCallback((id: string) => {
  dispatch(selectItem(id));
}, [dispatch]);
```
