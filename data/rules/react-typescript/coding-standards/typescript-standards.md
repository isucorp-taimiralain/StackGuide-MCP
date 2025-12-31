# TypeScript Standards for React

## Type Definitions

### Always Use Explicit Types for Props
```typescript
// ✅ Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary', disabled }) => {
  // ...
};

// ❌ Bad - no type definitions
const Button = ({ label, onClick, variant, disabled }) => {
  // ...
};
```

### Use Type Inference Where Appropriate
```typescript
// ✅ Good - TypeScript infers the type
const [count, setCount] = useState(0);

// ✅ Good - Explicit when needed
const [user, setUser] = useState<User | null>(null);

// ❌ Bad - Unnecessary explicit type
const [count, setCount] = useState<number>(0);
```

## Component Patterns

### Prefer Function Components with TypeScript
```typescript
// ✅ Recommended
interface Props {
  title: string;
  children: React.ReactNode;
}

const Card = ({ title, children }: Props) => (
  <div className="card">
    <h2>{title}</h2>
    {children}
  </div>
);

// Alternative with React.FC (less recommended due to implicit children)
const Card: React.FC<Props> = ({ title, children }) => (
  // ...
);
```

### Event Handlers
```typescript
// ✅ Good
const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.preventDefault();
};

const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  setValue(event.target.value);
};

const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
};
```

## Naming Conventions

### Types and Interfaces
- Use PascalCase for type names
- Prefix interfaces with component context, not "I"
- Use descriptive names

```typescript
// ✅ Good
interface UserProfileProps { }
type ButtonVariant = 'primary' | 'secondary';
interface ApiResponse<T> { }

// ❌ Bad
interface IUserProfile { }  // Don't use I prefix
type btnVar = 'primary' | 'secondary';  // Not descriptive
```

### Generic Types
```typescript
// ✅ Good
function fetchData<TData>(url: string): Promise<TData> { }
interface Container<TItem> { items: TItem[]; }

// ❌ Bad
function fetchData<T>(url: string): Promise<T> { }  // T is too generic
```

## Strict Configuration

### Recommended tsconfig.json
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Utility Types

### Use Built-in Utility Types
```typescript
// Partial - make all properties optional
type PartialUser = Partial<User>;

// Pick - select specific properties
type UserName = Pick<User, 'firstName' | 'lastName'>;

// Omit - exclude specific properties
type UserWithoutId = Omit<User, 'id'>;

// Required - make all properties required
type RequiredConfig = Required<Config>;

// Record - create object type
type UserRoles = Record<string, boolean>;
```

## Avoid These Patterns

```typescript
// ❌ Avoid 'any'
const data: any = fetchData();

// ✅ Use 'unknown' and type guards
const data: unknown = fetchData();
if (isUser(data)) {
  // data is now typed as User
}

// ❌ Avoid type assertions without validation
const user = data as User;

// ✅ Use type guards
function isUser(data: unknown): data is User {
  return typeof data === 'object' && data !== null && 'id' in data;
}
```
