# Express.js Coding Standards

## Project Structure

### Recommended Directory Layout
```
src/
├── app.js                  # Express app setup
├── server.js               # Entry point
├── config/
│   ├── index.js            # Configuration
│   └── database.js         # Database config
├── middleware/
│   ├── auth.js
│   ├── error.js
│   ├── validate.js
│   └── rateLimiter.js
├── routes/
│   ├── index.js            # Route aggregator
│   ├── auth.routes.js
│   └── users.routes.js
├── controllers/
│   ├── auth.controller.js
│   └── users.controller.js
├── services/
│   ├── auth.service.js
│   └── users.service.js
├── models/
│   ├── index.js
│   └── user.model.js
├── validators/
│   ├── auth.validator.js
│   └── users.validator.js
├── utils/
│   ├── logger.js
│   ├── ApiError.js
│   └── catchAsync.js
└── tests/
    ├── unit/
    └── integration/
```

## Application Setup

### Express App Configuration
```javascript
// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const config = require('./config');
const routes = require('./routes');
const errorHandler = require('./middleware/error');
const { notFoundHandler } = require('./middleware/notFound');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (config.env !== 'test') {
  app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
```

### Server Entry Point
```javascript
// src/server.js
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');

const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.env} mode`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
```

## Routing

### Route Organization
```javascript
// src/routes/index.js
const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const productsRoutes = require('./products.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/products', productsRoutes);

module.exports = router;
```

### Route Definition
```javascript
// src/routes/users.routes.js
const express = require('express');
const usersController = require('../controllers/users.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createUserSchema, updateUserSchema } = require('../validators/users.validator');

const router = express.Router();

router
  .route('/')
  .get(authenticate, usersController.getUsers)
  .post(authenticate, authorize('admin'), validate(createUserSchema), usersController.createUser);

router
  .route('/:id')
  .get(authenticate, usersController.getUser)
  .put(authenticate, validate(updateUserSchema), usersController.updateUser)
  .delete(authenticate, authorize('admin'), usersController.deleteUser);

module.exports = router;
```

## Controllers

### Controller Pattern
```javascript
// src/controllers/users.controller.js
const httpStatus = require('http-status');
const usersService = require('../services/users.service');
const { catchAsync } = require('../utils/catchAsync');
const { pick } = require('../utils/pick');

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'isActive']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  const result = await usersService.queryUsers(filter, options);
  
  res.status(httpStatus.OK).json({
    success: true,
    data: result,
  });
});

const getUser = catchAsync(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  
  res.status(httpStatus.OK).json({
    success: true,
    data: user,
  });
});

const createUser = catchAsync(async (req, res) => {
  const user = await usersService.createUser(req.body);
  
  res.status(httpStatus.CREATED).json({
    success: true,
    data: user,
  });
});

const updateUser = catchAsync(async (req, res) => {
  const user = await usersService.updateUserById(req.params.id, req.body);
  
  res.status(httpStatus.OK).json({
    success: true,
    data: user,
  });
});

const deleteUser = catchAsync(async (req, res) => {
  await usersService.deleteUserById(req.params.id);
  
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
```

## Services

### Service Layer
```javascript
// src/services/users.service.js
const httpStatus = require('http-status');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');

const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  return User.create(userBody);
};

const queryUsers = async (filter, options) => {
  const users = await User.paginate(filter, options);
  return users;
};

const getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  return user;
};

const getUserByEmail = async (email) => {
  return User.findOne({ email });
};

const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  await user.deleteOne();
  return user;
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
};
```

## Models

### Mongoose Model
```javascript
// src/models/user.model.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Plugins
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

// Index
userSchema.index({ email: 1 });
userSchema.index({ name: 'text' });

// Static methods
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

// Instance methods
userSchema.methods.isPasswordMatch = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Middleware
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
```

## Validation

### Joi Validation
```javascript
// src/validators/users.validator.js
const Joi = require('joi');
const { objectId } = require('./custom');

const createUserSchema = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string()
      .required()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .message('Password must contain uppercase, lowercase, and number'),
    name: Joi.string().required().min(2).max(100),
    role: Joi.string().valid('user', 'admin'),
  }),
};

const updateUserSchema = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      email: Joi.string().email(),
      name: Joi.string().min(2).max(100),
    })
    .min(1),
};

const getUserSchema = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createUserSchema,
  updateUserSchema,
  getUserSchema,
};
```

### Validation Middleware
```javascript
// src/middleware/validate.js
const Joi = require('joi');
const httpStatus = require('http-status');
const { pick } = require('../utils/pick');
const ApiError = require('../utils/ApiError');

const validate = (schema) => (req, res, next) => {
  const validSchema = pick(schema, ['params', 'query', 'body']);
  const object = pick(req, Object.keys(validSchema));
  
  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: 'key' }, abortEarly: false })
    .validate(object);

  if (error) {
    const errorMessage = error.details
      .map((details) => details.message)
      .join(', ');
    return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
  }
  
  Object.assign(req, value);
  return next();
};

module.exports = { validate };
```

## Error Handling

### Custom Error Class
```javascript
// src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
```

### Async Handler
```javascript
// src/utils/catchAsync.js
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { catchAsync };
```

### Error Handler Middleware
```javascript
// src/middleware/error.js
const httpStatus = require('http-status');
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

const errorConverter = (err, req, res, next) => {
  let error = err;
  
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
    const message = error.message || httpStatus[statusCode];
    error = new ApiError(statusCode, message, false, err.stack);
  }
  
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  
  if (config.env === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR];
  }

  res.locals.errorMessage = err.message;

  const response = {
    success: false,
    code: statusCode,
    message,
    ...(config.env === 'development' && { stack: err.stack }),
  };

  if (config.env === 'development') {
    logger.error(err);
  }

  res.status(statusCode).json(response);
};

module.exports = (err, req, res, next) => {
  errorConverter(err, req, res, (convertedError) => {
    errorHandler(convertedError, req, res, next);
  });
};
```

## Configuration

### Environment Configuration
```javascript
// src/config/index.js
const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config();

const envSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description('MongoDB URL'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30),
  })
  .unknown();

const { value: envVars, error } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
  },
  cors: {
    origin: envVars.NODE_ENV === 'production' 
      ? ['https://yourdomain.com'] 
      : ['http://localhost:3000'],
    credentials: true,
  },
};
```

## Logging

### Winston Logger
```javascript
// src/utils/logger.js
const winston = require('winston');
const config = require('../config');

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }
  return info;
});

const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    enumerateErrorFormat(),
    config.env === 'development'
      ? winston.format.colorize()
      : winston.format.uncolorize(),
    winston.format.splat(),
    winston.format.printf(({ level, message }) => `${level}: ${message}`)
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

module.exports = logger;
```
