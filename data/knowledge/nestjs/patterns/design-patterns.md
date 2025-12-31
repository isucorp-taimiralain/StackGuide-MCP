# NestJS Design Patterns

## Provider Patterns

### Factory Provider
```typescript
const connectionFactory = {
  provide: 'DATABASE_CONNECTION',
  useFactory: async (configService: ConfigService): Promise<Connection> => {
    const options = configService.get<DatabaseOptions>('database');
    const connection = await createConnection(options);
    return connection;
  },
  inject: [ConfigService],
};

@Module({
  providers: [connectionFactory],
  exports: ['DATABASE_CONNECTION'],
})
export class DatabaseModule {}

// Usage
@Injectable()
export class UsersRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly connection: Connection,
  ) {}
}
```

### Async Provider
```typescript
const asyncProviders = [
  {
    provide: 'ASYNC_CONFIG',
    useFactory: async (): Promise<Config> => {
      const config = await fetchRemoteConfig();
      return config;
    },
  },
];
```

### Class Provider with Conditional Logic
```typescript
const loggerProvider = {
  provide: Logger,
  useClass:
    process.env.NODE_ENV === 'production'
      ? ProductionLogger
      : DevelopmentLogger,
};
```

## Repository Pattern

### Abstract Repository
```typescript
export abstract class BaseRepository<T> {
  constructor(protected readonly repository: Repository<T>) {}

  async findById(id: number): Promise<T | null> {
    return this.repository.findOne({ where: { id } as any });
  }

  async findAll(): Promise<T[]> {
    return this.repository.find();
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number, data: DeepPartial<T>): Promise<T> {
    await this.repository.update(id, data as any);
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}

// Implementation
@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  async findWithPosts(userId: number): Promise<User | null> {
    return this.repository.findOne({
      where: { id: userId },
      relations: ['posts'],
    });
  }
}
```

## Strategy Pattern

### Payment Strategy
```typescript
// Strategy interface
export interface PaymentStrategy {
  processPayment(amount: number, details: any): Promise<PaymentResult>;
}

// Concrete strategies
@Injectable()
export class StripePaymentStrategy implements PaymentStrategy {
  async processPayment(amount: number, details: any): Promise<PaymentResult> {
    // Stripe implementation
    return { success: true, transactionId: 'stripe_xxx' };
  }
}

@Injectable()
export class PayPalPaymentStrategy implements PaymentStrategy {
  async processPayment(amount: number, details: any): Promise<PaymentResult> {
    // PayPal implementation
    return { success: true, transactionId: 'paypal_xxx' };
  }
}

// Strategy factory
@Injectable()
export class PaymentStrategyFactory {
  constructor(
    private readonly stripeStrategy: StripePaymentStrategy,
    private readonly paypalStrategy: PayPalPaymentStrategy,
  ) {}

  getStrategy(type: PaymentType): PaymentStrategy {
    switch (type) {
      case PaymentType.STRIPE:
        return this.stripeStrategy;
      case PaymentType.PAYPAL:
        return this.paypalStrategy;
      default:
        throw new Error(`Unknown payment type: ${type}`);
    }
  }
}

// Usage
@Injectable()
export class PaymentsService {
  constructor(private readonly strategyFactory: PaymentStrategyFactory) {}

  async processPayment(type: PaymentType, amount: number, details: any) {
    const strategy = this.strategyFactory.getStrategy(type);
    return strategy.processPayment(amount, details);
  }
}
```

## Decorator Pattern

### Custom Parameter Decorator
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    return data ? user?.[data] : user;
  },
);

// Usage
@Get('me')
getProfile(@CurrentUser() user: User) {
  return user;
}

@Get('email')
getEmail(@CurrentUser('email') email: string) {
  return { email };
}
```

### Method Decorator for Caching
```typescript
export function Cacheable(key: string, ttl: number = 60) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheService = this.cacheService;
      const cacheKey = `${key}:${JSON.stringify(args)}`;

      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      await cacheService.set(cacheKey, result, ttl);
      return result;
    };

    return descriptor;
  };
}

// Usage
@Injectable()
export class ProductsService {
  constructor(private readonly cacheService: CacheService) {}

  @Cacheable('products', 300)
  async findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }
}
```

### Composed Decorators
```typescript
import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

// Usage
@Auth(Role.Admin)
@Get('admin')
getAdminData() {
  return this.adminService.getData();
}
```

## Observer Pattern (Event-Driven)

### Event Emitter
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';

// Events
export class UserCreatedEvent {
  constructor(public readonly user: User) {}
}

export class UserUpdatedEvent {
  constructor(
    public readonly userId: number,
    public readonly changes: Partial<User>,
  ) {}
}

// Publisher
@Injectable()
export class UsersService {
  constructor(private eventEmitter: EventEmitter2) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = await this.usersRepository.save(dto);
    this.eventEmitter.emit('user.created', new UserCreatedEvent(user));
    return user;
  }
}

// Subscribers
@Injectable()
export class UserEventSubscriber {
  private readonly logger = new Logger(UserEventSubscriber.name);

  @OnEvent('user.created')
  async handleUserCreated(event: UserCreatedEvent) {
    this.logger.log(`User created: ${event.user.id}`);
    await this.sendWelcomeEmail(event.user);
  }

  @OnEvent('user.created', { async: true })
  async handleUserAnalytics(event: UserCreatedEvent) {
    await this.analyticsService.trackSignup(event.user);
  }
}
```

