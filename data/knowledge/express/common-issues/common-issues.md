# Express.js Common Issues and Solutions

## Async/Await Errors

### Unhandled Promise Rejections
```javascript
// ❌ Problem: Error not caught
app.get('/users', async (req, res) => {
  const users = await User.find(); // If throws, app crashes
  res.json(users);
});

// ✅ Solution 1: Wrap with catchAsync
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/users', catchAsync(async (req, res) => {
  const users = await User.find();
  res.json(users);
}));

// ✅ Solution 2: Use express-async-errors
require('express-async-errors');
// Now async errors are automatically forwarded to error handler

// ✅ Solution 3: Global handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  // Log and potentially restart process
});
```

### Async Middleware Issues
```javascript
// ❌ Problem: Async middleware doesn't wait
app.use(async (req, res, next) => {
  req.user = await getUser(req.token);
  next();
}); // This might not work as expected

// ✅ Solution: Handle async properly
app.use((req, res, next) => {
  getUser(req.token)
    .then(user => {
      req.user = user;
      next();
    })
    .catch(next);
});

// Or with catchAsync
app.use(catchAsync(async (req, res, next) => {
  req.user = await getUser(req.token);
  next();
}));
```

## Middleware Order Issues

### Body Parser Not Working
```javascript
// ❌ Problem: Body is undefined
app.post('/users', (req, res) => {
  console.log(req.body); // undefined
});
app.use(express.json()); // Too late!

// ✅ Solution: Correct order
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Then routes
app.post('/users', (req, res) => {
  console.log(req.body); // Now works
});
```

### CORS Not Working
```javascript
// ❌ Problem: CORS after routes
app.use('/api', routes);
app.use(cors()); // Too late for routes above

// ✅ Solution: CORS before routes
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use('/api', routes);

// ❌ Problem: Preflight not handled
// Browser sends OPTIONS request first

// ✅ Solution: Handle preflight
app.options('*', cors()); // Enable preflight for all routes
app.use(cors());
```

## Route Issues

### Route Order Matters
```javascript
// ❌ Problem: Specific route never reached
app.get('/users/:id', getUser);
app.get('/users/me', getMe); // Never reached! :id catches 'me'

// ✅ Solution: Order specific routes first
app.get('/users/me', getMe);
app.get('/users/:id', getUser);
```

### Route Not Found
```javascript
// ❌ Problem: Route exists but returns 404
// routes/users.js
const router = express.Router();
router.get('/', getUsers);

// app.js
app.use('/api/user', userRoutes); // Typo: 'user' not 'users'

// ✅ Solution: Verify route paths
app.use('/api/users', userRoutes);

// Add catch-all for debugging
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
  });
});
```

## Response Issues

### Headers Already Sent
```javascript
// ❌ Problem: Can't set headers after response sent
app.get('/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
  res.json({ message: 'done' }); // Error!
});

// ❌ Problem: Multiple res.send in conditionals
app.get('/user/:id', (req, res) => {
  if (!req.params.id) {
    res.status(400).json({ error: 'Missing ID' });
  }
  // Code continues to execute!
  res.json(user); // Error if ID was missing
});

// ✅ Solution: Always return after response
app.get('/user/:id', (req, res) => {
  if (!req.params.id) {
    return res.status(400).json({ error: 'Missing ID' });
  }
  return res.json(user);
});
```

### Response Timeout
```javascript
// ❌ Problem: Long operation times out
app.get('/report', async (req, res) => {
  const report = await generateLargeReport(); // Takes 5 minutes
  res.json(report); // Timeout!
});

// ✅ Solution 1: Increase timeout
app.get('/report', async (req, res) => {
  req.setTimeout(600000); // 10 minutes
  const report = await generateLargeReport();
  res.json(report);
});

// ✅ Solution 2: Use background job
app.post('/report', async (req, res) => {
  const job = await reportQueue.add({ userId: req.user.id });
  res.json({ jobId: job.id, status: 'processing' });
});

app.get('/report/:jobId', async (req, res) => {
  const job = await reportQueue.getJob(req.params.jobId);
  res.json({ status: job.status, result: job.result });
});
```

## Database Issues

### Connection Not Ready
```javascript
// ❌ Problem: Queries fail on startup
const mongoose = require('mongoose');
mongoose.connect(uri); // Async!

app.get('/users', async (req, res) => {
  const users = await User.find(); // May fail if not connected
});

app.listen(3000); // Server starts before DB connects

// ✅ Solution: Wait for connection
const startServer = async () => {
  try {
    await mongoose.connect(uri);
    console.log('Database connected');
    
    app.listen(3000, () => {
      console.log('Server running');
    });
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
};

startServer();
```

### Connection Pool Exhaustion
```javascript
// ❌ Problem: Too many connections
// Creating new connection for each request
app.get('/users', async (req, res) => {
  const conn = await mongoose.createConnection(uri);
  const users = await conn.model('User').find();
  res.json(users);
  // Connection never closed!
});

// ✅ Solution: Use connection pooling
mongoose.connect(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Reuse single connection
app.get('/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
});
```

## Memory Issues

