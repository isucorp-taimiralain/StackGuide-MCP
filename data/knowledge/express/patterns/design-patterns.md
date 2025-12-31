# Express.js Design Patterns

## Middleware Patterns

### Chain of Responsibility
```javascript
// Each middleware handles request and passes to next
const logRequest = (req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
};

const authenticate = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = verifyToken(token);
  next();
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Usage - chain of responsibility
app.get('/admin', 
  logRequest, 
  authenticate, 
  authorize('admin'), 
  adminController.dashboard
);
```

### Composite Middleware
```javascript
// Combine multiple middleware into one
const compose = (...middlewares) => {
  return (req, res, next) => {
    const dispatch = (i) => {
      if (i === middlewares.length) {
        return next();
      }
      const middleware = middlewares[i];
      try {
        middleware(req, res, () => dispatch(i + 1));
      } catch (err) {
        next(err);
      }
    };
    dispatch(0);
  };
};

// Prebuilt composed middleware
const apiMiddleware = compose(
  helmet(),
  cors(),
  express.json(),
  authenticate,
  rateLimit({ max: 100 })
);

app.use('/api', apiMiddleware);
```

## Factory Pattern

### Controller Factory
```javascript
// factory/controllerFactory.js
const createCRUDController = (service) => {
  return {
    getAll: catchAsync(async (req, res) => {
      const items = await service.findAll(req.query);
      res.json({ success: true, data: items });
    }),

    getOne: catchAsync(async (req, res) => {
      const item = await service.findById(req.params.id);
      res.json({ success: true, data: item });
    }),

    create: catchAsync(async (req, res) => {
      const item = await service.create(req.body);
      res.status(201).json({ success: true, data: item });
    }),

    update: catchAsync(async (req, res) => {
      const item = await service.updateById(req.params.id, req.body);
      res.json({ success: true, data: item });
    }),

    delete: catchAsync(async (req, res) => {
      await service.deleteById(req.params.id);
      res.status(204).send();
    }),
  };
};

// Usage
const userService = require('./services/user.service');
const userController = createCRUDController(userService);

router.get('/', userController.getAll);
router.post('/', userController.create);
router.get('/:id', userController.getOne);
router.put('/:id', userController.update);
router.delete('/:id', userController.delete);
```

### Route Factory
```javascript
// factory/routeFactory.js
const express = require('express');

const createCRUDRouter = (controller, options = {}) => {
  const router = express.Router();
  const { middleware = [], validators = {} } = options;

  router.get('/', ...middleware, controller.getAll);
  router.get('/:id', ...middleware, validators.getOne || [], controller.getOne);
  router.post('/', ...middleware, validators.create || [], controller.create);
  router.put('/:id', ...middleware, validators.update || [], controller.update);
  router.delete('/:id', ...middleware, controller.delete);

  return router;
};

// Usage
const userRouter = createCRUDRouter(userController, {
  middleware: [authenticate],
  validators: {
    create: [body('email').isEmail(), body('password').isLength({ min: 8 })],
    update: [body('email').optional().isEmail()],
  },
});

app.use('/api/users', userRouter);
```

## Repository Pattern

```javascript
// repositories/baseRepository.js
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async findAll(filter = {}, options = {}) {
    const { sort, limit = 10, skip = 0, select, populate } = options;
    let query = this.model.find(filter);
    
    if (sort) query = query.sort(sort);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    
    return query.limit(limit).skip(skip).lean();
  }

  async findById(id, options = {}) {
    let query = this.model.findById(id);
    if (options.populate) query = query.populate(options.populate);
    return query.lean();
  }

  async findOne(filter, options = {}) {
    let query = this.model.findOne(filter);
    if (options.populate) query = query.populate(options.populate);
    return query.lean();
  }

  async create(data) {
    const doc = new this.model(data);
    await doc.save();
    return doc.toObject();
  }

  async updateById(id, data) {
    return this.model.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  async count(filter = {}) {
    return this.model.countDocuments(filter);
  }
}

// repositories/userRepository.js
class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByEmail(email) {
    return this.findOne({ email });
  }

  async findActiveUsers() {
    return this.findAll({ isActive: true });
  }

  async findWithPagination(filter, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.findAll(filter, { skip, limit }),
      this.count(filter),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = new UserRepository();
```

## Service Pattern

