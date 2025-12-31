# React TypeScript Security Guidelines

## Input Validation

### Always Validate User Input
```typescript
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  age: z.number().min(18).max(120),
});

type User = z.infer<typeof userSchema>;

function validateUser(data: unknown): User {
  return userSchema.parse(data);
}
```

## XSS Prevention

### Avoid dangerouslySetInnerHTML
```typescript
// ❌ Dangerous - XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// ✅ Safe - Use a sanitization library
import DOMPurify from 'dompurify';

const SafeHTML: React.FC<{ content: string }> = ({ content }) => (
  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
);
```

### URL Validation
```typescript
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ❌ Dangerous
<a href={userProvidedUrl}>Link</a>

// ✅ Safe
{isValidUrl(userProvidedUrl) && (
  <a href={userProvidedUrl} rel="noopener noreferrer" target="_blank">
    Link
  </a>
)}
```

## Authentication

### Secure Token Storage
```typescript
// ❌ Bad - localStorage is vulnerable to XSS
localStorage.setItem('token', token);

// ✅ Better - Use httpOnly cookies (set by server)
// Or use secure state management

// For tokens that must be in JS:
interface SecureStorage {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
}

const secureStorage: SecureStorage = {
  getToken: () => sessionStorage.getItem('__secure_token'),
  setToken: (token) => sessionStorage.setItem('__secure_token', token),
  clearToken: () => sessionStorage.removeItem('__secure_token'),
};
```

### Protected Routes
```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole 
}) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
```

## API Security

### Secure Fetch Wrapper
```typescript
interface FetchOptions extends RequestInit {
  timeout?: number;
}

async function secureFetch<T>(
  url: string, 
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 10000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'same-origin', // or 'include' for cross-origin with cookies
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Content Security

### Prevent Clickjacking
```typescript
// Add to your app initialization
useEffect(() => {
  if (window.self !== window.top) {
    // Page is in an iframe - potential clickjacking
    window.top?.location.replace(window.self.location.href);
  }
}, []);
```

## Environment Variables

### Type-Safe Environment Variables
```typescript
// env.ts
const requiredEnvVars = [
  'REACT_APP_API_URL',
  'REACT_APP_AUTH_DOMAIN',
] as const;

type EnvVar = typeof requiredEnvVars[number];

function getEnv(key: EnvVar): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  apiUrl: getEnv('REACT_APP_API_URL'),
  authDomain: getEnv('REACT_APP_AUTH_DOMAIN'),
} as const;

// ❌ Never expose sensitive keys in frontend
// REACT_APP_SECRET_KEY - This will be in the bundle!
```

## CSRF Protection

### Include CSRF Token in Requests
```typescript
function useCsrfToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Get CSRF token from meta tag or cookie
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) {
      setToken(metaToken.getAttribute('content'));
    }
  }, []);

  return token;
}

// Usage in API calls
const csrfToken = useCsrfToken();

fetch('/api/data', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken || '',
  },
  body: JSON.stringify(data),
});
```

## Dependency Security

```bash
# Regularly audit dependencies
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated
```
