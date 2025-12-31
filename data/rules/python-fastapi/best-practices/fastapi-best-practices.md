# FastAPI Best Practices

## Async Best Practices

### Use Async Where Beneficial
```python
from sqlalchemy.ext.asyncio import AsyncSession

# ✅ Good: Async for I/O-bound operations
@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await user_crud.get(db, id=user_id)
    return user

# ❌ Avoid: CPU-bound operations in async
@router.get("/compute")
async def compute_heavy():
    # This blocks the event loop!
    result = heavy_computation()
    return result

# ✅ Better: Use run_in_executor for CPU-bound
import asyncio
from concurrent.futures import ProcessPoolExecutor

@router.get("/compute")
async def compute_heavy():
    loop = asyncio.get_event_loop()
    with ProcessPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, heavy_computation)
    return result
```

### Background Tasks
```python
from fastapi import BackgroundTasks

@router.post("/users/")
async def create_user(
    user_in: UserCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await user_crud.create(db, obj_in=user_in)
    
    # Non-blocking background task
    background_tasks.add_task(send_welcome_email, user.email)
    background_tasks.add_task(track_signup_analytics, user.id)
    
    return user

async def send_welcome_email(email: str):
    # This runs after the response is sent
    await email_service.send_template("welcome", email)
```

## Response Handling

### Standardized Responses
```python
from pydantic import BaseModel
from typing import Generic, TypeVar, Optional

T = TypeVar('T')

class ResponseWrapper(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

@router.get("/users", response_model=ResponseWrapper[PaginatedResponse[UserResponse]])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    skip = (page - 1) * page_size
    users, total = await user_crud.get_multi(db, skip=skip, limit=page_size)
    
    return ResponseWrapper(
        data=PaginatedResponse(
            items=users,
            total=total,
            page=page,
            page_size=page_size,
            pages=(total + page_size - 1) // page_size,
        )
    )
```

### Streaming Responses
```python
from fastapi.responses import StreamingResponse
import csv
import io

@router.get("/users/export")
async def export_users(db: Annotated[AsyncSession, Depends(get_db)]):
    async def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Email", "Name"])
        
        async for user in user_crud.stream_all(db):
            writer.writerow([user.id, user.email, user.name])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )
```

## Error Handling

### Custom Exception Handlers
```python
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError

class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str = "error",
    ):
        self.status_code = status_code
        self.detail = detail
        self.code = code

class NotFoundError(AppException):
    def __init__(self, resource: str, id: int):
        super().__init__(
            status_code=404,
            detail=f"{resource} with id {id} not found",
            code="not_found",
        )

class DuplicateError(AppException):
    def __init__(self, field: str):
        super().__init__(
            status_code=409,
            detail=f"{field} already exists",
            code="duplicate",
        )

# Register handlers
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.detail,
            },
        },
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
):
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": {
                "code": "validation_error",
                "message": "Validation failed",
                "details": errors,
            },
        },
    )
```

## Middleware

### Custom Middleware
```python
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
import time
import uuid
import logging

logger = logging.getLogger(__name__)

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        start_time = time.perf_counter()
        
        response = await call_next(request)
        
        duration = time.perf_counter() - start_time
        
        logger.info(
            f"request_id={request_id} "
            f"method={request.method} "
            f"path={request.url.path} "
            f"status={response.status_code} "
            f"duration={duration:.3f}s"
        )
        
        response.headers["X-Request-ID"] = request_id
        return response

app.add_middleware(RequestLoggingMiddleware)
```

## Database Best Practices

### Connection Management
```python
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool

# For production with connection pooling
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    echo=settings.DEBUG,
)

# For serverless (no pooling)
serverless_engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
```

### Transaction Management
```python
from sqlalchemy.ext.asyncio import AsyncSession

async def transfer_funds(
    db: AsyncSession,
    from_account_id: int,
    to_account_id: int,
    amount: float,
):
    async with db.begin():
        # All operations in this block are in a transaction
        from_account = await account_crud.get(db, id=from_account_id)
        to_account = await account_crud.get(db, id=to_account_id)
        
        if from_account.balance < amount:
            raise InsufficientFundsError()
        
        from_account.balance -= amount
        to_account.balance += amount
        
        # Auto-commit on success, rollback on exception
```

## Caching

### Redis Caching
```python
import redis.asyncio as redis
from functools import wraps
import json

redis_client = redis.from_url(settings.REDIS_URL)

def cache(expire: int = 300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try cache
            cached = await redis_client.get(key)
            if cached:
                return json.loads(cached)
            
            # Execute and cache
            result = await func(*args, **kwargs)
            await redis_client.setex(key, expire, json.dumps(result))
            return result
        return wrapper
    return decorator

@cache(expire=300)
async def get_popular_items(limit: int = 10):
    return await items_crud.get_popular(limit=limit)
```

## Rate Limiting

### Slowapi Integration
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, credentials: LoginRequest):
    # Rate limited to 5 attempts per minute
    pass

@router.get("/search")
@limiter.limit("100/minute")
async def search(request: Request, q: str):
    pass
```

## Testing

### Test Client
```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.api.deps import get_db
from app.database import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

@pytest.fixture
async def test_db():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    TestSession = async_sessionmaker(engine, expire_on_commit=False)
    
    async def get_test_db():
        async with TestSession() as session:
            yield session
    
    app.dependency_overrides[get_db] = get_test_db
    
    yield TestSession
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
async def client(test_db):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/users/",
        json={
            "email": "test@example.com",
            "password": "StrongPass123!",
            "name": "Test User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
```

## Documentation

### OpenAPI Enhancements
```python
from fastapi import FastAPI

app = FastAPI(
    title="My API",
    description="""
    ## Description
    This is a sample API with full documentation.
    
    ## Features
    * User management
    * Authentication
    * Item CRUD operations
    """,
    version="1.0.0",
    terms_of_service="https://example.com/terms/",
    contact={
        "name": "API Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=[
        {"name": "users", "description": "User operations"},
        {"name": "auth", "description": "Authentication"},
        {"name": "items", "description": "Item management"},
    ],
)
```
