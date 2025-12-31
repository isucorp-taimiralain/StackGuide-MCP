# React TypeScript Best Practices

## Component Organization

### File Structure
```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.types.ts
│   │   ├── Button.styles.ts
│   │   ├── Button.test.tsx
│   │   └── index.ts
│   └── index.ts
├── hooks/
│   ├── useAuth.ts
│   └── index.ts
├── types/
│   ├── api.types.ts
│   └── index.ts
└── utils/
    └── index.ts
```

### Separate Types File for Complex Components
```typescript
// Button.types.ts
export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  size: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}

export type ButtonVariant = ButtonProps['variant'];
```

## Custom Hooks

### Type Your Hooks Properly
```typescript
interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function useApi<T>(url: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(url);
      const result = await response.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
```

## Context with TypeScript

### Properly Typed Context
```typescript
interface AuthContextType {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Implementation
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
```

## Form Handling

### Typed Form State
```typescript
interface FormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

const [formData, setFormData] = useState<FormData>({
  email: '',
  password: '',
  rememberMe: false,
});

const handleChange = <K extends keyof FormData>(
  field: K,
  value: FormData[K]
) => {
  setFormData(prev => ({ ...prev, [field]: value }));
};
```

## API Integration

### Typed API Responses
```typescript
interface ApiResponse<T> {
  data: T;
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

interface User {
  id: string;
  email: string;
  name: string;
}

async function fetchUsers(): Promise<ApiResponse<User[]>> {
  const response = await fetch('/api/users');
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  return response.json();
}
```

## Error Boundaries

### Typed Error Boundary
```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

## Performance Patterns

### Memoization with Types
```typescript
// useMemo with explicit type
const filteredItems = useMemo<Item[]>(() => {
  return items.filter(item => item.active);
}, [items]);

// useCallback with typed parameters
const handleSelect = useCallback((item: Item) => {
  setSelected(item);
}, []);

// React.memo with types
const MemoizedComponent = React.memo<Props>(({ data }) => {
  return <div>{data.name}</div>;
});
```

## Discriminated Unions for State

```typescript
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function UserProfile() {
  const [state, setState] = useState<RequestState<User>>({ status: 'idle' });

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error') return <Error message={state.error.message} />;
  if (state.status === 'success') return <Profile user={state.data} />;
  return <Button onClick={fetchUser}>Load Profile</Button>;
}
```
