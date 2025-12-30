# Node.js Architecture Patterns

Recommended architecture patterns for scalable Node.js applications.

## Clean Architecture

```
┌─────────────────────────────────────┐
│           Presentation              │
│    (Controllers, Routes, DTOs)      │
├─────────────────────────────────────┤
│            Application              │
│      (Use Cases, Services)          │
├─────────────────────────────────────┤
│             Domain                  │
│   (Entities, Business Rules)        │
├─────────────────────────────────────┤
│          Infrastructure             │
│  (Database, External APIs, etc.)    │
└─────────────────────────────────────┘
```

## Service Layer Pattern

```typescript
// services/UserService.ts
import { User } from '../entities/User';
import { IUserRepository } from '../repositories/IUserRepository';
import { CreateUserDTO, UpdateUserDTO } from '../dtos/UserDTO';
import { NotFoundError, ValidationError } from '../errors';

export class UserService {
  constructor(
    private userRepository: IUserRepository,
    private emailService: EmailService
  ) {}

  async createUser(dto: CreateUserDTO): Promise<User> {
    // Business validation
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ValidationError('Email already registered');
    }

    // Create entity
    const user = User.create({
      email: dto.email,
      password: await this.hashPassword(dto.password),
      name: dto.name
    });

    // Persist
    const saved = await this.userRepository.save(user);

    // Side effects
    await this.emailService.sendWelcome(saved.email);

    return saved;
  }

  async getById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User');
    }
    return user;
  }
}
```

## Repository Pattern

```typescript
// repositories/IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(options?: FindOptions): Promise<User[]>;
  save(user: User): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
}

// repositories/PrismaUserRepository.ts
import { PrismaClient } from '@prisma/client';

export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { id } });
    return data ? User.fromPersistence(data) : null;
  }

  async save(user: User): Promise<User> {
    const data = await this.prisma.user.create({
      data: user.toPersistence()
    });
    return User.fromPersistence(data);
  }
}
```

## Dependency Injection

```typescript
// container.ts
import { Container } from 'inversify';

const container = new Container();

// Repositories
container.bind<IUserRepository>('UserRepository')
  .to(PrismaUserRepository)
  .inSingletonScope();

// Services
container.bind<UserService>('UserService')
  .toDynamicValue((context) => {
    const repo = context.container.get<IUserRepository>('UserRepository');
    const email = context.container.get<EmailService>('EmailService');
    return new UserService(repo, email);
  });

export { container };

// Usage in controller
@injectable()
export class UserController {
  constructor(
    @inject('UserService') private userService: UserService
  ) {}
}
```

## CQRS (Command Query Responsibility Segregation)

```typescript
// commands/CreateUserCommand.ts
export class CreateUserCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly name: string
  ) {}
}

// handlers/CreateUserHandler.ts
export class CreateUserHandler {
  constructor(private userRepo: IUserRepository) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const user = User.create(command);
    await this.userRepo.save(user);
    return user.id;
  }
}

// queries/GetUserQuery.ts
export class GetUserQuery {
  constructor(public readonly userId: string) {}
}

// handlers/GetUserHandler.ts
export class GetUserHandler {
  constructor(private readRepo: IUserReadRepository) {}

  async execute(query: GetUserQuery): Promise<UserDTO> {
    return this.readRepo.getUserView(query.userId);
  }
}

// CommandBus
export class CommandBus {
  private handlers = new Map<string, any>();

  register(commandName: string, handler: any) {
    this.handlers.set(commandName, handler);
  }

  async execute<T>(command: any): Promise<T> {
    const handler = this.handlers.get(command.constructor.name);
    return handler.execute(command);
  }
}
```

## Event-Driven Architecture

```typescript
// events/UserCreatedEvent.ts
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly createdAt: Date
  ) {}
}

// EventBus
export class EventBus {
  private handlers = new Map<string, Function[]>();

  subscribe(eventName: string, handler: Function) {
    const existing = this.handlers.get(eventName) || [];
    this.handlers.set(eventName, [...existing, handler]);
  }

  publish(event: any) {
    const handlers = this.handlers.get(event.constructor.name) || [];
    handlers.forEach(handler => handler(event));
  }
}

// Usage
eventBus.subscribe('UserCreatedEvent', async (event: UserCreatedEvent) => {
  await emailService.sendWelcome(event.email);
});

eventBus.subscribe('UserCreatedEvent', async (event: UserCreatedEvent) => {
  await analyticsService.trackSignup(event.userId);
});
```

## Middleware Pipeline

```typescript
// middleware/Pipeline.ts
type Middleware<T> = (context: T, next: () => Promise<void>) => Promise<void>;

export class Pipeline<T> {
  private middlewares: Middleware<T>[] = [];

  use(middleware: Middleware<T>): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(context: T): Promise<void> {
    const dispatch = async (index: number): Promise<void> => {
      if (index >= this.middlewares.length) return;
      
      const middleware = this.middlewares[index];
      await middleware(context, () => dispatch(index + 1));
    };

    await dispatch(0);
  }
}

// Usage
const pipeline = new Pipeline<RequestContext>()
  .use(loggingMiddleware)
  .use(authenticationMiddleware)
  .use(validationMiddleware)
  .use(handlerMiddleware);
```
