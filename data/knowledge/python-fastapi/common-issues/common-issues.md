# FastAPI Common Issues and Solutions

## Async/Await Issues

### Blocking the Event Loop
**Problem:** Using sync functions in async endpoints blocks the event loop.

```python
# ❌ Problem: Blocking call in async function
@router.get("/data")
async def get_data():
    data = requests.get("https://api.example.com")  # Blocks!
    return data.json()

# ✅ Solution: Use async HTTP client
import httpx

@router.get("/data")
async def get_data():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com")
        return response.json()

# ✅ Alternative: Run sync in thread pool
from fastapi.concurrency import run_in_threadpool

@router.get("/data")
async def get_data():
    data = await run_in_threadpool(requests.get, "https://api.example.com")
    return data.json()
```

### Mixing Sync and Async
```python
# ❌ Problem: Calling async from sync context
def sync_function():
    result = await async_function()  # SyntaxError!

# ✅ Solution 1: Make the caller async
async def sync_function():
    result = await async_function()

# ✅ Solution 2: Use asyncio.run (for scripts)
def sync_function():
    result = asyncio.run(async_function())

# ✅ Solution 3: Create task in running loop
def sync_function():
    loop = asyncio.get_running_loop()
    future = asyncio.run_coroutine_threadsafe(async_function(), loop)
    result = future.result()
```

## Database Issues

### Session Not Closing
```python
# ❌ Problem: Session leaks
@router.get("/users")
async def get_users():
    db = async_session()
    users = await db.execute(select(User))
    return users.scalars().all()
    # Session never closed!

# ✅ Solution: Use dependency injection
async def get_db():
    async with async_session() as session:
        yield session

@router.get("/users")
async def get_users(db: Annotated[AsyncSession, Depends(get_db)]):
    users = await db.execute(select(User))
    return users.scalars().all()
```

### DetachedInstanceError
**Error:** `DetachedInstanceError: Instance is not bound to a Session`

```python
# ❌ Problem: Accessing lazy-loaded attribute after session closes
@router.get("/users/{id}")
async def get_user(id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    user = await db.get(User, id)
    return {"name": user.name, "posts": user.posts}  # Error: posts not loaded

# ✅ Solution 1: Eager load relationships
@router.get("/users/{id}")
async def get_user(id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(
        select(User).options(selectinload(User.posts)).where(User.id == id)
    )
    user = result.scalar_one()
    return {"name": user.name, "posts": user.posts}

# ✅ Solution 2: Use expire_on_commit=False
async_session = async_sessionmaker(
    engine,
    expire_on_commit=False,  # Objects remain usable after commit
)
```

### Greenlet Error with Async SQLAlchemy
**Error:** `greenlet_spawn has not been called; can't call await_()`

```python
# ❌ Problem: Using sync engine with async session
from sqlalchemy import create_engine
engine = create_engine("postgresql://...")  # Sync engine!

# ✅ Solution: Use async engine
from sqlalchemy.ext.asyncio import create_async_engine
engine = create_async_engine("postgresql+asyncpg://...")
```

## Validation Errors

### Pydantic V2 Migration Issues
```python
# ❌ Problem: V1 syntax in V2
class UserSchema(BaseModel):
    class Config:
        orm_mode = True  # V1 syntax

# ✅ Solution: V2 syntax
class UserSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

### Circular Import with Schemas
```python
# ❌ Problem: Circular imports
# user.py
from .post import PostSchema
class UserSchema(BaseModel):
    posts: List[PostSchema]

# post.py
from .user import UserSchema  # Circular!
class PostSchema(BaseModel):
    author: UserSchema

# ✅ Solution: Use string references and update_forward_refs
# user.py
class UserSchema(BaseModel):
    posts: List["PostSchema"] = []

# After both are defined
UserSchema.model_rebuild()
PostSchema.model_rebuild()
```

### Optional Fields Not Working
```python
# ❌ Problem: Field required even with None default
class UserUpdate(BaseModel):
    name: str = None  # Still required in V2!

# ✅ Solution: Use Optional or | None
from typing import Optional

class UserUpdate(BaseModel):
    name: Optional[str] = None
    # Or: name: str | None = None
```

## Dependency Injection Issues

### Dependency Not Found
**Error:** `TypeError: 'Depends' object is not callable`

```python
# ❌ Problem: Using Depends without Annotated
@router.get("/users")
async def get_users(db = Depends(get_db)):  # Works but not recommended
    pass

# ✅ Solution: Use Annotated (recommended in FastAPI 0.95+)
from typing import Annotated

@router.get("/users")
async def get_users(db: Annotated[AsyncSession, Depends(get_db)]):
    pass
```

### Dependency Called Multiple Times
```python
# ❌ Problem: Heavy dependency called for each usage
async def get_heavy_resource():
    # Expensive operation
    return await load_data()

@router.get("/data")
async def get_data(
    resource1: Annotated[Data, Depends(get_heavy_resource)],
    resource2: Annotated[Data, Depends(get_heavy_resource)],  # Called again!
):
    pass

