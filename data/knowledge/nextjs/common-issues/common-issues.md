# Next.js Common Issues and Solutions

## Hydration Errors

### Problem: Text content mismatch
```
Error: Text content does not match server-rendered HTML.
```

**Cause**: Server and client render different content.

**Solutions**:
```typescript
// ❌ Bad - Date will differ between server and client
function Component() {
  return <p>Current time: {new Date().toLocaleString()}</p>;
}

// ✅ Good - Use useEffect for client-only values
'use client';

import { useState, useEffect } from 'react';

function Component() {
  const [time, setTime] = useState<string>('');
  
  useEffect(() => {
    setTime(new Date().toLocaleString());
  }, []);
  
  return <p>Current time: {time || 'Loading...'}</p>;
}

// ✅ Alternative - Suppress hydration warning
function Component() {
  return (
    <p suppressHydrationWarning>
      {new Date().toLocaleString()}
    </p>
  );
}
```

### Problem: useLayoutEffect warning
```
Warning: useLayoutEffect does nothing on the server
```

**Solution**:
```typescript
// ✅ Use dynamic import with ssr: false
import dynamic from 'next/dynamic';

const ClientOnlyComponent = dynamic(
  () => import('./ClientOnlyComponent'),
  { ssr: false }
);
```

## Server Component Errors

### Problem: Using hooks in Server Components
```
Error: useState only works in Client Components
```

**Solution**:
```typescript
// ❌ Bad - hooks in server component
// app/page.tsx
import { useState } from 'react';

export default function Page() {
  const [count, setCount] = useState(0); // Error!
  return <div>{count}</div>;
}

// ✅ Good - extract to client component
// components/Counter.tsx
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// app/page.tsx
import { Counter } from '@/components/Counter';

export default function Page() {
  return <Counter />;
}
```

### Problem: Passing functions to Client Components
```
Error: Functions cannot be passed directly to Client Components
```

**Solution**:
```typescript
// ❌ Bad - passing function from server to client
async function Page() {
  const handleClick = () => console.log('clicked');
  return <ClientComponent onClick={handleClick} />;
}

// ✅ Good - use Server Actions
// actions.ts
'use server';

export async function handleAction() {
  console.log('Server action executed');
}

// page.tsx
import { handleAction } from './actions';

export default function Page() {
  return <ClientComponent action={handleAction} />;
}
```

## Data Fetching Issues

### Problem: Fetch not revalidating
```typescript
// Data appears stale, not updating
```

**Solutions**:
```typescript
// Force no caching
const res = await fetch(url, { cache: 'no-store' });

// Time-based revalidation
const res = await fetch(url, { 
  next: { revalidate: 60 } // Revalidate every 60 seconds
});

// On-demand revalidation
import { revalidatePath, revalidateTag } from 'next/cache';

export async function updateData() {
  await db.update(/* ... */);
  revalidatePath('/data'); // Revalidate specific path
  revalidateTag('data');   // Revalidate by tag
}
```

### Problem: Too many database connections
```
Error: Too many connections to database
```

**Solution**: Use singleton pattern
```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

## Routing Issues

### Problem: Dynamic route not matching
```typescript
// /users/123 not matching [id] route
```

**Check**:
```
app/
├── users/
│   ├── page.tsx           # /users
│   └── [id]/
│       └── page.tsx       # /users/123 ✅
```

**Common mistakes**:
```typescript
// ❌ Wrong - file named wrong
app/users/[id].tsx

// ✅ Correct - folder with page.tsx
app/users/[id]/page.tsx
```

### Problem: Catch-all vs optional catch-all
```typescript
// [...slug] - Required, matches /a, /a/b, /a/b/c
// [[...slug]] - Optional, also matches /

// app/docs/[...slug]/page.tsx
// Matches: /docs/intro, /docs/intro/getting-started
// Does NOT match: /docs

// app/docs/[[...slug]]/page.tsx
// Matches: /docs, /docs/intro, /docs/intro/getting-started
```

## Middleware Issues

### Problem: Middleware running on static assets
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // Runs on every request including _next/static
}

// ✅ Fix with matcher
export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### Problem: Redirect loop in middleware
```typescript
// ❌ Bad - infinite redirect
export function middleware(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// ✅ Good - exclude login page
export function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname === '/login';
  
  if (!isAuthenticated(request) && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
```

## Build Errors

### Problem: Module not found during build
```
Module not found: Can't resolve 'fs'
```

**Cause**: Using Node.js modules in client components

**Solution**:
```typescript
// ✅ Use dynamic import with ssr: false
import dynamic from 'next/dynamic';

const ServerOnlyComponent = dynamic(
  () => import('./ServerOnlyComponent'),
  { ssr: false }
);

// ✅ Or configure webpack
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
      };
    }
    return config;
  },
};
```

### Problem: "window is not defined"
```typescript
// ❌ Bad - accessing window at module level
const width = window.innerWidth;

// ✅ Good - check for browser environment
const width = typeof window !== 'undefined' ? window.innerWidth : 0;

// ✅ Better - use useEffect
'use client';

import { useState, useEffect } from 'react';

function useWindowWidth() {
  const [width, setWidth] = useState(0);
  
  useEffect(() => {
    setWidth(window.innerWidth);
    
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return width;
}
```

## Performance Issues

### Problem: Large bundle size
```bash
# Check bundle
npx @next/bundle-analyzer
```

**Solutions**:
```typescript
// 1. Dynamic imports for heavy components
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false
});

// 2. Tree-shake imports
// ❌ Bad
import { format } from 'date-fns';

// ✅ Good
import format from 'date-fns/format';

// 3. Lazy load below-the-fold content
<Suspense fallback={<Loading />}>
  <BelowFoldContent />
</Suspense>
```

### Problem: Slow API routes
```typescript
// ✅ Use Edge Runtime for faster cold starts
export const runtime = 'edge';

export async function GET(request: Request) {
  // Edge-compatible code only
  return Response.json({ data: 'fast' });
}
```

## Environment Variable Issues

### Problem: Environment variable undefined
```typescript
// ❌ Client-side access without NEXT_PUBLIC_
const apiKey = process.env.API_KEY; // undefined in browser

// ✅ For client-side, use NEXT_PUBLIC_ prefix
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// ✅ For server-side, normal env vars work
// (in Server Components, API routes, middleware)
const secretKey = process.env.SECRET_KEY;
```

### Problem: Env vars not updating
```bash
# Restart dev server after changing .env files
npm run dev

# For production, redeploy or rebuild
npm run build
```

## Image Optimization Issues

### Problem: External images not loading
```typescript
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: '*.cloudinary.com',
      },
    ],
  },
};
```

### Problem: Image layout shift
```typescript
// ✅ Always provide width and height
<Image
  src="/image.png"
  width={800}
  height={600}
  alt="Description"
/>

// ✅ Or use fill with container
<div className="relative h-64 w-full">
  <Image
    src="/image.png"
    fill
    className="object-cover"
    alt="Description"
  />
</div>
```

## TypeScript Issues

### Problem: params type in dynamic routes
```typescript
// ✅ Correct typing for App Router
interface PageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function Page({ params, searchParams }: PageProps) {
  const { id } = params;
  const query = searchParams.q;
  return <div>ID: {id}</div>;
}
```

### Problem: Metadata types
```typescript
import type { Metadata, ResolvingMetadata } from 'next';

export async function generateMetadata(
  { params }: { params: { id: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const product = await getProduct(params.id);
  const previousImages = (await parent).openGraph?.images || [];
  
  return {
    title: product.name,
    openGraph: {
      images: [product.image, ...previousImages],
    },
  };
}
```
