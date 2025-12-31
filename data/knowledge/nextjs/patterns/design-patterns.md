# Next.js Design Patterns

## Component Patterns

### Container/Presentational Pattern
```typescript
// containers/UserListContainer.tsx (Server Component)
import { UserList } from '@/components/UserList';

async function UserListContainer() {
  const users = await db.users.findMany();
  return <UserList users={users} />;
}

// components/UserList.tsx (Can be client or server)
interface UserListProps {
  users: User[];
}

export function UserList({ users }: UserListProps) {
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

### Compound Components
```typescript
// components/Card.tsx
import { createContext, useContext } from 'react';

const CardContext = createContext<{ variant: 'default' | 'outlined' }>({
  variant: 'default'
});

function Card({ 
  children, 
  variant = 'default' 
}: { 
  children: React.ReactNode;
  variant?: 'default' | 'outlined';
}) {
  return (
    <CardContext.Provider value={{ variant }}>
      <div className={`card card-${variant}`}>
        {children}
      </div>
    </CardContext.Provider>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  const { variant } = useContext(CardContext);
  return <div className={`card-header card-header-${variant}`}>{children}</div>;
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="card-footer">{children}</div>;
}

// Attach sub-components
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export { Card };

// Usage
<Card variant="outlined">
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### Render Props with Server Components
```typescript
// Pattern for flexible server-side rendering
interface DataFetcherProps<T> {
  fetcher: () => Promise<T>;
  render: (data: T) => React.ReactNode;
  fallback?: React.ReactNode;
}

async function DataFetcher<T>({ 
  fetcher, 
  render, 
  fallback 
}: DataFetcherProps<T>) {
  try {
    const data = await fetcher();
    return <>{render(data)}</>;
  } catch {
    return <>{fallback ?? 'Error loading data'}</>;
  }
}

// Usage
<DataFetcher
  fetcher={() => getUsers()}
  render={(users) => <UserList users={users} />}
  fallback={<EmptyState />}
/>
```

## Data Fetching Patterns

### Parallel Data Fetching
```typescript
// app/dashboard/page.tsx
async function DashboardPage() {
  // Start all fetches simultaneously
  const [users, posts, analytics] = await Promise.all([
    getUsers(),
    getPosts(),
    getAnalytics()
  ]);
  
  return (
    <div>
      <UserSection users={users} />
      <PostsSection posts={posts} />
      <AnalyticsSection data={analytics} />
    </div>
  );
}
```

### Sequential with Dependencies
```typescript
async function UserProfilePage({ params }: { params: { id: string } }) {
  // Sequential - posts depend on user
  const user = await getUser(params.id);
  const posts = await getPostsByUserId(user.id);
  
  return (
    <div>
      <UserHeader user={user} />
      <UserPosts posts={posts} />
    </div>
  );
}
```

### Streaming Pattern
```typescript
import { Suspense } from 'react';

// Slow component fetches its own data
async function SlowRecommendations() {
  const recs = await getRecommendations(); // Slow API
  return <RecommendationsList items={recs} />;
}

export default function Page() {
  return (
    <div>
      <Header />
      <MainContent />
      
      {/* Stream in when ready */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <SlowRecommendations />
      </Suspense>
    </div>
  );
}
```

## Server Action Patterns

### Optimistic Updates
```typescript
'use client';

import { useOptimistic } from 'react';
import { addTodo } from '@/actions/todos';

export function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, newTodo]
  );
  
  async function handleSubmit(formData: FormData) {
    const newTodo = {
      id: Date.now().toString(),
      title: formData.get('title') as string,
      completed: false
    };
    
    // Optimistically add the todo
    addOptimisticTodo(newTodo);
    
    // Then perform the actual action
    await addTodo(formData);
  }
  
  return (
    <form action={handleSubmit}>
      <input name="title" />
      <button type="submit">Add</button>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </form>
  );
}
```

### Form State Pattern
```typescript
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createPost } from '@/actions/posts';

function SubmitButton() {
  const { pending } = useFormStatus();
  
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Post'}
    </button>
  );
}

export function CreatePostForm() {
  const [state, formAction] = useFormState(createPost, {
    errors: {},
    message: ''
  });
  
  return (
    <form action={formAction}>
      <input name="title" />
      {state.errors?.title && <p>{state.errors.title}</p>}
      
      <textarea name="content" />
      {state.errors?.content && <p>{state.errors.content}</p>}
      
      <SubmitButton />
      
      {state.message && <p>{state.message}</p>}
    </form>
  );
}
```

## Layout Patterns

### Nested Layouts
```typescript
// app/layout.tsx - Root layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}

// app/(marketing)/layout.tsx - Marketing pages layout
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto">
      {children}
    </div>
  );
}

// app/(dashboard)/layout.tsx - Dashboard layout
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

### Parallel Routes
```typescript
// app/layout.tsx
export default function Layout({
  children,
  modal,
  sidebar
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  return (
    <div className="flex">
      {sidebar}
      <main>{children}</main>
      {modal}
    </div>
  );
}

// app/@modal/login/page.tsx - Intercepted modal
export default function LoginModal() {
  return (
    <Modal>
      <LoginForm />
    </Modal>
  );
}
```

## Error Handling Patterns

### Granular Error Boundaries
```typescript
// app/dashboard/error.tsx
'use client';

export default function DashboardError({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="error-container">
      <h2>Dashboard Error</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try Again</button>
    </div>
  );
}

// app/dashboard/analytics/error.tsx
// More specific error handling for analytics section
'use client';

export default function AnalyticsError({ error, reset }) {
  return (
    <div className="analytics-error">
      <p>Failed to load analytics. {error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
```

### Error Boundary with Fallback Data
```typescript
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div>
      <p>Something went wrong</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export default function Page() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<Loading />}>
        <DataComponent />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Authentication Patterns

### Role-Based Access
```typescript
// lib/auth.ts
import { getServerSession } from 'next-auth';

type Role = 'user' | 'admin' | 'superadmin';

export async function requireRole(allowedRoles: Role[]) {
  const session = await getServerSession();
  
  if (!session) {
    redirect('/login');
  }
  
  if (!allowedRoles.includes(session.user.role)) {
    redirect('/unauthorized');
  }
  
  return session;
}

// app/admin/page.tsx
export default async function AdminPage() {
  const session = await requireRole(['admin', 'superadmin']);
  
  return <AdminDashboard user={session.user} />;
}
```

### Protected API Routes
```typescript
// lib/auth.ts
export async function withAuth(
  handler: (req: Request, session: Session) => Promise<Response>
) {
  return async (request: Request) => {
    const session = await getServerSession();
    
    if (!session) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    return handler(request, session);
  };
}

// app/api/protected/route.ts
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (request, session) => {
  const data = await getData(session.user.id);
  return Response.json(data);
});
```

## Caching Patterns

### Request Memoization
```typescript
import { cache } from 'react';

// Deduplicated across component tree in single request
export const getUser = cache(async (id: string) => {
  console.log('Fetching user', id); // Only logs once per request
  return db.user.findUnique({ where: { id } });
});

// Used in multiple components
function UserHeader() {
  const user = await getUser(userId); // First call - fetches
  return <h1>{user.name}</h1>;
}

function UserSidebar() {
  const user = await getUser(userId); // Second call - uses cached result
  return <aside>{user.bio}</aside>;
}
```

### Tag-Based Revalidation
```typescript
// lib/data.ts
import { unstable_cache } from 'next/cache';

export const getPosts = unstable_cache(
  async () => db.posts.findMany(),
  ['posts'],
  { tags: ['posts'], revalidate: 3600 }
);

export const getPost = unstable_cache(
  async (id: string) => db.posts.findUnique({ where: { id } }),
  ['post'],
  { tags: ['posts', 'post'] }
);

// actions/posts.ts
'use server';

import { revalidateTag } from 'next/cache';

export async function createPost(data: PostData) {
  await db.posts.create({ data });
  revalidateTag('posts'); // Invalidates all post-related caches
}
```
