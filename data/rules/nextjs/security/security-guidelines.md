# Next.js Security Guidelines

## Server-Side Security

### Environment Variables
```typescript
// NEVER expose secrets to the client
// ❌ Bad - accessible in browser
const secret = process.env.NEXT_PUBLIC_API_SECRET;

// ✅ Good - server-only
const secret = process.env.API_SECRET;

// Access in server components or API routes only
export async function getServerData() {
  const apiKey = process.env.API_SECRET_KEY;
  // Use apiKey for server-side operations
}
```

### Input Validation
```typescript
import { z } from 'zod';

const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150)
});

export async function POST(request: Request) {
  const body = await request.json();
  
  const result = UserInputSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      { error: 'Invalid input', details: result.error.issues },
      { status: 400 }
    );
  }
  
  // Use validated data
  const { email, name, age } = result.data;
}
```

### SQL Injection Prevention
```typescript
// ❌ NEVER interpolate user input in SQL
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ Use parameterized queries (Prisma example)
const user = await prisma.user.findUnique({
  where: { id: userId }
});

// ✅ Or with raw queries
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE id = ${userId}
`;
```

## Authentication

### NextAuth.js Setup
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcrypt';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials');
        }
        
        const user = await db.user.findUnique({
          where: { email: credentials.email }
        });
        
        if (!user || !user.hashedPassword) {
          throw new Error('Invalid credentials');
        }
        
        const isValid = await compare(
          credentials.password,
          user.hashedPassword
        );
        
        if (!isValid) {
          throw new Error('Invalid credentials');
        }
        
        return user;
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/auth/error'
  }
});

export { handler as GET, handler as POST };
```

### Protected Routes
```typescript
// lib/auth.ts
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export async function requireAuth() {
  const session = await getServerSession();
  
  if (!session?.user) {
    redirect('/login');
  }
  
  return session;
}

// app/dashboard/page.tsx
export default async function DashboardPage() {
  const session = await requireAuth();
  
  return <div>Welcome, {session.user.name}</div>;
}
```

## CSRF Protection

### Server Actions (Built-in)
```typescript
// Server Actions have built-in CSRF protection
'use server';

export async function updateProfile(formData: FormData) {
  // Automatically protected against CSRF
  const name = formData.get('name');
  await db.user.update({ where: { id: userId }, data: { name } });
}
```

### API Routes
```typescript
// For API routes, validate origin
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const headersList = headers();
  const origin = headersList.get('origin');
  
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://yourdomain.com'
  ];
  
  if (!origin || !allowedOrigins.includes(origin)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  // Process request
}
```

## XSS Prevention

### Content Security Policy
```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data:;
      font-src 'self';
      connect-src 'self' https://api.example.com;
    `.replace(/\s{2,}/g, ' ').trim()
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};
```

### Sanitize User Content
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize HTML content before rendering
export function SafeHtml({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
  
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

## Rate Limiting

### API Route Rate Limiting
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);
  
  if (!success) {
    return Response.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString()
        }
      }
    );
  }
  
  // Process request
}
```

## Secure Headers

### Middleware Implementation
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');
  
  return response;
}
```

## File Upload Security

```typescript
import { writeFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import path from 'path';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  
  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: 'Invalid file type' }, { status: 400 });
  }
  
  // Validate size
  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'File too large' }, { status: 400 });
  }
  
  // Generate safe filename
  const ext = path.extname(file.name);
  const safeFilename = `${nanoid()}${ext}`;
  
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  
  await writeFile(`./uploads/${safeFilename}`, buffer);
  
  return Response.json({ filename: safeFilename });
}
```
