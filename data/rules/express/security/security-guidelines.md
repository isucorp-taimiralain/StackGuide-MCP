# Express.js Security Guidelines

## Authentication

### JWT Implementation
```javascript
const jwt = require('jsonwebtoken');
const config = require('../config');

const generateAccessToken = (userId) => {
  return jwt.sign(
    { sub: userId, type: 'access' },
    config.jwt.secret,
    { expiresIn: `${config.jwt.accessExpirationMinutes}m` }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: `${config.jwt.refreshExpirationDays}d` }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token');
  }
};

// Auth middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'No token provided');
    }
    
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (payload.type !== 'access') {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token type');
    }
    
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
    }
    
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
```

### Password Security
```javascript
const bcrypt = require('bcryptjs');

// In user model
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  // Use high cost factor
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Password validation
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  .messages({
    'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
  });
```

### Token Refresh
```javascript
const refreshTokens = async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Refresh token required');
  }
  
  const payload = verifyToken(refreshToken);
  
  if (payload.type !== 'refresh') {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token type');
  }
  
  // Check if token is blacklisted
  const isBlacklisted = await TokenBlacklist.findOne({ token: refreshToken });
  if (isBlacklisted) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Token has been revoked');
  }
  
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
  }
  
  // Blacklist old refresh token
  await TokenBlacklist.create({ token: refreshToken, expiresAt: new Date(payload.exp * 1000) });
  
  // Generate new tokens
  const accessToken = generateAccessToken(user.id);
  const newRefreshToken = generateRefreshToken(user.id);
  
  res.json({ accessToken, refreshToken: newRefreshToken });
};
```

## Input Validation & Sanitization

### Prevent NoSQL Injection
```javascript
// ❌ Vulnerable to NoSQL injection
app.post('/login', async (req, res) => {
  const user = await User.findOne({
    email: req.body.email,
    password: req.body.password, // Can be { $ne: '' } to bypass
  });
});

// ✅ Safe: Validate input types
const { body } = require('express-validator');

app.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().trim(),
  ],
  validateRequest,
  async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    // Compare password separately with bcrypt
  }
);

// ✅ Use mongo-sanitize
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize());
```

### XSS Prevention
```javascript
const xss = require('xss');

// Sanitize user input
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return xss(input);
  }
  if (typeof input === 'object') {
    return Object.keys(input).reduce((acc, key) => {
      acc[key] = sanitizeInput(input[key]);
      return acc;
    }, Array.isArray(input) ? [] : {});
  }
  return input;
};

// Middleware
app.use((req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  next();
});

// Or use xss-clean package
const xssClean = require('xss-clean');
app.use(xssClean());
```

## Rate Limiting

### Comprehensive Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(config.redis.url);

// General API rate limit
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict auth rate limit
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:auth:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts' },
  skipSuccessfulRequests: true,
});

// User-based rate limit
const userLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:user:',
  }),
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/users', authenticate, userLimiter);
```

## Security Headers

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
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));
```

## CORS Configuration

```javascript
const cors = require('cors');

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://yourdomain.com',
      'https://app.yourdomain.com',
    ];
    
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
};

app.use(cors(corsOptions));
```

## File Upload Security

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, 'Invalid file type'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE,
    files: 5,
  },
});

// Validate file content (not just extension)
const validateFileContent = require('file-type');

app.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const fileType = await validateFileContent.fromFile(req.file.path);
    
    if (!fileType || !ALLOWED_TYPES.includes(fileType.mime)) {
      // Delete the file
      fs.unlinkSync(req.file.path);
      throw new ApiError(400, 'Invalid file content');
    }
    
    res.json({ filename: req.file.filename });
  } catch (error) {
    next(error);
  }
});
```

## Security Logging

```javascript
const winston = require('winston');

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/security.log' }),
  ],
});

const logSecurityEvent = (event, req, details = {}) => {
  securityLogger.info({
    event,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    ...details,
  });
};

// Log login attempts
app.post('/login', async (req, res, next) => {
  try {
    const user = await authenticateUser(req.body);
    logSecurityEvent('LOGIN_SUCCESS', req, { email: req.body.email });
    res.json({ token: generateToken(user) });
  } catch (error) {
    logSecurityEvent('LOGIN_FAILED', req, { email: req.body.email });
    next(error);
  }
});

// Log suspicious activity
const detectSuspiciousActivity = (req, res, next) => {
  // Check for SQL injection patterns
  const suspicious = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)/i;
  const body = JSON.stringify(req.body);
  
  if (suspicious.test(body)) {
    logSecurityEvent('SUSPICIOUS_INPUT', req, { body });
  }
  
  next();
};
```

## Environment Variables

```javascript
// Never commit secrets
// Use environment variables

// Validate required env vars at startup
const requiredEnvVars = [
  'NODE_ENV',
  'JWT_SECRET',
  'MONGODB_URL',
  'SESSION_SECRET',
];

const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// Use strong secrets
// Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## HTTPS Enforcement

```javascript
// Force HTTPS in production
const forceHttps = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
  }
  next();
};

app.use(forceHttps);

// Trust proxy (if behind load balancer)
app.set('trust proxy', 1);
```

## Session Security

```javascript
const session = require('express-session');
const RedisStore = require('connect-redis').default;

app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'sessionId', // Don't use default 'connect.sid'
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));
```

## Dependency Security

```bash
# Regular security audits
npm audit

# Fix vulnerabilities
npm audit fix

# Use Snyk for continuous monitoring
npm install -g snyk
snyk test
snyk monitor
```