## Specification Pattern

### Query Specifications
```typescript
export interface Specification<T> {
  isSatisfiedBy(item: T): boolean;
  toQuery(queryBuilder: SelectQueryBuilder<T>): SelectQueryBuilder<T>;
}

export class AndSpecification<T> implements Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {}

  isSatisfiedBy(item: T): boolean {
    return this.left.isSatisfiedBy(item) && this.right.isSatisfiedBy(item);
  }

  toQuery(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    return this.right.toQuery(this.left.toQuery(qb));
  }
}

// Concrete specifications
export class ActiveUserSpec implements Specification<User> {
  isSatisfiedBy(user: User): boolean {
    return user.isActive === true;
  }

  toQuery(qb: SelectQueryBuilder<User>): SelectQueryBuilder<User> {
    return qb.andWhere('user.isActive = :active', { active: true });
  }
}

export class RoleSpec implements Specification<User> {
  constructor(private readonly role: string) {}

  isSatisfiedBy(user: User): boolean {
    return user.role === this.role;
  }

  toQuery(qb: SelectQueryBuilder<User>): SelectQueryBuilder<User> {
    return qb.andWhere('user.role = :role', { role: this.role });
  }
}

// Usage
const spec = new AndSpecification(
  new ActiveUserSpec(),
  new RoleSpec('admin'),
);

const query = this.usersRepository.createQueryBuilder('user');
const users = await spec.toQuery(query).getMany();
```

## Builder Pattern

### Query Builder Service
```typescript
@Injectable()
export class ProductQueryBuilder {
  private query: SelectQueryBuilder<Product>;

  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>,
  ) {}

  init(): this {
    this.query = this.repository.createQueryBuilder('product');
    return this;
  }

  withCategory(categoryId: number): this {
    this.query.andWhere('product.categoryId = :categoryId', { categoryId });
    return this;
  }

  withPriceRange(min?: number, max?: number): this {
    if (min) {
      this.query.andWhere('product.price >= :min', { min });
    }
    if (max) {
      this.query.andWhere('product.price <= :max', { max });
    }
    return this;
  }

  inStock(): this {
    this.query.andWhere('product.stock > 0');
    return this;
  }

  orderBy(field: string, order: 'ASC' | 'DESC' = 'ASC'): this {
    this.query.orderBy(`product.${field}`, order);
    return this;
  }

  paginate(page: number, limit: number): this {
    this.query.skip((page - 1) * limit).take(limit);
    return this;
  }

  async execute(): Promise<[Product[], number]> {
    return this.query.getManyAndCount();
  }
}

// Usage
const [products, total] = await this.queryBuilder
  .init()
  .withCategory(5)
  .withPriceRange(10, 100)
  .inStock()
  .orderBy('price', 'DESC')
  .paginate(1, 20)
  .execute();
```

## Unit of Work Pattern

```typescript
@Injectable()
export class UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await work(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

// Usage
@Injectable()
export class OrdersService {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    return this.unitOfWork.transaction(async (manager) => {
      // Create order
      const order = manager.create(Order, dto);
      await manager.save(order);

      // Update inventory
      for (const item of dto.items) {
        await manager.decrement(
          Product,
          { id: item.productId },
          'stock',
          item.quantity,
        );
      }

      // Create payment
      const payment = manager.create(Payment, {
        orderId: order.id,
        amount: order.total,
      });
      await manager.save(payment);

      return order;
    });
  }
}
```

## Saga Pattern for Distributed Transactions

```typescript
@Injectable()
export class OrderSaga {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async execute(dto: CreateOrderDto): Promise<Order> {
    let order: Order;
    let payment: Payment;
    let inventoryReserved = false;

    try {
      // Step 1: Create order
      order = await this.ordersService.create(dto);

      // Step 2: Reserve inventory
      await this.inventoryService.reserve(order.items);
      inventoryReserved = true;

      // Step 3: Process payment
      payment = await this.paymentsService.process(order.id, order.total);

      // Step 4: Confirm order
      order = await this.ordersService.confirm(order.id);

      // Step 5: Send notification
      await this.notificationsService.sendOrderConfirmation(order);

      return order;
    } catch (error) {
      // Compensating transactions (rollback)
      if (payment) {
        await this.paymentsService.refund(payment.id);
      }
      if (inventoryReserved) {
        await this.inventoryService.release(order.items);
      }
      if (order) {
        await this.ordersService.cancel(order.id);
      }
      throw error;
    }
  }
}
```
