# React Component Patterns

Common patterns for building scalable React components.

## Compound Components

```tsx
import { createContext, useContext, useState, ReactNode } from 'react';

// Context for compound component
const TabsContext = createContext<{
  activeTab: string;
  setActiveTab: (id: string) => void;
} | null>(null);

// Hook to access context
const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab components must be used within Tabs');
  return context;
};

// Main component
interface TabsProps {
  defaultTab: string;
  children: ReactNode;
}

function Tabs({ defaultTab, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

// Sub-components
function TabList({ children }: { children: ReactNode }) {
  return <div className="tab-list" role="tablist">{children}</div>;
}

function Tab({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab, setActiveTab } = useTabsContext();
  
  return (
    <button
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => setActiveTab(id)}
      className={activeTab === id ? 'active' : ''}
    >
      {children}
    </button>
  );
}

function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab } = useTabsContext();
  if (activeTab !== id) return null;
  return <div role="tabpanel">{children}</div>;
}

// Attach sub-components
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage
<Tabs defaultTab="overview">
  <Tabs.List>
    <Tabs.Tab id="overview">Overview</Tabs.Tab>
    <Tabs.Tab id="details">Details</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel id="overview">Overview content</Tabs.Panel>
  <Tabs.Panel id="details">Details content</Tabs.Panel>
</Tabs>
```

## Render Props

```tsx
interface MousePosition {
  x: number;
  y: number;
}

interface MouseTrackerProps {
  render: (position: MousePosition) => ReactNode;
}

function MouseTracker({ render }: MouseTrackerProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);
  
  return <>{render(position)}</>;
}

// Usage
<MouseTracker
  render={({ x, y }) => (
    <div>Mouse is at ({x}, {y})</div>
  )}
/>
```

## Higher-Order Components (HOC)

```tsx
interface WithLoadingProps {
  isLoading: boolean;
}

function withLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function WithLoadingComponent({ 
    isLoading, 
    ...props 
  }: P & WithLoadingProps) {
    if (isLoading) return <LoadingSpinner />;
    return <WrappedComponent {...(props as P)} />;
  };
}

// Usage
const UserListWithLoading = withLoading(UserList);
<UserListWithLoading isLoading={loading} users={users} />
```

## Custom Hooks for Shared Logic

```tsx
// useAsync hook for data fetching
function useAsync<T>(asyncFn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<{
    status: 'idle' | 'pending' | 'success' | 'error';
    data?: T;
    error?: Error;
  }>({ status: 'idle' });
  
  const execute = useCallback(async () => {
    setState({ status: 'pending' });
    try {
      const data = await asyncFn();
      setState({ status: 'success', data });
    } catch (error) {
      setState({ status: 'error', error: error as Error });
    }
  }, deps);
  
  useEffect(() => {
    execute();
  }, [execute]);
  
  return { ...state, execute };
}

// Usage
const { data, status, error } = useAsync(
  () => fetchUsers(),
  []
);
```

## Controlled vs Uncontrolled

```tsx
interface InputProps {
  // Controlled
  value?: string;
  onChange?: (value: string) => void;
  // Uncontrolled
  defaultValue?: string;
}

function Input({ value, onChange, defaultValue }: InputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };
  
  return <input value={currentValue} onChange={handleChange} />;
}
```

## Polymorphic Components

```tsx
type AsProp<C extends React.ElementType> = {
  as?: C;
};

type PropsToOmit<C extends React.ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProp<
  C extends React.ElementType,
  Props = {}
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<React.ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface TextOwnProps {
  color?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

type TextProps<C extends React.ElementType> = PolymorphicComponentProp<C, TextOwnProps>;

function Text<C extends React.ElementType = 'span'>({
  as,
  color = 'primary',
  size = 'md',
  children,
  ...props
}: TextProps<C>) {
  const Component = as || 'span';
  return (
    <Component className={`text-${color} text-${size}`} {...props}>
      {children}
    </Component>
  );
}

// Usage
<Text>Default span</Text>
<Text as="h1" size="lg">Heading</Text>
<Text as="a" href="/link">Link text</Text>
```
