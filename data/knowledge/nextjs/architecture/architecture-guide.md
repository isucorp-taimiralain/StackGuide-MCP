# Next.js Architecture Guide

## Project Structure

### Recommended App Router Structure
```
my-nextjs-app/
├── app/                      # App Router (Next.js 13+)
│   ├── (auth)/              # Route group for auth pages
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx       # Auth-specific layout
│   ├── (dashboard)/         # Protected route group
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx       # Dashboard layout with sidebar
│   ├── api/                 # API routes
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   └── users/
│   │       └── route.ts
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page
│   ├── loading.tsx          # Global loading state
│   ├── error.tsx            # Global error boundary
│   └── not-found.tsx        # 404 page
├── components/              # Reusable components
│   ├── ui/                  # Base UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Modal.tsx
│   ├── forms/               # Form components
│   │   ├── LoginForm.tsx
│   │   └── UserForm.tsx
│   └── layout/              # Layout components
│       ├── Header.tsx
│       ├── Footer.tsx
│       └── Sidebar.tsx
├── lib/                     # Utilities and configurations
│   ├── auth.ts              # Auth utilities
│   ├── db.ts                # Database client
│   ├── utils.ts             # General utilities
│   └── validations.ts       # Zod schemas
├── hooks/                   # Custom React hooks
│   ├── useUser.ts
│   └── useDebounce.ts
├── types/                   # TypeScript types
│   ├── user.ts
│   └── api.ts
├── actions/                 # Server Actions
│   ├── auth.ts
│   └── users.ts
├── services/                # External service integrations
│   ├── stripe.ts
│   └── email.ts
├── public/                  # Static assets
├── styles/                  # Global styles
│   └── globals.css
├── middleware.ts            # Edge middleware
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

## Component Architecture

### Server vs Client Components

```
┌─────────────────────────────────────────────────────────┐
│                    Server Components                     │
│  ┌─────────────────────────────────────────────────────┐│
│  │ • Data fetching                                      ││
│  │ • Direct database access                             ││
│  │ • Access backend resources                           ││
│  │ • Keep sensitive info on server                      ││
│  │ • Large dependencies stay on server                  ││
│  └─────────────────────────────────────────────────────┘│
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Client Components                     │
│  ┌─────────────────────────────────────────────────────┐│
│  │ • Interactivity (onClick, onChange)                  ││
│  │ • useState, useEffect, useReducer                    ││
│  │ • Browser APIs                                       ││
│  │ • Custom hooks with state                            ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Composition Pattern
```typescript
// app/dashboard/page.tsx (Server Component)
import { DashboardClient } from './DashboardClient';

async function DashboardPage() {
  // Server-side data fetching
  const data = await fetchDashboardData();
  
  return (
    <div>
      <h1>Dashboard</h1>
      {/* Pass data to client component */}
      <DashboardClient initialData={data} />
    </div>
  );
}

// app/dashboard/DashboardClient.tsx
'use client';

import { useState } from 'react';

export function DashboardClient({ initialData }) {
  const [data, setData] = useState(initialData);
  // Client-side interactivity
}
```

## Data Flow Architecture

### Unidirectional Data Flow
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Database   │────▶│    Server    │────▶│   Client     │
│              │     │  Components  │     │  Components  │
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                                         │
       │                                         │
       └─────────────Server Actions──────────────┘
```

### Data Fetching Layers
```typescript
// lib/db.ts - Database layer
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// lib/data/users.ts - Data access layer
import { prisma } from '@/lib/db';
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      // Never select password
    }
  });
});

export const getUsers = cache(async () => {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });
});
```

## Authentication Architecture

### Auth Flow
```
┌─────────────────────────────────────────────────────────────┐
│                     Authentication Flow                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────┐  credentials  ┌──────────────┐
│   Login      │──────────────▶│   NextAuth   │
│   Page       │               │   API Route  │
└──────────────┘               └──────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ┌──────────┐     ┌──────────┐     ┌──────────┐
              │ Database │     │  OAuth   │     │   JWT    │
              │  Check   │     │ Provider │     │  Token   │
              └──────────┘     └──────────┘     └──────────┘
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      ▼
                              ┌──────────────┐
                              │   Session    │
                              │   Cookie     │
                              └──────────────┘
```

### Protected Layout Pattern
```typescript
// app/(protected)/layout.tsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  
  if (!session) {
    redirect('/login');
  }
  
  return (
    <div className="flex">
      <Sidebar user={session.user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

## State Management

### Server State (React Query / SWR)
```typescript
// For client-side data fetching with caching
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useUser(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/users/${id}`,
    fetcher
  );
  
  return {
    user: data,
    isLoading,
    isError: error,
    mutate
  };
}
```

### Client State (Zustand)
```typescript
// stores/useAuthStore.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null })
}));
```

## API Design

### RESTful Route Handlers
```
app/api/
├── users/
│   ├── route.ts              # GET /api/users, POST /api/users
│   └── [id]/
│       └── route.ts          # GET/PUT/DELETE /api/users/:id
├── posts/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       └── comments/
│           └── route.ts      # /api/posts/:id/comments
```

### Response Format
```typescript
// lib/api.ts
export function successResponse<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

export function paginatedResponse<T>(
  data: T[],
  { page, limit, total }: { page: number; limit: number; total: number }
) {
  return Response.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}
```

## Caching Architecture

### Multi-Layer Caching
```
┌─────────────────────────────────────────────────────────────┐
│                     Caching Layers                           │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐  1st  ┌──────────────┐  2nd  ┌──────────────┐
│    React     │──────▶│    Next.js   │──────▶│   External   │
│    Cache     │       │  Data Cache  │       │    (Redis)   │
└──────────────┘       └──────────────┘       └──────────────┘
     cache()           fetch + next{}         Custom cache

                              │
                              ▼
                    ┌──────────────────┐
                    │  Full Route      │
                    │  Cache (Static)  │
                    └──────────────────┘
```

### Cache Strategy Examples
```typescript
// React cache - dedupe within request
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});

// Next.js fetch cache - across requests
async function getData() {
  const res = await fetch('https://api.example.com/data', {
    next: {
      revalidate: 3600,  // ISR
      tags: ['data']     // For on-demand revalidation
    }
  });
  return res.json();
}

// unstable_cache for non-fetch operations
import { unstable_cache } from 'next/cache';

const getCachedUser = unstable_cache(
  async (id: string) => db.user.findUnique({ where: { id } }),
  ['user'],
  { revalidate: 3600, tags: ['users'] }
);
```
