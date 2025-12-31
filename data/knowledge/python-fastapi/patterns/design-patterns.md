# FastAPI Design Patterns

## Repository Pattern

### Generic Repository
```python
from typing import TypeVar, Generic, Type, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchema = TypeVar("CreateSchema", bound=BaseModel)
UpdateSchema = TypeVar("UpdateSchema", bound=BaseModel)

class BaseRepository(Generic[ModelType, CreateSchema, UpdateSchema]):
    def __init__(self, model: Type[ModelType], db: AsyncSession):
        self.model = model
        self.db = db

    async def get(self, id: int) -> Optional[ModelType]:
        result = await self.db.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[ModelType]:
        result = await self.db.execute(
            select(self.model).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, schema: CreateSchema) -> ModelType:
        obj = self.model(**schema.model_dump())
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def update(self, id: int, schema: UpdateSchema) -> Optional[ModelType]:
        obj = await self.get(id)
        if obj:
            for key, value in schema.model_dump(exclude_unset=True).items():
                setattr(obj, key, value)
            await self.db.commit()
            await self.db.refresh(obj)
        return obj

    async def delete(self, id: int) -> bool:
        obj = await self.get(id)
        if obj:
            await self.db.delete(obj)
            await self.db.commit()
            return True
        return False

# Concrete implementation
class UserRepository(BaseRepository[User, UserCreate, UserUpdate]):
    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()
```

## Unit of Work Pattern

```python
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager

class UnitOfWork:
    def __init__(self, session_factory):
        self._session_factory = session_factory

    @asynccontextmanager
    async def __call__(self):
        session: AsyncSession = self._session_factory()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# Usage
uow = UnitOfWork(async_session)

async def transfer_funds(from_id: int, to_id: int, amount: float):
    async with uow() as session:
        from_account = await account_repo.get(session, from_id)
        to_account = await account_repo.get(session, to_id)
        
        from_account.balance -= amount
        to_account.balance += amount
        # Auto-commit on success, rollback on failure
```

## Strategy Pattern

```python
from abc import ABC, abstractmethod
from typing import Protocol

# Strategy interface
class PaymentProcessor(Protocol):
    async def process(self, amount: float, data: dict) -> dict: ...
    async def refund(self, transaction_id: str) -> dict: ...

# Concrete strategies
class StripeProcessor:
    async def process(self, amount: float, data: dict) -> dict:
        # Stripe-specific implementation
        return {"provider": "stripe", "transaction_id": "str_xxx"}

    async def refund(self, transaction_id: str) -> dict:
        return {"refunded": True}

class PayPalProcessor:
    async def process(self, amount: float, data: dict) -> dict:
        # PayPal-specific implementation
        return {"provider": "paypal", "transaction_id": "pp_xxx"}

    async def refund(self, transaction_id: str) -> dict:
        return {"refunded": True}

# Context
class PaymentService:
    _processors: dict[str, PaymentProcessor] = {}

    @classmethod
    def register(cls, name: str, processor: PaymentProcessor):
        cls._processors[name] = processor

    def __init__(self, processor_name: str):
        self.processor = self._processors.get(processor_name)
        if not self.processor:
            raise ValueError(f"Unknown processor: {processor_name}")

    async def charge(self, amount: float, data: dict) -> dict:
        return await self.processor.process(amount, data)

# Register strategies
PaymentService.register("stripe", StripeProcessor())
PaymentService.register("paypal", PayPalProcessor())

# Usage
service = PaymentService("stripe")
result = await service.charge(100.00, {"token": "xxx"})
```

## Factory Pattern

```python
from typing import Type, Dict
from abc import ABC, abstractmethod

class Notification(ABC):
    @abstractmethod
    async def send(self, recipient: str, message: str) -> bool:
        pass

class EmailNotification(Notification):
    async def send(self, recipient: str, message: str) -> bool:
        # Send email
        return True

class SMSNotification(Notification):
    async def send(self, recipient: str, message: str) -> bool:
        # Send SMS
        return True

class PushNotification(Notification):
    async def send(self, recipient: str, message: str) -> bool:
        # Send push notification
        return True

class NotificationFactory:
    _notifications: Dict[str, Type[Notification]] = {
        "email": EmailNotification,
        "sms": SMSNotification,
        "push": PushNotification,
    }

    @classmethod
    def create(cls, type: str) -> Notification:
        notification_class = cls._notifications.get(type)
        if not notification_class:
            raise ValueError(f"Unknown notification type: {type}")
        return notification_class()

    @classmethod
    def register(cls, type: str, notification_class: Type[Notification]):
        cls._notifications[type] = notification_class

# Usage
notification = NotificationFactory.create("email")
await notification.send("user@example.com", "Hello!")
```

