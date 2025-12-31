# Next.js Best Practices

## Performance Optimization

### Image Optimization
```typescript
import Image from 'next/image';

// Always use next/image for optimized images
export function Avatar({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      priority={false}  // Set true for above-the-fold images
      placeholder="blur" // Optional blur placeholder
    />
  );
}
```

### Font Optimization
```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

### Script Optimization
```typescript
import Script from 'next/script';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script
        src="https://analytics.example.com/script.js"
        strategy="lazyOnload" // Load after page is interactive
      />
    </>
  );
}
```

## Caching Strategies

### Static Data (Default)
```typescript
// Cached indefinitely by default
async function getStaticData() {
  const res = await fetch('https://api.example.com/static');
  return res.json();
}
```

### Revalidation
```typescript
// Time-based revalidation
async function getRevalidatedData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 } // Revalidate every hour
  });
  return res.json();
}

// On-demand revalidation
import { revalidatePath, revalidateTag } from 'next/cache';

export async function updatePost(id: string) {
  await db.posts.update({ id });
  revalidatePath('/posts');
  revalidateTag('posts');
}
```

### No Cache
```typescript
// Dynamic data - no caching
async function getDynamicData() {
  const res = await fetch('https://api.example.com/realtime', {
    cache: 'no-store'
  });
  return res.json();
}
```

## Server Actions

### Form Handling
```typescript
// app/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  
  await db.posts.create({ title, content });
  
  revalidatePath('/posts');
  redirect('/posts');
}

// Usage in component
export default function CreatePostForm() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

### With Validation
```typescript
'use server';

import { z } from 'zod';

const PostSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(10)
});

export async function createPost(formData: FormData) {
  const validated = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content')
  });
  
  if (!validated.success) {
    return { error: validated.error.flatten() };
  }
  
  await db.posts.create(validated.data);
  revalidatePath('/posts');
}
```

## Route Handlers

### API Best Practices
```typescript
import { NextRequest, NextResponse } from 'next/server';

// GET with query params
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '10');
  
  const data = await db.items.findMany({
    skip: (page - 1) * limit,
    take: limit
  });
  
  return NextResponse.json({
    data,
    pagination: { page, limit }
  });
}

// POST with body validation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ItemSchema.parse(body);
    
    const item = await db.items.create({ data: validated });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
```

## Middleware

### Authentication Middleware
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  
  // Protect /dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*']
};
```

## Loading States

### Streaming with Suspense
```typescript
import { Suspense } from 'react';

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<LoadingSkeleton />}>
        <SlowComponent />
      </Suspense>
    </div>
  );
}
```

### Loading UI
```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
    </div>
  );
}
```

## Internationalization

### Setup
```typescript
// next.config.js
module.exports = {
  i18n: {
    locales: ['en', 'es', 'fr'],
    defaultLocale: 'en'
  }
};
```

### Usage
```typescript
import { useLocale, useTranslations } from 'next-intl';

export function Header() {
  const t = useTranslations('Header');
  const locale = useLocale();
  
  return (
    <header>
      <h1>{t('title')}</h1>
      <span>Current: {locale}</span>
    </header>
  );
}
```
