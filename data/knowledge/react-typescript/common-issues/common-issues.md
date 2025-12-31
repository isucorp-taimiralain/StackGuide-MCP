# React TypeScript Common Issues and Solutions

## Type Errors

### Issue: Event Handler Types
```typescript
// ❌ Error: Parameter 'e' implicitly has an 'any' type
const handleChange = (e) => {
  setValue(e.target.value);
};

// ✅ Solution: Use proper React event types
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
};

const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
};

const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  console.log(e.currentTarget);
};
```

### Issue: Ref Types
```typescript
// ❌ Error: Type 'null' is not assignable
const inputRef = useRef();

// ✅ Solution: Properly type the ref
const inputRef = useRef<HTMLInputElement>(null);

// For mutable refs (like storing a value):
const countRef = useRef<number>(0);
```

### Issue: Children Prop Types
```typescript
// ❌ Unclear children type
interface Props {
  children: any;
}

// ✅ Use proper children types
interface Props {
  children: React.ReactNode;           // Any renderable content
  // OR
  children: React.ReactElement;         // Single React element
  // OR
  children: (data: T) => React.ReactNode; // Render prop
}
```

## State Management Issues

### Issue: setState with Object
```typescript
// ❌ Overwrites entire state
const [user, setUser] = useState({ name: '', email: '' });
setUser({ name: 'John' }); // email is now undefined!

// ✅ Spread previous state
setUser(prev => ({ ...prev, name: 'John' }));
```

### Issue: Stale Closure in useEffect
```typescript
// ❌ count is stale
const [count, setCount] = useState(0);

useEffect(() => {
  const interval = setInterval(() => {
    setCount(count + 1); // Always uses initial count (0)
  }, 1000);
  return () => clearInterval(interval);
}, []); // Empty deps = stale closure

// ✅ Use functional update
useEffect(() => {
  const interval = setInterval(() => {
    setCount(prev => prev + 1);
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### Issue: useEffect Infinite Loop
```typescript
// ❌ Infinite loop - object recreated every render
useEffect(() => {
  fetchData(options);
}, [options]); // options = { page: 1 } new object each time

// ✅ Solution 1: Memoize the object
const memoizedOptions = useMemo(() => ({ page: 1 }), []);

// ✅ Solution 2: Use primitive values
useEffect(() => {
  fetchData({ page });
}, [page]);
```

## Component Issues

### Issue: Conditional Hooks
```typescript
// ❌ Error: Hooks must be called in the same order
if (isLoggedIn) {
  const [user, setUser] = useState(null); // Conditional hook!
}

// ✅ Solution: Always call hooks, conditionally use values
const [user, setUser] = useState(null);

if (!isLoggedIn) {
  return <LoginPage />;
}
// Now use user...
```

### Issue: Keys in Lists
```typescript
// ❌ Using index as key (can cause issues with reordering)
{items.map((item, index) => (
  <Item key={index} {...item} />
))}

// ✅ Use unique, stable identifier
{items.map(item => (
  <Item key={item.id} {...item} />
))}
```

### Issue: Missing Dependency in useCallback
```typescript
// ❌ ESLint warning: missing dependency
const handleSubmit = useCallback(() => {
  submitForm(formData);
}, []); // formData is missing

// ✅ Include all dependencies
const handleSubmit = useCallback(() => {
  submitForm(formData);
}, [formData]);
```

## TypeScript Specific Issues

### Issue: Generic Component Props
```typescript
// ❌ Loses type information
interface SelectProps {
  options: any[];
  value: any;
  onChange: (value: any) => void;
}

// ✅ Use generics
interface SelectProps<T> {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  getOptionLabel: (option: T) => string;
}

function Select<T>({ options, value, onChange, getOptionLabel }: SelectProps<T>) {
  // Implementation
}
```

### Issue: Discriminated Union Props
```typescript
// ❌ Props don't enforce correct combinations
interface ButtonProps {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

// ✅ Use discriminated unions
type ButtonProps =
  | { as: 'button'; onClick: () => void; disabled?: boolean }
  | { as: 'link'; href: string; external?: boolean };

function Button(props: ButtonProps) {
  if (props.as === 'link') {
    return <a href={props.href}>Link</a>;
  }
  return <button onClick={props.onClick}>Button</button>;
}
```

### Issue: Extending Native Element Props
```typescript
// ❌ Missing native button props
interface ButtonProps {
  variant: 'primary' | 'secondary';
  children: React.ReactNode;
}

// ✅ Extend native props
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'secondary';
}

// For polymorphic components:
type PolymorphicProps<E extends React.ElementType, P = {}> = P &
  Omit<React.ComponentProps<E>, keyof P> & {
    as?: E;
  };
```

## Performance Issues

### Issue: Unnecessary Re-renders
```typescript
// ❌ Object created every render causes child re-render
<ChildComponent style={{ color: 'red' }} />

// ✅ Memoize or define outside component
const style = { color: 'red' };
<ChildComponent style={style} />

// Or use useMemo if depends on props
const style = useMemo(() => ({ color: theme.primary }), [theme.primary]);
```

### Issue: Heavy Computation in Render
```typescript
// ❌ Expensive filter runs every render
function UserList({ users, searchTerm }: Props) {
  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  return <List items={filteredUsers} />;
}

// ✅ Memoize expensive computations
function UserList({ users, searchTerm }: Props) {
  const filteredUsers = useMemo(
    () => users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [users, searchTerm]
  );
  return <List items={filteredUsers} />;
}
```

## Async Issues

### Issue: Setting State on Unmounted Component
```typescript
// ❌ Memory leak warning
useEffect(() => {
  fetchData().then(data => setData(data)); // May set after unmount
}, []);

// ✅ Use cleanup with AbortController
useEffect(() => {
  const controller = new AbortController();
  
  fetchData({ signal: controller.signal })
    .then(data => setData(data))
    .catch(err => {
      if (err.name !== 'AbortError') {
        setError(err);
      }
    });

  return () => controller.abort();
}, []);

// ✅ Or use React Query which handles this automatically
const { data } = useQuery(['data'], fetchData);
```
