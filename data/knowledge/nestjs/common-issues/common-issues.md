# NestJS Common Issues and Solutions

## Dependency Injection Issues

### Circular Dependency
**Error:** `Nest cannot create the X instance. The module at index [0] is undefined.`

```typescript
// ❌ Problem: Circular dependency between services
@Injectable()
export class UsersService {
  constructor(private authService: AuthService) {}
}

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {} // Circular!
}

// ✅ Solution 1: Use forwardRef
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {}
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}
}

// ✅ Solution 2: Extract shared logic to a third service
@Injectable()
export class UserAuthHelper {
  // Shared logic here
}

// ✅ Solution 3: Use ModuleRef for lazy resolution
@Injectable()
export class UsersService implements OnModuleInit {
  private authService: AuthService;

  constructor(private moduleRef: ModuleRef) {}

  onModuleInit() {
    this.authService = this.moduleRef.get(AuthService, { strict: false });
  }
}
```

### Provider Not Found
**Error:** `Nest can't resolve dependencies of the X (?). Please make sure that the argument Y at index [0] is available.`

```typescript
// ❌ Problem: Missing provider
@Module({
  controllers: [UsersController],
  providers: [UsersService], // Missing UsersRepository
})
export class UsersModule {}

// ✅ Solution: Add missing provider or import module
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
```

### Provider Not Exported
**Error:** Dependency from another module not accessible

```typescript
// ❌ Problem: Using provider from another module without export
@Module({
  providers: [SharedService],
  // Missing exports
})
export class SharedModule {}

// ✅ Solution: Export the provider
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

// And import the module where needed
@Module({
  imports: [SharedModule],
})
export class UsersModule {}
```

## Validation Issues

### DTO Properties Not Being Validated
```typescript
// ❌ Problem: Validation decorators not working
class CreateUserDto {
  email: string;  // Missing decorators
  password: string;
}

// ✅ Solution: Add validation decorators
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// Also ensure ValidationPipe is configured
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  transform: true,
}));
```

### Nested Object Validation
```typescript
// ❌ Problem: Nested objects not validated
class CreateOrderDto {
  @IsArray()
  items: OrderItemDto[];  // Not validating item properties
}

// ✅ Solution: Use @ValidateNested and @Type
import { ValidateNested, Type } from 'class-transformer';

class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

## TypeORM Issues

### Entity Metadata Not Found
**Error:** `EntityMetadataNotFoundError: No metadata for "User" was found.`

```typescript
// ❌ Problem: Entity not registered
TypeOrmModule.forRoot({
  // Missing entities
})

// ✅ Solution: Register entities
TypeOrmModule.forRoot({
  entities: [User, Post, Comment],
  // Or use autoLoadEntities
  autoLoadEntities: true,
})

// And ensure entity is registered in feature module
@Module({
  imports: [TypeOrmModule.forFeature([User])],
})
export class UsersModule {}
```

### Relation Not Loading
```typescript
// ❌ Problem: Relations not included in query
const user = await this.usersRepository.findOne({
  where: { id: userId },
});
console.log(user.posts); // undefined

// ✅ Solution 1: Specify relations
const user = await this.usersRepository.findOne({
  where: { id: userId },
  relations: ['posts', 'posts.comments'],
});

// ✅ Solution 2: Use QueryBuilder
const user = await this.usersRepository
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.posts', 'posts')
  .leftJoinAndSelect('posts.comments', 'comments')
  .where('user.id = :id', { id: userId })
  .getOne();

// ✅ Solution 3: Eager loading in entity (use sparingly)
@Entity()
export class User {
  @OneToMany(() => Post, (post) => post.user, { eager: true })
  posts: Post[];
}
```

### N+1 Query Problem
```typescript
// ❌ Problem: Multiple queries for relations
const users = await this.usersRepository.find();
for (const user of users) {
  const posts = await this.postsRepository.find({
    where: { userId: user.id },
  }); // N additional queries!
}

// ✅ Solution: Load relations in single query
const users = await this.usersRepository.find({
  relations: ['posts'],
});
```

## Authentication Issues

### JWT Token Not Being Extracted
```typescript
// ❌ Problem: Token not extracted from header
// Request: Authorization: <token>

// ✅ Solution: Ensure correct format
// Request: Authorization: Bearer <token>

