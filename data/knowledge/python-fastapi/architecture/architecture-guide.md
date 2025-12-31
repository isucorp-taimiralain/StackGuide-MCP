# FastAPI Architecture Guide

## Application Architecture

### Layered Architecture
```
┌─────────────────────────────────────┐
│         Presentation Layer          │
│    (Routers, Endpoints, Schemas)    │
├─────────────────────────────────────┤
│          Service Layer              │
│      (Business Logic, Use Cases)    │
├─────────────────────────────────────┤
│         Repository Layer            │
│       (Data Access, CRUD)           │
├─────────────────────────────────────┤
│          Database Layer             │
│    (SQLAlchemy, PostgreSQL, etc)    │
└─────────────────────────────────────┘
```

### Request Flow
```
HTTP Request
    ↓
Middleware (CORS, Logging, Auth)
    ↓
Router (Path matching)
    ↓
Dependencies (DB, Auth, Validation)
    ↓
Endpoint Function
    ↓
Service Layer
    ↓
Repository/CRUD Layer
    ↓
Database
    ↓
Response Serialization (Pydantic)
    ↓
HTTP Response
```

## Project Organization

### Feature-Based Structure
```
src/
├── main.py
├── config.py
├── database.py
├── features/
│   ├── users/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── models.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── dependencies.py
│   ├── orders/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── models.py
│   │   ├── service.py
│   │   └── repository.py
│   └── auth/
│       ├── __init__.py
│       ├── router.py
│       ├── schemas.py
│       ├── service.py
│       └── utils.py
├── core/
│   ├── security.py
│   ├── exceptions.py
│   └── middleware.py
└── shared/
    ├── schemas.py
    └── utils.py
```

### Layer Implementation

#### Repository Layer
```python
# features/users/repository.py
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from .models import User
from .schemas import UserCreate, UserUpdate

class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        filters: dict = None,
    ) -> Tuple[List[User], int]:
        query = select(User)
        
        if filters:
            if filters.get("is_active") is not None:
                query = query.where(User.is_active == filters["is_active"])
        
        # Count
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()
        
        # Items
        result = await self.db.execute(
            query.offset(skip).limit(limit)
        )
        items = list(result.scalars().all())
        
        return items, total

    async def create(self, data: UserCreate, hashed_password: str) -> User:
        user = User(
            email=data.email,
            name=data.name,
            hashed_password=hashed_password,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update(self, user: User, data: UserUpdate) -> User:
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def delete(self, user: User) -> None:
        await self.db.delete(user)
        await self.db.commit()
```

#### Service Layer
```python
# features/users/service.py
from typing import Optional, List, Tuple
from fastapi import HTTPException, status

from .repository import UserRepository
from .schemas import UserCreate, UserUpdate, UserFilters
from .models import User
from core.security import get_password_hash, verify_password

class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    async def get_user(self, user_id: int) -> User:
        user = await self.repository.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        return user

    async def list_users(
        self,
        skip: int = 0,
        limit: int = 100,
        filters: UserFilters = None,
    ) -> Tuple[List[User], int]:
        return await self.repository.list(
            skip=skip,
            limit=limit,
            filters=filters.model_dump() if filters else None,
        )

    async def create_user(self, data: UserCreate) -> User:
        # Check uniqueness
        existing = await self.repository.get_by_email(data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        
        # Hash password
        hashed_password = get_password_hash(data.password)
        
        return await self.repository.create(data, hashed_password)

    async def update_user(self, user_id: int, data: UserUpdate) -> User:
        user = await self.get_user(user_id)
        
        # Check email uniqueness if changing
        if data.email and data.email != user.email:
            existing = await self.repository.get_by_email(data.email)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered",
                )
        
        return await self.repository.update(user, data)

    async def delete_user(self, user_id: int) -> None:
        user = await self.get_user(user_id)
        await self.repository.delete(user)

    async def authenticate(self, email: str, password: str) -> Optional[User]:
        user = await self.repository.get_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user
```

#### Dependency Injection
```python
# features/users/dependencies.py
from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from .repository import UserRepository
from .service import UserService

async def get_user_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRepository:
    return UserRepository(db)

async def get_user_service(
    repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> UserService:
    return UserService(repository)
```

