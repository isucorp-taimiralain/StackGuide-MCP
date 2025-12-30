# Node.js Coding Standards

Follow these coding standards when developing Node.js applications.

## Project Structure

```
src/
├── config/              # Configuration files
│   ├── index.ts
│   └── database.ts
├── controllers/         # Request handlers
├── services/            # Business logic
├── repositories/        # Data access layer
├── models/              # Data models/entities
├── middlewares/         # Express middlewares
├── routes/              # Route definitions
├── utils/               # Utility functions
├── types/               # TypeScript types
├── validators/          # Request validation
└── app.ts              # Application entry
```

## Naming Conventions

- **Files**: camelCase or kebab-case (e.g., `userService.ts` or `user-service.ts`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions/Variables**: camelCase (e.g., `getUserById`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces**: PascalCase (e.g., `IUserRepository`)

## Error Handling

### Custom Error Classes

```typescript
// errors/AppError.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public errors?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

### Error Middleware

```typescript
// middlewares/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      ...(err.errors && { errors: err.errors })
    });
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);
  
  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
};
```

## Async Handling

### Async Wrapper

```typescript
// utils/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Usage
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json(user);
}));
```

## Configuration

### Environment Variables

```typescript
// config/index.ts
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
```

## Logging

### Structured Logging

```typescript
// utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty' } 
    : undefined,
  base: {
    pid: process.pid,
    env: process.env.NODE_ENV,
  },
});

// Usage
logger.info({ userId: user.id }, 'User logged in');
logger.error({ err, requestId }, 'Failed to process request');
```

## Import Order

1. Node.js built-in modules
2. External dependencies
3. Internal modules
4. Relative imports
5. Types (if separate)

```typescript
import { readFile } from 'fs/promises';
import path from 'path';

import express from 'express';
import { z } from 'zod';

import { config } from '@/config';
import { logger } from '@/utils/logger';

import { UserService } from './userService';
import { validateUser } from './validators';

import type { User, CreateUserDTO } from './types';
```
