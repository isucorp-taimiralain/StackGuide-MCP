# React Best Practices

Essential best practices for building robust React applications.

## State Management

### Local State First

```tsx
// Start with local state
const [count, setCount] = useState(0);

// Lift state only when necessary
// Move to context/store when multiple components need it
```

### Derived State

```tsx
// Bad - Storing derived state
const [items, setItems] = useState([]);
const [filteredItems, setFilteredItems] = useState([]);

useEffect(() => {
  setFilteredItems(items.filter(i => i.active));
}, [items]);

// Good - Compute during render
const [items, setItems] = useState([]);
const filteredItems = useMemo(
  () => items.filter(i => i.active),
  [items]
);
```

## Performance Optimization

### Memoization

```tsx
import { memo, useMemo, useCallback } from 'react';

// Memoize expensive calculations
const sortedItems = useMemo(() => {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}, [items]);

// Memoize callbacks passed to children
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []);

// Memoize components that receive object/array props
export const UserList = memo(function UserList({ users }: Props) {
  return users.map(user => <UserCard key={user.id} user={user} />);
});
```

### Code Splitting

```tsx
import { lazy, Suspense } from 'react';

// Lazy load heavy components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}
```

## Error Handling

### Error Boundaries

```tsx
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught:', error, errorInfo);
    // Log to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

## Custom Hooks

### Reusable Logic

```tsx
// hooks/useLocalStorage.ts
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}
```

## API Integration

### React Query Pattern

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Fetch data
function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutate data
function useCreateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateUserDTO) => api.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

## Testing Patterns

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('UserCard', () => {
  it('calls onSelect when clicked', async () => {
    const onSelect = jest.fn();
    const user = { id: '1', name: 'John' };
    
    render(<UserCard user={user} onSelect={onSelect} />);
    
    await userEvent.click(screen.getByRole('button'));
    
    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```
