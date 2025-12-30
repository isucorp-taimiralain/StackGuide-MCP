# React/Node Security Guidelines

Critical security practices for full-stack React and Node.js applications.

## Frontend Security

### XSS Prevention

```tsx
// React auto-escapes by default
<div>{userInput}</div>  // Safe

// DANGER: dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userContent }} />  // Only with sanitization

// Sanitize if HTML is needed
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
```

### Secure Storage

```typescript
// NEVER store sensitive data in localStorage
localStorage.setItem('token', jwt);  // ❌ Vulnerable to XSS

// Use httpOnly cookies instead (set from server)
// Or use secure in-memory storage
class SecureStorage {
  private token: string | null = null;
  
  setToken(token: string) {
    this.token = token;
  }
  
  getToken() {
    return this.token;
  }
  
  clearToken() {
    this.token = null;
  }
}
```

### URL Validation

```typescript
// Validate URLs before navigation
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

// Prevent open redirects
const redirect = searchParams.get('redirect');
if (redirect && isSafeUrl(redirect)) {
  navigate(redirect);
}
```

## Backend Security

### Input Validation

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\s]+$/)
});

// Middleware
export const validateBody = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.format()
      });
    }
    req.body = result.data;  // Use validated data
    next();
  };
};
```

### SQL Injection Prevention

```typescript
// NEVER interpolate user input
const query = `SELECT * FROM users WHERE id = ${userId}`;  // ❌

// Use parameterized queries
const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);  // ✅

// With Prisma (safe by default)
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### Authentication

```typescript
// Password hashing
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT with rotation
import jwt from 'jsonwebtoken';

function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    config.JWT_SECRET,
    { expiresIn: '15m' }  // Short-lived
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    config.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later'
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many login attempts'
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
```

### Security Headers

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));
```

### CORS Configuration

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = ['https://yourdomain.com'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

### Environment Secrets

```typescript
// Never commit secrets
// .env.example (committed)
DATABASE_URL=
JWT_SECRET=
API_KEY=

// .env (gitignored)
DATABASE_URL=postgresql://...
JWT_SECRET=your-32-char-secret-here
API_KEY=sk-...

// Validate at startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
```