```javascript
// services/baseService.js
class BaseService {
  constructor(repository) {
    this.repository = repository;
  }

  async findAll(filter, options) {
    return this.repository.findAll(filter, options);
  }

  async findById(id) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new ApiError(404, 'Resource not found');
    }
    return item;
  }

  async create(data) {
    return this.repository.create(data);
  }

  async updateById(id, data) {
    await this.findById(id); // Verify exists
    return this.repository.updateById(id, data);
  }

  async deleteById(id) {
    await this.findById(id); // Verify exists
    return this.repository.deleteById(id);
  }
}

// services/userService.js
class UserService extends BaseService {
  constructor() {
    super(userRepository);
  }

  async create(data) {
    const exists = await this.repository.findByEmail(data.email);
    if (exists) {
      throw new ApiError(400, 'Email already exists');
    }
    return super.create(data);
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      throw new ApiError(400, 'Incorrect password');
    }
    user.password = newPassword;
    await user.save();
  }
}
```

## Strategy Pattern

```javascript
// strategies/authStrategy.js
class AuthStrategy {
  authenticate(req) {
    throw new Error('Not implemented');
  }
}

class JWTStrategy extends AuthStrategy {
  authenticate(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new ApiError(401, 'No token');
    return jwt.verify(token, config.jwt.secret);
  }
}

class APIKeyStrategy extends AuthStrategy {
  authenticate(req) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) throw new ApiError(401, 'No API key');
    return this.validateApiKey(apiKey);
  }

  async validateApiKey(key) {
    const apiKey = await ApiKey.findOne({ key, isActive: true });
    if (!apiKey) throw new ApiError(401, 'Invalid API key');
    return apiKey;
  }
}

class OAuth2Strategy extends AuthStrategy {
  authenticate(req) {
    // OAuth2 implementation
  }
}

// Context
class AuthContext {
  constructor(strategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy) {
    this.strategy = strategy;
  }

  authenticate(req) {
    return this.strategy.authenticate(req);
  }
}

// Middleware using strategy
const authMiddleware = (strategyName = 'jwt') => {
  const strategies = {
    jwt: new JWTStrategy(),
    apiKey: new APIKeyStrategy(),
    oauth2: new OAuth2Strategy(),
  };

  return async (req, res, next) => {
    try {
      const context = new AuthContext(strategies[strategyName]);
      req.auth = await context.authenticate(req);
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Usage
app.use('/api', authMiddleware('jwt'));
app.use('/external', authMiddleware('apiKey'));
```

## Decorator Pattern

```javascript
// decorators/logging.js
const withLogging = (fn, name) => {
  return async (...args) => {
    console.log(`[${name}] Starting...`);
    const start = Date.now();
    try {
      const result = await fn(...args);
      console.log(`[${name}] Completed in ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.error(`[${name}] Failed:`, error.message);
      throw error;
    }
  };
};

// decorators/caching.js
const withCaching = (fn, keyFn, ttl = 3600) => {
  return async (...args) => {
    const key = keyFn(...args);
    const cached = await cache.get(key);
    if (cached) return cached;
    
    const result = await fn(...args);
    await cache.set(key, result, ttl);
    return result;
  };
};

// decorators/retry.js
const withRetry = (fn, maxRetries = 3, delay = 1000) => {
  return async (...args) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
    throw lastError;
  };
};

// Usage
class ProductService {
  constructor() {
    this.getProduct = withCaching(
      withLogging(this._getProduct.bind(this), 'getProduct'),
      (id) => `product:${id}`,
      3600
    );
  }

  async _getProduct(id) {
    return productRepository.findById(id);
  }
}
```

## Observer Pattern

```javascript
// events/EventEmitter.js
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) callbacks.splice(index, 1);
    }
  }

  async emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    await Promise.all(callbacks.map(cb => cb(data)));
  }
}

// Domain events
const domainEvents = new EventEmitter();

// Subscribe
domainEvents.on('user.created', async (user) => {
  await sendWelcomeEmail(user);
});

domainEvents.on('user.created', async (user) => {
  await createDefaultProfile(user);
});

domainEvents.on('order.placed', async (order) => {
  await notifyShipping(order);
  await sendConfirmationEmail(order);
});

// Publish
class UserService {
  async create(data) {
    const user = await userRepository.create(data);
    await domainEvents.emit('user.created', user);
    return user;
  }
}
```

## Singleton Pattern

```javascript
// services/database.js
class Database {
  constructor() {
    if (Database.instance) {
      return Database.instance;
    }
    
    this.connection = null;
    Database.instance = this;
  }

  async connect(url) {
    if (this.connection) {
      return this.connection;
    }
    this.connection = await mongoose.connect(url);
    return this.connection;
  }

