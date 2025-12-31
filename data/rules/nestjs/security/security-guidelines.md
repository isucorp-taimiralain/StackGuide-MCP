# NestJS Security Guidelines

## Authentication

### JWT Strategy Implementation
```typescript
// auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; email: string }) {
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

### Password Hashing
```typescript
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

### Refresh Token Pattern
```typescript
@Injectable()
export class AuthService {
  async generateTokens(user: User) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' },
      ),
      this.jwtService.signAsync(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' },
      ),
    ]);

    // Store refresh token hash in database
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: number, refreshToken: string) {
    const user = await this.usersService.findOne(userId);
    
    if (!user?.refreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const tokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!tokenMatches) {
      throw new ForbiddenException('Access Denied');
    }

    return this.generateTokens(user);
  }
}
```

## Input Validation and Sanitization

### Strict DTO Validation
```typescript
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(32)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value.trim())
  name: string;
}
```

### SQL Injection Prevention
```typescript
// ❌ NEVER do this - SQL injection vulnerable
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Use TypeORM with parameterized queries
const user = await this.usersRepository.findOne({
  where: { email },
});

// ✅ Safe QueryBuilder usage
const users = await this.usersRepository
  .createQueryBuilder('user')
  .where('user.email = :email', { email })
  .andWhere('user.role IN (:...roles)', { roles: ['admin', 'user'] })
  .getMany();

// ✅ Raw query with parameters
const result = await this.dataSource.query(
  'SELECT * FROM users WHERE email = $1',
  [email],
);
```

## Rate Limiting

### Throttler Configuration
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,    // 1 second
        limit: 3,     // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000,   // 10 seconds
        limit: 20,    // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000,   // 1 minute
        limit: 100,   // 100 requests per minute
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// Custom throttle per route
@Throttle({ short: { limit: 1, ttl: 1000 } })
@Post('login')
login() {
  // Limited to 1 request per second
}

// Skip throttling
@SkipThrottle()
@Get('public')
getPublic() {}
```

## CORS Configuration

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: [
      'https://yourdomain.com',
      'https://app.yourdomain.com',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 3600,
  });
  
  await app.listen(3000);
}
```

## Helmet Security Headers

```typescript
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  }));
  
  await app.listen(3000);
}
```

## CSRF Protection

```typescript
import * as csurf from 'csurf';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Only for session-based auth, not needed for JWT
  app.use(csurf({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    },
  }));
  
  await app.listen(3000);
}
```

## Data Exposure Prevention

### Entity Serialization
```typescript
import { Exclude, Expose } from 'class-transformer';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  @Exclude() // Never expose password
  password: string;

  @Column()
  @Exclude() // Never expose refresh token
  refreshToken: string;

  @Column()
  role: string;
}

// Apply transformation globally
import { ClassSerializerInterceptor } from '@nestjs/common';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule {}
```

### Response DTOs
```typescript
// Create separate response DTOs
export class UserResponseDto {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  // Exclude: password, refreshToken, internal fields
}

@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: number): Promise<UserResponseDto> {
    const user = await this.usersService.findOne(id);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}
```

## Environment Security

```typescript
// Validate environment variables at startup
import { plainToClass } from 'class-transformer';
import { IsString, IsNumber, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsNumber()
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  JWT_SECRET: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

// Use in ConfigModule
ConfigModule.forRoot({
  validate,
});
```

## File Upload Security

```typescript
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        // Generate random filename
        const randomName = Array(32)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        cb(null, `${randomName}${extname(file.originalname)}`);
      },
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_TYPES.includes(file.mimetype)) {
        cb(new BadRequestException('Invalid file type'), false);
        return;
      }
      cb(null, true);
    },
  }),
)
uploadFile(@UploadedFile() file: Express.Multer.File) {
  return { filename: file.filename };
}
```

## Logging Security Events

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SecurityLogger {
  private readonly logger = new Logger('Security');

  logLoginAttempt(email: string, success: boolean, ip: string) {
    this.logger.log({
      event: 'LOGIN_ATTEMPT',
      email,
      success,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  logSuspiciousActivity(type: string, details: any, userId?: number) {
    this.logger.warn({
      event: 'SUSPICIOUS_ACTIVITY',
      type,
      userId,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  logSecurityBreach(type: string, details: any) {
    this.logger.error({
      event: 'SECURITY_BREACH',
      type,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
```
