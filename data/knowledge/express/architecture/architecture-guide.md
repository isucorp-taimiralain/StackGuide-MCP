# Express.js Architecture Guide

## Application Architectures

### 1. MVC Architecture

```
src/
├── models/           # Data layer
│   ├── user.model.js
│   └── product.model.js
├── views/            # Template layer (if using SSR)
│   ├── layouts/
│   └── pages/
├── controllers/      # Business logic
│   ├── user.controller.js
│   └── product.controller.js
├── routes/           # Route definitions
│   └── index.js
└── app.js
```

```javascript
// Model - Data access and business logic
// models/user.model.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

userSchema.methods.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);

// Controller - Request handling
// controllers/user.controller.js
const User = require('../models/user.model');

exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
};

// Route - URL mapping
// routes/users.js
const router = require('express').Router();
const userController = require('../controllers/user.controller');

router.get('/:id', userController.getUser);
module.exports = router;
```

### 2. Layered Architecture (Recommended)

```
src/
├── api/
│   ├── routes/           # HTTP layer
│   ├── controllers/      # Request handling
│   ├── middleware/       # Express middleware
│   └── validators/       # Input validation
├── services/             # Business logic layer
│   ├── user.service.js
│   └── auth.service.js
├── repositories/         # Data access layer
│   ├── user.repository.js
│   └── base.repository.js
├── models/               # Domain models
│   └── user.model.js
├── config/               # Configuration
├── utils/                # Utilities
└── app.js
```

```javascript
// Repository Layer - Data access abstraction
// repositories/base.repository.js
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async findById(id) {
    return this.model.findById(id);
  }

  async findOne(filter) {
    return this.model.findOne(filter);
  }

  async find(filter, options = {}) {
    const { sort, limit, skip, select } = options;
    return this.model.find(filter)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .select(select);
  }

  async create(data) {
    return this.model.create(data);
  }

  async updateById(id, data) {
    return this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }
}

module.exports = BaseRepository;

// repositories/user.repository.js
const BaseRepository = require('./base.repository');
const User = require('../models/user.model');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByEmail(email) {
    return this.model.findOne({ email });
  }

  async findActiveUsers() {
    return this.model.find({ isActive: true });
  }
}

module.exports = new UserRepository();

// Service Layer - Business logic
// services/user.service.js
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');

class UserService {
  async createUser(userData) {
    const existingUser = await userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new ApiError(400, 'Email already exists');
    }
    return userRepository.create(userData);
  }

  async getUserById(id) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
  }

  async updateUser(id, updateData) {
    const user = await this.getUserById(id);
    return userRepository.updateById(id, updateData);
  }
}

module.exports = new UserService();

// Controller Layer - HTTP handling
// controllers/user.controller.js
const userService = require('../services/user.service');
const { catchAsync } = require('../utils/catchAsync');

exports.createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json({ success: true, data: user });
});

exports.getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  res.json({ success: true, data: user });
});
```

### 3. Domain-Driven Design (DDD)

```
src/
├── domain/
│   ├── user/
│   │   ├── entities/
│   │   │   └── User.js
│   │   ├── value-objects/
│   │   │   └── Email.js
│   │   ├── repositories/
│   │   │   └── IUserRepository.js
│   │   └── services/
│   │       └── UserDomainService.js
│   └── order/
│       ├── entities/
│       └── services/
├── application/
│   ├── user/
│   │   ├── commands/
│   │   ├── queries/
│   │   └── handlers/
│   └── order/
├── infrastructure/
│   ├── persistence/
│   │   ├── mongodb/
│   │   └── repositories/
│   ├── messaging/
│   └── external/
├── interfaces/
│   ├── http/
│   │   ├── routes/
│   │   └── controllers/
│   └── graphql/
└── shared/
    ├── errors/
    └── utils/
```

```javascript
// Domain Entity
// domain/user/entities/User.js
const Email = require('../value-objects/Email');

class User {
  constructor({ id, email, password, name, role, createdAt }) {
    this.id = id;
    this.email = new Email(email);
    this.password = password;
    this.name = name;
    this.role = role || 'user';
    this.createdAt = createdAt || new Date();
  }

  isAdmin() {
    return this.role === 'admin';
  }

  canAccess(resource) {
    return this.role === 'admin' || resource.ownerId === this.id;
  }
}

module.exports = User;

// Value Object
// domain/user/value-objects/Email.js
class Email {
  constructor(value) {
    this.validate(value);
    this.value = value.toLowerCase();
  }

  validate(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new Error('Invalid email format');
    }
  }

  equals(other) {
    return other instanceof Email && this.value === other.value;
  }

  toString() {
    return this.value;
  }
}

module.exports = Email;

// Application Command
// application/user/commands/CreateUserCommand.js
class CreateUserCommand {
  constructor({ email, password, name }) {
    this.email = email;
    this.password = password;
    this.name = name;
  }
}

// Command Handler
// application/user/handlers/CreateUserHandler.js
class CreateUserHandler {
  constructor(userRepository, passwordHasher, eventBus) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.eventBus = eventBus;
  }

  async handle(command) {
    const existingUser = await this.userRepository.findByEmail(command.email);
    if (existingUser) {
      throw new UserAlreadyExistsError(command.email);
    }

    const hashedPassword = await this.passwordHasher.hash(command.password);
    
    const user = new User({
      email: command.email,
      password: hashedPassword,
      name: command.name,
    });

    await this.userRepository.save(user);
    
    await this.eventBus.publish(new UserCreatedEvent(user));
    
    return user;
  }
}
```

## Dependency Injection