  getConnection() {
    return this.connection;
  }
}

module.exports = new Database();

// Alternative: Module singleton
// cache/redis.js
let instance = null;

const getRedisClient = () => {
  if (!instance) {
    instance = new Redis(config.redis.url);
  }
  return instance;
};

module.exports = { getRedisClient };
```

## Builder Pattern

```javascript
// builders/queryBuilder.js
class QueryBuilder {
  constructor(model) {
    this.model = model;
    this.filters = {};
    this.options = {};
  }

  where(field, value) {
    this.filters[field] = value;
    return this;
  }

  whereIn(field, values) {
    this.filters[field] = { $in: values };
    return this;
  }

  whereBetween(field, min, max) {
    this.filters[field] = { $gte: min, $lte: max };
    return this;
  }

  search(field, text) {
    this.filters[field] = { $regex: text, $options: 'i' };
    return this;
  }

  sort(field, order = 'asc') {
    this.options.sort = { [field]: order === 'asc' ? 1 : -1 };
    return this;
  }

  limit(count) {
    this.options.limit = count;
    return this;
  }

  skip(count) {
    this.options.skip = count;
    return this;
  }

  select(fields) {
    this.options.select = fields.join(' ');
    return this;
  }

  populate(path, select) {
    this.options.populate = { path, select };
    return this;
  }

  async execute() {
    let query = this.model.find(this.filters);
    
    if (this.options.sort) query = query.sort(this.options.sort);
    if (this.options.limit) query = query.limit(this.options.limit);
    if (this.options.skip) query = query.skip(this.options.skip);
    if (this.options.select) query = query.select(this.options.select);
    if (this.options.populate) query = query.populate(this.options.populate);
    
    return query.lean();
  }

  async count() {
    return this.model.countDocuments(this.filters);
  }
}

// Usage
const products = await new QueryBuilder(Product)
  .where('category', 'electronics')
  .whereBetween('price', 100, 500)
  .search('name', 'phone')
  .sort('price', 'desc')
  .limit(20)
  .skip(0)
  .select(['name', 'price', 'description'])
  .execute();
```

## Adapter Pattern

```javascript
// adapters/paymentAdapter.js
class PaymentAdapter {
  async charge(amount, source, metadata) {
    throw new Error('Not implemented');
  }

  async refund(transactionId, amount) {
    throw new Error('Not implemented');
  }
}

class StripeAdapter extends PaymentAdapter {
  constructor() {
    super();
    this.stripe = require('stripe')(config.stripe.secretKey);
  }

  async charge(amount, source, metadata) {
    const charge = await this.stripe.charges.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      source,
      metadata,
    });
    return {
      id: charge.id,
      status: charge.status,
      amount: charge.amount / 100,
    };
  }

  async refund(transactionId, amount) {
    const refund = await this.stripe.refunds.create({
      charge: transactionId,
      amount: Math.round(amount * 100),
    });
    return { id: refund.id, status: refund.status };
  }
}

class PayPalAdapter extends PaymentAdapter {
  async charge(amount, source, metadata) {
    // PayPal implementation
  }

  async refund(transactionId, amount) {
    // PayPal implementation
  }
}

// Factory
const getPaymentAdapter = (provider) => {
  switch (provider) {
    case 'stripe': return new StripeAdapter();
    case 'paypal': return new PayPalAdapter();
    default: throw new Error('Unknown payment provider');
  }
};
```

## Command Pattern

```javascript
// commands/Command.js
class Command {
  execute() {
    throw new Error('Not implemented');
  }

  undo() {
    throw new Error('Not implemented');
  }
}

class CreateOrderCommand extends Command {
  constructor(orderData, orderService) {
    super();
    this.orderData = orderData;
    this.orderService = orderService;
    this.createdOrder = null;
  }

  async execute() {
    this.createdOrder = await this.orderService.create(this.orderData);
    return this.createdOrder;
  }

  async undo() {
    if (this.createdOrder) {
      await this.orderService.delete(this.createdOrder.id);
    }
  }
}

// Command invoker
class CommandInvoker {
  constructor() {
    this.history = [];
  }

  async execute(command) {
    const result = await command.execute();
    this.history.push(command);
    return result;
  }

  async undo() {
    const command = this.history.pop();
    if (command) {
      await command.undo();
    }
  }
}

// Usage
const invoker = new CommandInvoker();
const command = new CreateOrderCommand(orderData, orderService);
const order = await invoker.execute(command);
// Later...
await invoker.undo(); // Cancels the order
```