### Memory Leaks
```javascript
// ❌ Problem: Event listeners accumulating
app.get('/stream', (req, res) => {
  eventEmitter.on('data', (data) => {
    res.write(data);
  });
  // Listener never removed!
});

// ✅ Solution: Clean up on connection close
app.get('/stream', (req, res) => {
  const handler = (data) => res.write(data);
  eventEmitter.on('data', handler);
  
  req.on('close', () => {
    eventEmitter.off('data', handler);
  });
});

// ❌ Problem: Large data in memory
app.get('/export', async (req, res) => {
  const allData = await Model.find(); // Millions of records
  res.json(allData); // Out of memory!
});

// ✅ Solution: Stream data
app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.write('[');
  
  const cursor = Model.find().cursor();
  let first = true;
  
  for await (const doc of cursor) {
    if (!first) res.write(',');
    res.write(JSON.stringify(doc));
    first = false;
  }
  
  res.write(']');
  res.end();
});
```

## Security Issues

### NoSQL Injection
```javascript
// ❌ Vulnerable
app.post('/login', async (req, res) => {
  const user = await User.findOne({
    email: req.body.email,
    // Attacker sends: { password: { $ne: '' } }
    password: req.body.password, 
  });
});

// ✅ Solution: Validate input types
const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

app.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  
  const user = await User.findOne({ email: value.email });
  // Verify password separately with bcrypt
});

// Or use mongo-sanitize
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize());
```

### Path Traversal
```javascript
// ❌ Vulnerable
app.get('/files/:name', (req, res) => {
  res.sendFile(`./uploads/${req.params.name}`);
  // Attacker: GET /files/../../../etc/passwd
});

// ✅ Solution: Validate and sanitize
const path = require('path');

app.get('/files/:name', (req, res) => {
  const safeName = path.basename(req.params.name);
  const filePath = path.join(__dirname, 'uploads', safeName);
  
  // Verify file is within allowed directory
  if (!filePath.startsWith(path.join(__dirname, 'uploads'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  res.sendFile(filePath);
});
```

## Testing Issues

### Test Database Pollution
```javascript
// ❌ Problem: Tests affect each other
describe('User API', () => {
  it('creates user', async () => {
    await request(app)
      .post('/users')
      .send({ email: 'test@test.com' });
  });
  
  it('creates another user', async () => {
    // Fails! Email already exists from previous test
    await request(app)
      .post('/users')
      .send({ email: 'test@test.com' });
  });
});

// ✅ Solution: Clean database between tests
beforeEach(async () => {
  await User.deleteMany({});
});

// Or use transactions
beforeEach(async () => {
  session = await mongoose.startSession();
  session.startTransaction();
});

afterEach(async () => {
  await session.abortTransaction();
});
```

### Async Test Timeouts
```javascript
// ❌ Problem: Test times out
it('should process data', async () => {
  const result = await longRunningTask(); // Takes 10 seconds
  expect(result).toBeDefined();
}); // Default timeout is 5 seconds

// ✅ Solution: Increase timeout
it('should process data', async () => {
  const result = await longRunningTask();
  expect(result).toBeDefined();
}, 15000); // 15 second timeout

// Or configure globally
jest.setTimeout(15000);
```

## Performance Issues

### N+1 Query Problem
```javascript
// ❌ Problem: One query per user
app.get('/posts', async (req, res) => {
  const posts = await Post.find();
  
  // N additional queries!
  for (const post of posts) {
    post.author = await User.findById(post.authorId);
  }
  
  res.json(posts);
});

// ✅ Solution: Use populate or batch queries
app.get('/posts', async (req, res) => {
  const posts = await Post.find().populate('author');
  res.json(posts);
});

// Or batch fetch
app.get('/posts', async (req, res) => {
  const posts = await Post.find().lean();
  const authorIds = [...new Set(posts.map(p => p.authorId))];
  const authors = await User.find({ _id: { $in: authorIds } }).lean();
  
  const authorMap = new Map(authors.map(a => [a._id.toString(), a]));
  posts.forEach(p => {
    p.author = authorMap.get(p.authorId.toString());
  });
  
  res.json(posts);
});
```

### Slow Responses
```javascript
// ❌ Problem: No caching
app.get('/products', async (req, res) => {
  const products = await Product.find(); // Always hits DB
  res.json(products);
});

// ✅ Solution: Add caching
const cache = require('./cache');

app.get('/products', async (req, res) => {
  const cacheKey = 'products:all';
  let products = await cache.get(cacheKey);
  
  if (!products) {
    products = await Product.find().lean();
    await cache.set(cacheKey, products, 300); // 5 min TTL
  }
  
  res.json(products);
});
```

## Deployment Issues

### Trust Proxy Not Set
```javascript
// ❌ Problem: req.ip is wrong behind proxy
app.get('/log', (req, res) => {
  console.log(req.ip); // Logs proxy IP, not client IP
});

// ✅ Solution: Enable trust proxy
app.set('trust proxy', 1); // Trust first proxy
// Or
app.set('trust proxy', 'loopback'); // Trust local proxies

// Now req.ip will be client IP from X-Forwarded-For
```

### Environment Variables Not Loading
```javascript
// ❌ Problem: env vars undefined
console.log(process.env.API_KEY); // undefined

// ✅ Solution: Load dotenv early
// At very top of entry file
require('dotenv').config();

// Or check for required vars
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}
```

### Graceful Shutdown
```javascript
// ❌ Problem: Abrupt shutdown loses requests
process.on('SIGTERM', () => process.exit(0));

// ✅ Solution: Graceful shutdown
const server = app.listen(port);

const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Close DB connections
    await mongoose.connection.close();
    console.log('Database connection closed');
    
    process.exit(0);
  });
  
  // Force close after timeout
  setTimeout(() => {
    console.error('Forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```
