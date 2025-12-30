# React/Node Common Issues and Solutions

Solutions to frequently encountered problems in React and Node.js development.

## React Issues

### State Not Updating

**Problem**: State doesn't update as expected.

**Solution**:
```tsx
// State updates are asynchronous and batched
const [count, setCount] = useState(0);

// Wrong - uses stale value
setCount(count + 1);
setCount(count + 1); // Still increments by 1

// Correct - use functional update
setCount(prev => prev + 1);
setCount(prev => prev + 1); // Increments by 2
```

### useEffect Running Twice

**Problem**: Effect runs twice in development.

**Solution**:
```tsx
// React 18+ Strict Mode intentionally double-invokes effects
// to help find bugs. Don't disable Strict Mode - fix the code.

// Ensure cleanup handles this
useEffect(() => {
  const controller = new AbortController();
  
  fetchData({ signal: controller.signal });
  
  return () => controller.abort(); // Cleanup
}, []);

// For subscriptions
useEffect(() => {
  const unsubscribe = subscribe(handler);
  return () => unsubscribe();
}, []);
```

### Memory Leaks in Components

**Problem**: "Can't perform a React state update on an unmounted component"

**Solution**:
```tsx
// Use AbortController for fetch
useEffect(() => {
  const controller = new AbortController();
  
  async function fetchData() {
    try {
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      setData(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
      }
    }
  }
  
  fetchData();
  return () => controller.abort();
}, [url]);

// Or use ref to track mount state (less preferred)
const isMounted = useRef(true);
useEffect(() => {
  return () => { isMounted.current = false; };
}, []);
```

### Prop Drilling

**Problem**: Passing props through many levels.

**Solution**:
```tsx
// Use Context for truly global state
const ThemeContext = createContext<Theme>('light');

function App() {
  const [theme, setTheme] = useState<Theme>('light');
  return (
    <ThemeContext.Provider value={theme}>
      <Page />
    </ThemeContext.Provider>
  );
}

// Any nested component can access
function DeepComponent() {
  const theme = useContext(ThemeContext);
}

// Or use composition
function Page() {
  const user = useUser();
  return <Layout header={<Header user={user} />} />;
}
```

## Node.js Issues

### Callback Hell

**Problem**: Deeply nested callbacks.

**Solution**:
```typescript
// Convert to promises
import { promisify } from 'util';
const readFile = promisify(fs.readFile);

// Use async/await
async function processFile(path: string) {
  const content = await readFile(path, 'utf-8');
  const parsed = JSON.parse(content);
  return transform(parsed);
}

// Handle errors properly
try {
  const result = await processFile('./data.json');
} catch (error) {
  logger.error('Failed to process file', { error });
}
```

### Unhandled Promise Rejections

**Problem**: Crash due to unhandled rejection.

**Solution**:
```typescript
// Global handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  // Optionally exit
  process.exit(1);
});

// Always handle promises
async function riskyOperation() {
  try {
    await mightFail();
  } catch (error) {
    handleError(error);
  }
}

// Or with .catch()
mightFail().catch(handleError);
```

### Event Loop Blocking

**Problem**: Long-running sync operation blocks the server.

**Solution**:
```typescript
// Bad - blocks event loop
app.get('/hash', (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 12); // Blocks!
  res.json({ hash });
});

// Good - use async version
app.get('/hash', async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 12);
  res.json({ hash });
});

// For CPU-intensive work, use worker threads
import { Worker } from 'worker_threads';

function runHeavyTask(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

### Memory Leaks

**Problem**: Node.js process memory keeps growing.

**Solution**:
```typescript
// Check for common causes:

// 1. Growing arrays/maps without cleanup
const cache = new Map();
// Add max size limit
function set(key: string, value: any) {
  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

// 2. Event listeners not removed
const handler = () => {};
emitter.on('event', handler);
// Later...
emitter.off('event', handler);

// 3. Closures holding references
function createHandler(bigData) {
  // bigData is retained in closure
  return () => console.log(bigData.length);
}
// Solution: extract only needed data
function createHandler(dataLength) {
  return () => console.log(dataLength);
}
```

### Database Connection Issues

**Problem**: Too many connections or connection timeouts.

**Solution**:
```typescript
// Use connection pooling
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Use single client for transactions
async function transfer(from: string, to: string, amount: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, from]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, to]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release(); // Always release!
  }
}
```
