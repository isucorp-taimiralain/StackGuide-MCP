# NestJS Architecture Guide

## Core Architecture Principles

### Modular Architecture
NestJS follows a modular architecture pattern where features are organized into self-contained modules.

```
Application
├── AppModule (Root)
│   ├── CoreModule (Global services)
│   ├── SharedModule (Reusable components)
│   ├── ConfigModule (Configuration)
│   └── Feature Modules
│       ├── UsersModule
│       ├── AuthModule
│       ├── ProductsModule
│       └── OrdersModule
```

### Module Types

#### Feature Module
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService],
})
export class ProductsModule {}
```

#### Shared Module
```typescript
@Module({
  imports: [HttpModule],
  providers: [UtilsService, NotificationService],
  exports: [UtilsService, NotificationService, HttpModule],
})
export class SharedModule {}
```

#### Core Module (Singleton Services)
```typescript
@Global()
@Module({
  providers: [
    ConfigService,
    LoggerService,
    CacheService,
  ],
  exports: [
    ConfigService,
    LoggerService,
    CacheService,
  ],
})
export class CoreModule {}
```

#### Dynamic Module
```typescript
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }

  static forFeature(entities: any[]): DynamicModule {
    const providers = entities.map((entity) => ({
      provide: `${entity.name}Repository`,
      useFactory: (db: DatabaseService) => db.getRepository(entity),
      inject: [DatabaseService],
    }));

    return {
      module: DatabaseModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  }
}
```

## Layered Architecture

### Request Flow
```
HTTP Request
    ↓
Middleware (Logging, CORS)
    ↓
Guards (Authentication, Authorization)
    ↓
Interceptors (Transform, Cache)
    ↓
Pipes (Validation, Transformation)
    ↓
Controller (Route handling)
    ↓
Service (Business logic)
    ↓
Repository (Data access)
    ↓
Database
```

### Layer Responsibilities

#### Controllers Layer
```typescript
@Controller('products')
@UseGuards(JwtAuthGuard)
@ApiTags('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles('admin')
  @UseGuards(RolesGuard)
  async create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    const product = await this.productsService.create(dto);
    return plainToInstance(ProductResponseDto, product);
  }
}
```

#### Services Layer
```typescript
@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesService: CategoriesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    // Business logic
    await this.validateCategory(dto.categoryId);
    
    const product = await this.productsRepository.create(dto);
    
    // Domain events
    this.eventEmitter.emit('product.created', product);
    
    return product;
  }
}
```

#### Repository Layer
```typescript
@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>,
  ) {}

  async findWithFilters(filters: ProductFilters): Promise<[Product[], number]> {
    const query = this.repository.createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category');

    if (filters.categoryId) {
      query.andWhere('product.categoryId = :categoryId', {
        categoryId: filters.categoryId,
      });
    }

    if (filters.minPrice) {
      query.andWhere('product.price >= :minPrice', {
        minPrice: filters.minPrice,
      });
    }

    return query
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();
  }
}
```

## Domain-Driven Design Integration

### Entity and Value Objects
```typescript
// Entity
@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => Money)
  total: Money;

  @Column(() => Address)
  shippingAddress: Address;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  // Domain methods
  addItem(product: Product, quantity: number): void {
    const item = new OrderItem(product, quantity);
    this.items.push(item);
    this.recalculateTotal();
  }

  confirm(): void {
    if (this.items.length === 0) {
      throw new DomainException('Cannot confirm empty order');
    }
    this.status = OrderStatus.CONFIRMED;
  }
}

// Value Object (Embedded)
export class Money {
  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;
}

// Value Object
export class Address {
  @Column()
  street: string;

  @Column()
  city: string;

  @Column()
  country: string;

  @Column()
  postalCode: string;
}
```

### Domain Events
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';

// Event definition
export class OrderConfirmedEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: number,
    public readonly total: number,
  ) {}
}

// Publishing events
@Injectable()
export class OrdersService {
  constructor(private eventEmitter: EventEmitter2) {}

  async confirmOrder(orderId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne(orderId);
    order.confirm();
    await this.ordersRepository.save(order);

    this.eventEmitter.emit(
      'order.confirmed',
      new OrderConfirmedEvent(order.id, order.userId, order.total.amount),
    );

    return order;
  }
}

// Event handler
@Injectable()
export class NotificationHandler {
  @OnEvent('order.confirmed')
  async handleOrderConfirmed(event: OrderConfirmedEvent) {
    await this.notificationService.sendOrderConfirmation(
      event.userId,
      event.orderId,
    );
  }
}
```

## CQRS Pattern

### Commands and Queries Separation
```typescript
// commands/create-order.command.ts
export class CreateOrderCommand {
  constructor(
    public readonly userId: number,
    public readonly items: OrderItemDto[],
    public readonly shippingAddress: AddressDto,
  ) {}
}

// commands/handlers/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    const order = new Order();
    order.userId = command.userId;
    order.shippingAddress = command.shippingAddress;
    
    for (const item of command.items) {
      order.addItem(item.productId, item.quantity);
    }

    const saved = await this.ordersRepository.save(order);
    return saved.id;
  }
}

// queries/get-order.query.ts
export class GetOrderQuery {
  constructor(public readonly orderId: string) {}
}

// queries/handlers/get-order.handler.ts
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async execute(query: GetOrderQuery): Promise<OrderDto> {
    const order = await this.ordersRepository.findWithDetails(query.orderId);
    return plainToInstance(OrderDto, order);
  }
}

// Controller usage
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @User() user: UserEntity) {
    return this.commandBus.execute(
      new CreateOrderCommand(user.id, dto.items, dto.shippingAddress),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetOrderQuery(id));
  }
}
```

## Microservices Architecture

### Service Communication
```typescript
// Microservice setup
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://localhost:5672'],
      queue: 'orders_queue',
      queueOptions: { durable: true },
    },
  },
);

// Message patterns
@Controller()
export class OrdersController {
  @MessagePattern({ cmd: 'create_order' })
  createOrder(@Payload() data: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(data);
  }

  @EventPattern('user_deleted')
  handleUserDeleted(@Payload() data: { userId: number }) {
    return this.ordersService.cancelUserOrders(data.userId);
  }
}

// Client service
@Injectable()
export class OrdersClientService {
  constructor(
    @Inject('ORDERS_SERVICE') private readonly client: ClientProxy,
  ) {}

  createOrder(dto: CreateOrderDto): Observable<Order> {
    return this.client.send({ cmd: 'create_order' }, dto);
  }

  emitUserDeleted(userId: number): void {
    this.client.emit('user_deleted', { userId });
  }
}
```

## Configuration Architecture

### Environment-Based Configuration
```typescript
// config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: process.env.NODE_ENV !== 'production',
}));

// config/jwt.config.ts
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  accessTokenTtl: parseInt(process.env.JWT_ACCESS_TTL, 10) || 900,
  refreshTokenTtl: parseInt(process.env.JWT_REFRESH_TTL, 10) || 604800,
}));

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test'),
        PORT: Joi.number().default(3000),
        DB_HOST: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
      }),
    }),
  ],
})
export class AppModule {}

// Usage
@Injectable()
export class DatabaseService {
  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('database.host');
    const port = this.configService.get<number>('database.port');
  }
}
```

## Health Checks and Monitoring

```typescript
import { TerminusModule, HealthCheckService, HttpHealthIndicator, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.http.pingCheck('api', 'https://api.example.com'),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }

  @Get('live')
  checkLiveness() {
    return { status: 'ok' };
  }
}
```