## Decorator Pattern

### Caching Decorator
```python
from functools import wraps
from typing import Callable, Any
import hashlib
import json

def cache_result(ttl: int = 300, prefix: str = "cache"):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Generate cache key
            key_data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True)
            key_hash = hashlib.md5(key_data.encode()).hexdigest()
            cache_key = f"{prefix}:{func.__name__}:{key_hash}"

            # Try to get from cache
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            await redis_client.setex(cache_key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

@cache_result(ttl=600, prefix="products")
async def get_product_details(product_id: int) -> dict:
    # Expensive database query
    return await product_repo.get_with_details(product_id)
```

### Retry Decorator
```python
import asyncio
from functools import wraps
from typing import Callable, Type, Tuple

def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            current_delay = delay

            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(current_delay)
                        current_delay *= backoff

            raise last_exception
        return wrapper
    return decorator

@retry(max_attempts=3, delay=1.0, exceptions=(ConnectionError, TimeoutError))
async def call_external_api(url: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()
```

## Observer Pattern (Event System)

```python
from typing import Callable, Dict, List, Any
from dataclasses import dataclass
from datetime import datetime

@dataclass
class Event:
    type: str
    data: dict
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()

class EventDispatcher:
    def __init__(self):
        self._listeners: Dict[str, List[Callable]] = {}

    def subscribe(self, event_type: str, listener: Callable):
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(listener)

    def unsubscribe(self, event_type: str, listener: Callable):
        if event_type in self._listeners:
            self._listeners[event_type].remove(listener)

    async def dispatch(self, event: Event):
        listeners = self._listeners.get(event.type, [])
        for listener in listeners:
            await listener(event)

# Global dispatcher
dispatcher = EventDispatcher()

# Listeners
async def log_user_activity(event: Event):
    print(f"User activity: {event.data}")

async def send_notification(event: Event):
    await notification_service.send(event.data["user_id"], event.data["message"])

# Register
dispatcher.subscribe("user.login", log_user_activity)
dispatcher.subscribe("user.login", send_notification)

# Usage
await dispatcher.dispatch(Event(
    type="user.login",
    data={"user_id": 1, "message": "Login successful"}
))
```

## Specification Pattern

```python
from abc import ABC, abstractmethod
from typing import TypeVar, Generic
from sqlalchemy import select

T = TypeVar("T")

class Specification(ABC, Generic[T]):
    @abstractmethod
    def is_satisfied_by(self, candidate: T) -> bool:
        pass

    @abstractmethod
    def to_query(self, query):
        pass

    def __and__(self, other: "Specification[T]") -> "AndSpecification[T]":
        return AndSpecification(self, other)

    def __or__(self, other: "Specification[T]") -> "OrSpecification[T]":
        return OrSpecification(self, other)

    def __invert__(self) -> "NotSpecification[T]":
        return NotSpecification(self)

class AndSpecification(Specification[T]):
    def __init__(self, left: Specification[T], right: Specification[T]):
        self.left = left
        self.right = right

    def is_satisfied_by(self, candidate: T) -> bool:
        return (self.left.is_satisfied_by(candidate) and 
                self.right.is_satisfied_by(candidate))

    def to_query(self, query):
        query = self.left.to_query(query)
        return self.right.to_query(query)

# Concrete specifications
class ActiveUserSpec(Specification[User]):
    def is_satisfied_by(self, user: User) -> bool:
        return user.is_active

    def to_query(self, query):
        return query.where(User.is_active == True)

class PremiumUserSpec(Specification[User]):
    def is_satisfied_by(self, user: User) -> bool:
        return user.subscription == "premium"

    def to_query(self, query):
        return query.where(User.subscription == "premium")

# Usage
spec = ActiveUserSpec() & PremiumUserSpec()
query = spec.to_query(select(User))
result = await db.execute(query)
```

