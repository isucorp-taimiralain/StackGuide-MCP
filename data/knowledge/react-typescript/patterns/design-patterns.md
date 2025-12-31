# React TypeScript Common Design Patterns

## Component Patterns

### Render Props Pattern
```typescript
interface RenderPropsChildren<T> {
  children: (data: T) => React.ReactNode;
}

interface MousePosition {
  x: number;
  y: number;
}

const MouseTracker: React.FC<RenderPropsChildren<MousePosition>> = ({ 
  children 
}) => {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return <>{children(position)}</>;
};

// Usage
<MouseTracker>
  {({ x, y }) => <div>Mouse: {x}, {y}</div>}
</MouseTracker>
```

### Higher-Order Component (HOC)
```typescript
interface WithLoadingProps {
  isLoading: boolean;
}

function withLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.FC<P & WithLoadingProps> {
  return function WithLoadingComponent({ isLoading, ...props }) {
    if (isLoading) {
      return <LoadingSpinner />;
    }
    return <WrappedComponent {...(props as P)} />;
  };
}

// Usage
const UserListWithLoading = withLoading(UserList);
<UserListWithLoading isLoading={loading} users={users} />
```

### Custom Hook Pattern
```typescript
interface UseAsyncResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  execute: () => Promise<void>;
}

function useAsync<T>(
  asyncFn: () => Promise<T>,
  immediate = true
): UseAsyncResult<T> {
  const [state, setState] = useState<{
    data: T | null;
    error: Error | null;
    isLoading: boolean;
  }>({
    data: null,
    error: null,
    isLoading: immediate,
  });

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await asyncFn();
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      setState({ data: null, error: error as Error, isLoading: false });
    }
  }, [asyncFn]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { ...state, execute };
}
```

## State Patterns

### Reducer Pattern with TypeScript
```typescript
type Action =
  | { type: 'SET_LOADING' }
  | { type: 'SET_DATA'; payload: User[] }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'RESET' };

interface State {
  users: User[];
  isLoading: boolean;
  error: string | null;
}

const initialState: State = {
  users: [],
  isLoading: false,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: true, error: null };
    case 'SET_DATA':
      return { ...state, isLoading: false, users: action.payload };
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}
```

### Factory Pattern for Forms
```typescript
interface FormField<T> {
  value: T;
  error: string | null;
  touched: boolean;
}

function createFormField<T>(initialValue: T): FormField<T> {
  return {
    value: initialValue,
    error: null,
    touched: false,
  };
}

interface LoginForm {
  email: FormField<string>;
  password: FormField<string>;
}

const initialLoginForm: LoginForm = {
  email: createFormField(''),
  password: createFormField(''),
};
```

## Data Fetching Patterns

### React Query Pattern
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query keys factory
const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

// Custom hook for fetching users
function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => userService.getUsers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Custom hook for mutations
function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: userService.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
```

## Error Handling Patterns

### Error Boundary with TypeScript
```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  fallback: React.ReactNode | ((error: Error) => React.ReactNode);
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;
      return typeof fallback === 'function'
        ? fallback(this.state.error)
        : fallback;
    }
    return this.props.children;
  }
}

// Usage
<ErrorBoundary
  fallback={(error) => <ErrorPage message={error.message} />}
  onError={(error) => logErrorToService(error)}
>
  <App />
</ErrorBoundary>
```

## Composition Patterns

### Slot Pattern
```typescript
interface CardProps {
  children: React.ReactNode;
}

interface CardSlots {
  Header: React.FC<{ children: React.ReactNode }>;
  Body: React.FC<{ children: React.ReactNode }>;
  Footer: React.FC<{ children: React.ReactNode }>;
}

const Card: React.FC<CardProps> & CardSlots = ({ children }) => {
  return <div className="card">{children}</div>;
};

Card.Header = ({ children }) => <div className="card-header">{children}</div>;
Card.Body = ({ children }) => <div className="card-body">{children}</div>;
Card.Footer = ({ children }) => <div className="card-footer">{children}</div>;

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### Provider Pattern
```typescript
interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme?: 'light' | 'dark';
}

const ThemeContext = createContext<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
} | null>(null);

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialTheme = 'light',
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
```