# ✅ Solution: Use use_cache=True (default)
# FastAPI caches dependency results within same request by default
# Or use global caching for expensive operations
```

## Response Issues

### Response Model Validation Error
```python
# ❌ Problem: Response doesn't match model
class UserResponse(BaseModel):
    id: int
    email: str

@router.get("/user", response_model=UserResponse)
async def get_user():
    return {"id": 1, "email": None}  # Error: email cannot be None

# ✅ Solution: Fix data or update schema
class UserResponse(BaseModel):
    id: int
    email: Optional[str]
```

### Serializing SQLAlchemy Objects
```python
# ❌ Problem: Can't serialize SQLAlchemy model
@router.get("/user")
async def get_user(db: AsyncSession = Depends(get_db)):
    user = await db.get(User, 1)
    return user  # Error: not JSON serializable

# ✅ Solution: Use response_model with from_attributes
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    email: str

@router.get("/user", response_model=UserResponse)
async def get_user(db: AsyncSession = Depends(get_db)):
    user = await db.get(User, 1)
    return user  # Auto-converted via response_model
```

## CORS Issues

### Preflight Requests Failing
```python
# ❌ Problem: CORS not configured properly
app = FastAPI()
# Missing CORS middleware

# ✅ Solution: Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Credentials Not Working
```python
# ❌ Problem: Cookies/auth not sent
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Can't use * with credentials!
    allow_credentials=True,
)

# ✅ Solution: Specify exact origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Testing Issues

### Async Tests Not Running
```python
# ❌ Problem: Test hangs or fails
def test_endpoint():
    response = await client.get("/")  # SyntaxError in sync function

# ✅ Solution: Use pytest-asyncio
import pytest

@pytest.mark.asyncio
async def test_endpoint():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
```

### Database State Persisting Between Tests
```python
# ❌ Problem: Tests affect each other
@pytest.fixture
async def db():
    async with async_session() as session:
        yield session
        # Changes persist!

# ✅ Solution: Rollback after each test
@pytest.fixture
async def db():
    async with async_session() as session:
        yield session
        await session.rollback()

# Or use nested transactions
@pytest.fixture
async def db():
    async with engine.connect() as conn:
        await conn.begin_nested()
        async_session = async_sessionmaker(bind=conn)
        async with async_session() as session:
            yield session
        await conn.rollback()
```

## Performance Issues

### Slow Startup
```python
# ❌ Problem: Blocking operations during startup
@app.on_event("startup")
async def startup():
    await heavy_initialization()  # Blocks server start

# ✅ Solution: Use lifespan with background init
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Quick startup
    app.state.ready = False
    asyncio.create_task(heavy_initialization())
    yield
    # Cleanup

app = FastAPI(lifespan=lifespan)
```

### Memory Leaks
```python
# ❌ Problem: Accumulating data in memory
cache = {}

@router.get("/data/{id}")
async def get_data(id: str):
    if id not in cache:
        cache[id] = await fetch_data(id)  # Never expires!
    return cache[id]

# ✅ Solution: Use TTL cache
from cachetools import TTLCache

cache = TTLCache(maxsize=1000, ttl=300)

@router.get("/data/{id}")
async def get_data(id: str):
    if id not in cache:
        cache[id] = await fetch_data(id)
    return cache[id]
```

## File Upload Issues

### Large File Handling
```python
# ❌ Problem: Loading entire file into memory
@router.post("/upload")
async def upload(file: UploadFile):
    content = await file.read()  # Entire file in memory!

# ✅ Solution: Stream file to disk
import aiofiles

@router.post("/upload")
async def upload(file: UploadFile):
    async with aiofiles.open(f"uploads/{file.filename}", "wb") as f:
        while chunk := await file.read(8192):  # 8KB chunks
            await f.write(chunk)
    return {"filename": file.filename}
```

## WebSocket Issues

### Connection Closing Unexpectedly
```python
# ❌ Problem: No error handling
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Echo: {data}")

# ✅ Solution: Handle disconnections
from fastapi import WebSocketDisconnect

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        await websocket.close(code=1011)
```

## Middleware Issues

### Middleware Order Matters
```python
# ❌ Problem: Auth middleware runs before CORS
app.add_middleware(AuthMiddleware)
app.add_middleware(CORSMiddleware, ...)  # CORS checked first (outer)

# ✅ Solution: Add in correct order (first added = outermost)
app.add_middleware(CORSMiddleware, ...)  # Runs first
app.add_middleware(AuthMiddleware)  # Runs second
```

### Accessing Request Body in Middleware
```python
# ❌ Problem: Body already consumed
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        body = await request.body()  # Consumes body!
        response = await call_next(request)  # Endpoint can't read body
        return response

# ✅ Solution: Cache body for reuse
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        body = await request.body()
        
        async def receive():
            return {"type": "http.request", "body": body}
        
        request._receive = receive
        response = await call_next(request)
        return response
```