## Command Pattern (CQRS-like)

```python
from abc import ABC, abstractmethod
from typing import TypeVar, Generic
from dataclasses import dataclass

T = TypeVar("T")

# Commands
class Command(ABC):
    pass

class CommandHandler(ABC, Generic[T]):
    @abstractmethod
    async def handle(self, command: Command) -> T:
        pass

@dataclass
class CreateUserCommand(Command):
    email: str
    name: str
    password: str

class CreateUserHandler(CommandHandler[User]):
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def handle(self, command: CreateUserCommand) -> User:
        # Validate
        existing = await self.user_repo.get_by_email(command.email)
        if existing:
            raise ValueError("Email already exists")
        
        # Create
        hashed = hash_password(command.password)
        return await self.user_repo.create(
            email=command.email,
            name=command.name,
            password=hashed,
        )

# Command bus
class CommandBus:
    _handlers: dict = {}

    @classmethod
    def register(cls, command_type: type, handler: CommandHandler):
        cls._handlers[command_type] = handler

    async def dispatch(self, command: Command):
        handler = self._handlers.get(type(command))
        if not handler:
            raise ValueError(f"No handler for {type(command)}")
        return await handler.handle(command)

# Register handlers
bus = CommandBus()
bus.register(CreateUserCommand, CreateUserHandler(user_repo))

# Usage
result = await bus.dispatch(CreateUserCommand(
    email="user@example.com",
    name="John",
    password="secret123",
))
```

## Middleware Pattern

```python
from typing import Callable, List
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class MiddlewareChain:
    def __init__(self):
        self._middlewares: List[Callable] = []

    def add(self, middleware: Callable):
        self._middlewares.append(middleware)
        return self

    async def execute(self, request: Request, handler: Callable) -> Response:
        async def chain(index: int):
            if index < len(self._middlewares):
                return await self._middlewares[index](request, lambda: chain(index + 1))
            return await handler(request)
        return await chain(0)

# Middleware functions
async def logging_middleware(request: Request, next_handler: Callable) -> Response:
    print(f"Before: {request.url}")
    response = await next_handler()
    print(f"After: {response.status_code}")
    return response

async def auth_middleware(request: Request, next_handler: Callable) -> Response:
    token = request.headers.get("Authorization")
    if not token:
        return Response("Unauthorized", status_code=401)
    return await next_handler()

# Usage
chain = MiddlewareChain()
chain.add(logging_middleware).add(auth_middleware)
response = await chain.execute(request, endpoint_handler)
```

## Builder Pattern

```python
from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class QueryBuilder:
    _select: List[str] = field(default_factory=list)
    _where: List[str] = field(default_factory=list)
    _order_by: Optional[str] = None
    _limit: Optional[int] = None
    _offset: Optional[int] = None

    def select(self, *fields: str) -> "QueryBuilder":
        self._select.extend(fields)
        return self

    def where(self, condition: str) -> "QueryBuilder":
        self._where.append(condition)
        return self

    def order_by(self, field: str, desc: bool = False) -> "QueryBuilder":
        self._order_by = f"{field} {'DESC' if desc else 'ASC'}"
        return self

    def limit(self, count: int) -> "QueryBuilder":
        self._limit = count
        return self

    def offset(self, count: int) -> "QueryBuilder":
        self._offset = count
        return self

    def build(self) -> str:
        query = f"SELECT {', '.join(self._select) or '*'}"
        query += " FROM table"
        if self._where:
            query += f" WHERE {' AND '.join(self._where)}"
        if self._order_by:
            query += f" ORDER BY {self._order_by}"
        if self._limit:
            query += f" LIMIT {self._limit}"
        if self._offset:
            query += f" OFFSET {self._offset}"
        return query

# Usage
query = (QueryBuilder()
    .select("id", "name", "email")
    .where("is_active = true")
    .where("role = 'admin'")
    .order_by("created_at", desc=True)
    .limit(10)
    .build())
```