### Manual DI Container
```javascript
// di/container.js
class Container {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  register(name, factory, singleton = false) {
    this.services.set(name, { factory, singleton });
  }

  resolve(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }

    if (service.singleton) {
      if (!this.singletons.has(name)) {
        this.singletons.set(name, service.factory(this));
      }
      return this.singletons.get(name);
    }

    return service.factory(this);
  }
}

module.exports = new Container();

// di/setup.js
const container = require('./container');

// Register services
container.register('userRepository', () => require('../repositories/user.repository'), true);
container.register('authService', (c) => new AuthService(c.resolve('userRepository')), true);
container.register('userService', (c) => new UserService(
  c.resolve('userRepository'),
  c.resolve('authService')
), true);

module.exports = container;
```

### Using Awilix
```javascript
const { createContainer, asClass, asValue, Lifetime } = require('awilix');

const container = createContainer();

container.register({
  // Config
  config: asValue(require('./config')),
  
  // Repositories
  userRepository: asClass(UserRepository).singleton(),
  productRepository: asClass(ProductRepository).singleton(),
  
  // Services
  authService: asClass(AuthService).singleton(),
  userService: asClass(UserService).singleton(),
  emailService: asClass(EmailService).singleton(),
  
  // Controllers
  userController: asClass(UserController).scoped(),
  authController: asClass(AuthController).scoped(),
});

// Middleware to scope container per request
const scopePerRequest = (req, res, next) => {
  req.container = container.createScope();
  next();
};

// Usage in route
router.get('/users', (req, res) => {
  const userController = req.container.resolve('userController');
  return userController.getUsers(req, res);
});
```

## Event-Driven Architecture

### Event Emitter Pattern
```javascript
// events/eventBus.js
const EventEmitter = require('events');

class EventBus extends EventEmitter {
  async publish(event) {
    this.emit(event.constructor.name, event);
  }

  subscribe(eventName, handler) {
    this.on(eventName, handler);
  }
}

module.exports = new EventBus();

// events/definitions.js
class UserCreatedEvent {
  constructor(user) {
    this.user = user;
    this.timestamp = new Date();
  }
}

class OrderPlacedEvent {
  constructor(order) {
    this.order = order;
    this.timestamp = new Date();
  }
}

// events/handlers.js
const eventBus = require('./eventBus');
const emailService = require('../services/email.service');

eventBus.subscribe('UserCreatedEvent', async (event) => {
  await emailService.sendWelcomeEmail(event.user.email);
});

eventBus.subscribe('OrderPlacedEvent', async (event) => {
  await emailService.sendOrderConfirmation(event.order);
});
```

## Microservices Architecture

### API Gateway Pattern
```javascript
// gateway/app.js
const express = require('express');
const httpProxy = require('http-proxy');
const rateLimit = require('express-rate-limit');

const app = express();
const proxy = httpProxy.createProxyServer();

const services = {
  users: 'http://users-service:3001',
  products: 'http://products-service:3002',
  orders: 'http://orders-service:3003',
};

// Rate limiting
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// Proxy routes
app.use('/api/users', (req, res) => {
  proxy.web(req, res, { target: services.users });
});

app.use('/api/products', (req, res) => {
  proxy.web(req, res, { target: services.products });
});

app.use('/api/orders', (req, res) => {
  proxy.web(req, res, { target: services.orders });
});

// Error handling
proxy.on('error', (err, req, res) => {
  res.status(503).json({ error: 'Service unavailable' });
});
```

### Service Communication
```javascript
// Communication between services
const axios = require('axios');

class ServiceClient {
  constructor(baseURL, timeout = 5000) {
    this.client = axios.create({
      baseURL,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async get(path, config = {}) {
    const response = await this.client.get(path, config);
    return response.data;
  }

  async post(path, data, config = {}) {
    const response = await this.client.post(path, data, config);
    return response.data;
  }
}

// Usage
const usersService = new ServiceClient('http://users-service:3001');
const user = await usersService.get(`/users/${userId}`);
```

## Caching Layer

```javascript
// cache/cacheManager.js
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

class CacheManager {
  constructor(defaultTTL = 3600) {
    this.defaultTTL = defaultTTL;
  }

  async get(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key, value, ttl = this.defaultTTL) {
    await redis.setex(key, ttl, JSON.stringify(value));
  }

  async delete(key) {
    await redis.del(key);
  }

  async invalidatePattern(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length) {
      await redis.del(...keys);
    }
  }

  // Cache-aside pattern
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    let data = await this.get(key);
    if (data === null) {
      data = await fetchFn();
      await this.set(key, data, ttl);
    }
    return data;
  }
}

module.exports = new CacheManager();

// Usage in service
class ProductService {
  async getProduct(id) {
    const cacheKey = `product:${id}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => productRepository.findById(id),
      3600
    );
  }
}
```

## Database Patterns

### Unit of Work
```javascript
class UnitOfWork {
  constructor() {
    this.session = null;
    this.operations = [];
  }

  async begin() {
    this.session = await mongoose.startSession();
    this.session.startTransaction();
  }

  addOperation(operation) {
    this.operations.push(operation);
  }

  async commit() {
    try {
      for (const operation of this.operations) {
        await operation(this.session);
      }
      await this.session.commitTransaction();
    } catch (error) {
      await this.session.abortTransaction();
      throw error;
    } finally {
      this.session.endSession();
    }
  }
}

// Usage
const uow = new UnitOfWork();
await uow.begin();

uow.addOperation(async (session) => {
  await User.create([userData], { session });
});

uow.addOperation(async (session) => {
  await Profile.create([profileData], { session });
});

await uow.commit();
```