// Or configure custom extractor
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Or custom:
      // jwtFromRequest: (req) => req.cookies?.access_token,
    });
  }
}
```

### Guard Not Applying to All Routes
```typescript
// ❌ Problem: Some routes not protected
@Controller('users')
export class UsersController {
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {} // Protected

  @Get(':id')
  findOne() {} // Not protected!
}

// ✅ Solution 1: Apply guard at controller level
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get()
  findAll() {}

  @Get(':id')
  findOne() {}
}

// ✅ Solution 2: Global guard with public routes
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  @Public() // Custom decorator to skip auth
  @Get('public')
  getPublicData() {}
}
```

## CORS Issues

### CORS Errors in Browser
```typescript
// ❌ Problem: CORS not configured
const app = await NestFactory.create(AppModule);

// ✅ Solution: Enable CORS
const app = await NestFactory.create(AppModule);
app.enableCors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
});
```

## Error Handling Issues

### Unhandled Promise Rejection
```typescript
// ❌ Problem: Async errors not caught
@Get(':id')
async findOne(@Param('id') id: number) {
  const user = await this.usersService.findOne(id);
  // If findOne throws, error not handled properly
}

// ✅ Solution: Throw HTTP exceptions
@Injectable()
export class UsersService {
  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }
}

// ✅ Also add global exception filter
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Handle all exceptions
  }
}
```

## Performance Issues

### Slow Startup Time
```typescript
// ❌ Problem: Heavy operations in module initialization
@Module({})
export class AppModule implements OnModuleInit {
  async onModuleInit() {
    await this.loadLargeDataset(); // Blocks startup
  }
}

// ✅ Solution: Defer heavy operations
@Module({})
export class AppModule implements OnModuleInit {
  onModuleInit() {
    // Don't await, let it run in background
    this.loadLargeDataset().catch(console.error);
  }
}

// Or use lazy loading for modules
@Module({
  imports: [
    // Lazy loaded module
    import('./heavy.module').then((m) => m.HeavyModule),
  ],
})
```

### Memory Leaks
```typescript
// ❌ Problem: Subscriptions not cleaned up
@Injectable()
export class EventService implements OnModuleInit {
  private subscription: Subscription;

  onModuleInit() {
    this.subscription = this.eventSource$.subscribe();
  }
  // Missing cleanup!
}

// ✅ Solution: Implement OnModuleDestroy
@Injectable()
export class EventService implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription;

  onModuleInit() {
    this.subscription = this.eventSource$.subscribe();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }
}
```

## Testing Issues

### Cannot Resolve Dependencies in Tests
```typescript
// ❌ Problem: Missing mocks for dependencies
describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService],
      // Missing repository mock
    }).compile();
  });
});

// ✅ Solution: Provide all dependencies or mocks
describe('UsersService', () => {
  let service: UsersService;
  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });
});
```

## Microservices Issues

### Message Pattern Not Matched
```typescript
// ❌ Problem: Pattern mismatch
// Client
this.client.send('getUser', { id: 1 }); // String pattern

// Server
@MessagePattern({ cmd: 'getUser' }) // Object pattern
handleGetUser() {}

// ✅ Solution: Match patterns exactly
// Client
this.client.send({ cmd: 'getUser' }, { id: 1 });

// Server
@MessagePattern({ cmd: 'getUser' })
handleGetUser(@Payload() data: { id: number }) {}
```

### Connection Timeout
```typescript
// ✅ Solution: Configure retry and timeout
ClientsModule.register([
  {
    name: 'SERVICE',
    transport: Transport.TCP,
    options: {
      host: 'localhost',
      port: 3001,
      retryAttempts: 5,
      retryDelay: 1000,
    },
  },
]);
```

## Swagger/OpenAPI Issues

### Missing API Documentation
```typescript
// ❌ Problem: Endpoints not documented
@Post()
create(@Body() dto: CreateUserDto) {}

// ✅ Solution: Add Swagger decorators
@Post()
@ApiOperation({ summary: 'Create a new user' })
@ApiResponse({ status: 201, description: 'User created', type: UserResponseDto })
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiBody({ type: CreateUserDto })
create(@Body() dto: CreateUserDto) {}

// And add decorators to DTOs
export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  @IsEmail()
  email: string;
}
```
