# Express.js Best Practices

## Async/Await Handling

### Catch Async Errors
```javascript
// ❌ Bad: Unhandled promise rejection
app.get('/users', async (req, res) => {
  const users = await User.find(); // If this throws, error is unhandled
  res.json(users);
});

// ✅ Good: Use catchAsync wrapper
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/users', catchAsync(async (req, res) => {
  const users = await User.find();
  res.json(users);
}));

// ✅ Alternative: express-async-errors
require('express-async-errors');

app.get('/users', async (req, res) => {
  const users = await User.find(); // Errors automatically forwarded to error handler
  res.json(users);
});
```

## Middleware Best Practices

### Order Matters
```javascript
// Middleware order is critical
const app = express();

// 1. Security middleware first
app.use(helmet());
app.use(cors());

// 2. Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Logging
app.use(morgan('combined'));

// 4. Authentication (for protected routes)
app.use('/api', authenticate);

// 5. Routes
app.use('/api', routes);

// 6. Error handlers last
app.use(notFoundHandler);
app.use(errorHandler);
```

### Custom Middleware Pattern
```javascript
// Create reusable middleware
const rateLimit = (options) => {
  const { windowMs = 60000, max = 100 } = options;
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    const userRequests = (requests.get(key) || [])
      .filter(time => time > windowStart);

    if (userRequests.length >= max) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
      });
    }

    userRequests.push(now);
    requests.set(key, userRequests);
    next();
  };
};

// Usage
app.use('/api/auth/login', rateLimit({ windowMs: 60000, max: 5 }));
```

## Request Validation

### Validate All Input
```javascript
const { body, param, query, validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Route with validation
router.post('/users',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).trim(),
    body('name').notEmpty().trim().escape(),
  ],
  validateRequest,
  usersController.createUser
);

router.get('/users/:id',
  [
    param('id').isMongoId(),
  ],
  validateRequest,
  usersController.getUser
);
```

## Response Handling

### Consistent Response Format
```javascript
// Response helper
const sendResponse = (res, { statusCode = 200, success = true, message, data, meta }) => {
  const response = {
    success,
    ...(message && { message }),
    ...(data !== undefined && { data }),
    ...(meta && { meta }),
  };
  return res.status(statusCode).json(response);
};

// Usage
app.get('/users', async (req, res) => {
  const { users, total, page, pages } = await getUsers(req.query);
  
  sendResponse(res, {
    data: users,
    meta: { total, page, pages },
  });
});

app.post('/users', async (req, res) => {
  const user = await createUser(req.body);
  
  sendResponse(res, {
    statusCode: 201,
    message: 'User created successfully',
    data: user,
  });
});
```

### HTTP Status Codes
```javascript
const httpStatus = require('http-status');

// Use semantic status codes
res.status(httpStatus.OK).json(data);           // 200
res.status(httpStatus.CREATED).json(data);      // 201
res.status(httpStatus.NO_CONTENT).send();       // 204
res.status(httpStatus.BAD_REQUEST).json(error); // 400
res.status(httpStatus.UNAUTHORIZED).json(error);// 401
res.status(httpStatus.FORBIDDEN).json(error);   // 403
res.status(httpStatus.NOT_FOUND).json(error);   // 404
res.status(httpStatus.INTERNAL_SERVER_ERROR).json(error); // 500
```

## Database Best Practices

### Connection Management
```javascript
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./utils/logger');

const connectDatabase = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  logger.error('MongoDB error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
  process.exit(0);
});

module.exports = { connectDatabase };
```

### Query Optimization
```javascript
// Use lean() for read-only queries
const users = await User.find({ isActive: true }).lean();

// Select only needed fields
const user = await User.findById(id).select('name email');

// Use indexes
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });

// Pagination
const paginate = async (model, filter, options) => {
  const { page = 1, limit = 10, sortBy = 'createdAt:desc' } = options;
  const skip = (page - 1) * limit;
  
  const [sortField, sortOrder] = sortBy.split(':');
  const sort = { [sortField]: sortOrder === 'desc' ? -1 : 1 };
  
  const [docs, total] = await Promise.all([
    model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  
  return {
    docs,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};
```

## Caching

### Redis Caching
```javascript
const Redis = require('ioredis');
const redis = new Redis(config.redis.url);

const cache = {
  async get(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  async set(key, value, ttl = 3600) {
    await redis.setex(key, ttl, JSON.stringify(value));
  },

  async del(key) {
    await redis.del(key);
  },

  async delPattern(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length) {
      await redis.del(...keys);
    }
  },
};

// Cache middleware
const cacheMiddleware = (ttl = 300) => async (req, res, next) => {
  const key = `cache:${req.originalUrl}`;
  
  const cached = await cache.get(key);
  if (cached) {
    return res.json(cached);
  }
  
  // Store original json method
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    await cache.set(key, data, ttl);
    return originalJson(data);
  };
  
  next();
};

// Usage
router.get('/products', cacheMiddleware(600), productsController.getProducts);
```

## Security Best Practices

### Helmet Configuration
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to all requests
app.use(limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts' },
});

app.use('/api/auth', authLimiter);
```

## Testing

### Integration Tests
```javascript
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/user.model');

describe('Users API', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URL);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/v1/users', () => {
    it('should create a new user', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      };

      const res = await request(app)
        .post('/api/v1/users')
        .send(userData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(userData.email);
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 400 for invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .send({ name: 'Test', email: 'invalid', password: 'Password123!' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
```

## Performance

### Compression
```javascript
const compression = require('compression');

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
}));
```

### Clustering
```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  
  console.log(`Master ${process.pid} is running`);
  
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Replace the dead worker
  });
} else {
  require('./server');
  console.log(`Worker ${process.pid} started`);
}
```

## Environment-Specific Configuration

```javascript
// Use different configs per environment
const config = {
  development: {
    db: 'mongodb://localhost/dev',
    logLevel: 'debug',
  },
  production: {
    db: process.env.MONGODB_URL,
    logLevel: 'info',
  },
  test: {
    db: 'mongodb://localhost/test',
    logLevel: 'error',
  },
};

module.exports = config[process.env.NODE_ENV || 'development'];
```

## Graceful Shutdown

```javascript
const server = app.listen(port);

const shutdown = async () => {
  console.log('Shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Close database connections
    await mongoose.connection.close();
    console.log('Database connection closed');
    
    // Close Redis connection
    await redis.quit();
    console.log('Redis connection closed');
    
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```