#### Router/Endpoint Layer
```python
# features/users/router.py
from typing import Annotated
from fastapi import APIRouter, Depends, Query, status

from .schemas import UserCreate, UserUpdate, UserResponse, UserListResponse
from .service import UserService
from .dependencies import get_user_service
from core.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    service: Annotated[UserService, Depends(get_user_service)],
):
    user = await service.create_user(data)
    return user

@router.get("/", response_model=UserListResponse)
async def list_users(
    service: Annotated[UserService, Depends(get_user_service)],
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    users, total = await service.list_users(skip=skip, limit=limit)
    return UserListResponse(items=users, total=total)

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Annotated[User, Depends(get_current_user)],
):
    return current_user

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    service: Annotated[UserService, Depends(get_user_service)],
):
    return await service.get_user(user_id)
```

## Database Architecture

### Async SQLAlchemy Setup
```python
# database.py
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase

from config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=5,
    max_overflow=10,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        yield session
```

### Migrations with Alembic
```python
# alembic/env.py
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
import asyncio

from app.database import Base
from app.config import settings

# Import all models for autogenerate
from app.features.users.models import User
from app.features.orders.models import Order

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

def run_migrations_offline():
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

## Event-Driven Architecture

### Background Tasks and Events
```python
# core/events.py
from typing import Callable, Dict, List
from collections import defaultdict
import asyncio

class EventBus:
    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Callable):
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Callable):
        self._handlers[event_type].remove(handler)

    async def publish(self, event_type: str, data: dict):
        handlers = self._handlers.get(event_type, [])
        await asyncio.gather(
            *(handler(data) for handler in handlers),
            return_exceptions=True,
        )

event_bus = EventBus()

# Event handlers
async def handle_user_created(data: dict):
    user_id = data["user_id"]
    await send_welcome_email(user_id)
    await create_default_settings(user_id)

async def handle_order_completed(data: dict):
    await send_order_confirmation(data["order_id"])
    await update_inventory(data["items"])

# Register handlers
event_bus.subscribe("user.created", handle_user_created)
event_bus.subscribe("order.completed", handle_order_completed)

# Usage in service
class UserService:
    async def create_user(self, data: UserCreate) -> User:
        user = await self.repository.create(data)
        await event_bus.publish("user.created", {"user_id": user.id})
        return user
```

### Task Queue with Celery
```python
# tasks/celery_app.py
from celery import Celery

celery_app = Celery(
    "tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# tasks/email_tasks.py
from .celery_app import celery_app

@celery_app.task
def send_email_task(to: str, subject: str, body: str):
    # Send email logic
    pass

@celery_app.task
def generate_report_task(user_id: int, report_type: str):
    # Generate report logic
    pass

# Usage
from tasks.email_tasks import send_email_task

send_email_task.delay("user@example.com", "Welcome", "Hello!")
```

## Caching Architecture

### Multi-Level Caching
```python
# core/cache.py
from typing import Optional, Any, Callable
from functools import wraps
import redis.asyncio as redis
import json
import hashlib

class CacheService:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)
        self._local_cache: dict = {}

    async def get(self, key: str) -> Optional[Any]:
        # L1: Local cache
        if key in self._local_cache:
            return self._local_cache[key]
        
        # L2: Redis
        value = await self.redis.get(key)
        if value:
            parsed = json.loads(value)
            self._local_cache[key] = parsed
            return parsed
        
        return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int = 300,
    ) -> None:
        serialized = json.dumps(value, default=str)
        await self.redis.setex(key, ttl, serialized)
        self._local_cache[key] = value

    async def delete(self, key: str) -> None:
        await self.redis.delete(key)
        self._local_cache.pop(key, None)

    async def invalidate_pattern(self, pattern: str) -> None:
        keys = await self.redis.keys(pattern)
        if keys:
            await self.redis.delete(*keys)
        # Clear local cache matching pattern
        self._local_cache = {
            k: v for k, v in self._local_cache.items()
            if not k.startswith(pattern.rstrip("*"))
        }

cache = CacheService(settings.REDIS_URL)

# Decorator
def cached(prefix: str, ttl: int = 300):
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key_data = f"{args}:{kwargs}"
            key_hash = hashlib.md5(key_data.encode()).hexdigest()
            cache_key = f"{prefix}:{key_hash}"
            
            # Try cache
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Execute and cache
            result = await func(*args, **kwargs)
            await cache.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator

# Usage
@cached("users", ttl=300)
async def get_user_by_id(user_id: int) -> dict:
    user = await repository.get_by_id(user_id)
    return user.to_dict()
```

## Configuration Management

```python
# config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # App
    APP_NAME: str = "FastAPI App"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    
    # API
    API_V1_PREFIX: str = "/api/v1"
    
    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 5
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # Security
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
```
