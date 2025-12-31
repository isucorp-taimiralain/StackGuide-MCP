# Next.js Coding Standards

## File Structure and Naming

### App Router Conventions
```
app/
├── layout.tsx          # Root layout
├── page.tsx            # Home page
├── loading.tsx         # Loading UI
├── error.tsx           # Error boundary
├── not-found.tsx       # 404 page
├── (group)/            # Route groups
│   └── page.tsx
├── [slug]/             # Dynamic segments
│   └── page.tsx
├── [...slug]/          # Catch-all segments
│   └── page.tsx
└── api/
    └── route.ts        # API routes
```

### Component Naming
- **Page components**: `page.tsx` (required by App Router)
- **Layout components**: `layout.tsx`
- **Components**: PascalCase (`UserCard.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Hooks**: `use` prefix (`useAuth.ts`)

## Component Patterns

### Server Components (Default)
```typescript
// app/users/page.tsx - Server Component by default
async function UsersPage() {
  const users = await db.users.findMany(); // Direct DB access
  
  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}

export default UsersPage;
```

### Client Components
```typescript
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
```

### When to Use Client Components
- useState, useEffect, useReducer
- Event handlers (onClick, onChange)
- Browser APIs (localStorage, window)
- Custom hooks that use state
- Class components

## TypeScript Standards

### Page Props
```typescript
// Dynamic route params
interface PageProps {
  params: { slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = params;
  return <div>Slug: {slug}</div>;
}
```

### API Route Types
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  
  return NextResponse.json({ id });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json(body, { status: 201 });
}
```

## Data Fetching

### Server-Side Data Fetching
```typescript
// Fetch with caching
async function getData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 } // Revalidate every hour
  });
  
  if (!res.ok) throw new Error('Failed to fetch data');
  return res.json();
}
```

### Parallel Data Fetching
```typescript
async function Page() {
  // Parallel fetching - more efficient
  const [users, posts] = await Promise.all([
    getUsers(),
    getPosts()
  ]);
  
  return <div>...</div>;
}
```

## Metadata and SEO

### Static Metadata
```typescript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Page',
  description: 'Page description',
  openGraph: {
    title: 'My Page',
    description: 'Page description',
    images: ['/og-image.png']
  }
};
```

### Dynamic Metadata
```typescript
import { Metadata } from 'next';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.id);
  
  return {
    title: product.name,
    description: product.description
  };
}
```

## Error Handling

### Error Boundaries
```typescript
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Not Found
```typescript
import { notFound } from 'next/navigation';

async function Page({ params }: { params: { id: string } }) {
  const user = await getUser(params.id);
  
  if (!user) {
    notFound();
  }
  
  return <div>{user.name}</div>;
}
```

## Environment Variables

### Naming Conventions
```env
# Server-only (default)
DATABASE_URL=postgresql://...
API_SECRET=secret

# Browser-accessible (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_API_URL=https://api.example.com
```

### Usage
```typescript
// Server component
const dbUrl = process.env.DATABASE_URL;

// Client component - only NEXT_PUBLIC_ vars
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```
