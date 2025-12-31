# FastAPI Coding Standards

## Project Structure

### Recommended Directory Layout
```
src/
├── main.py                 # Application entry point
├── config.py               # Configuration settings
├── database.py             # Database connection
├── api/
│   ├── __init__.py
│   ├── deps.py             # Shared dependencies
│   └── v1/
│       ├── __init__.py
│       ├── router.py       # API router
│       └── endpoints/
│           ├── __init__.py
│           ├── users.py
│           ├── auth.py
│           └── items.py
├── core/
│   ├── __init__.py
│   ├── security.py         # Auth utilities
│   └── exceptions.py       # Custom exceptions
├── models/
│   ├── __init__.py
│   ├── user.py             # SQLAlchemy models
│   └── item.py
├── schemas/
│   ├── __init__.py
│   ├── user.py             # Pydantic schemas
│   └── item.py
├── crud/
│   ├── __init__.py
│   ├── base.py             # Base CRUD class
│   └── user.py
├── services/
│   ├── __init__.py
│   └── email.py
└── tests/
    ├── __init__.py
    ├── conftest.py
    └── api/
        └── test_users.py
```

## Naming Conventions

### Files and Functions
```python
# Files: snake_case
user_service.py
auth_endpoints.py

# Functions/Methods: snake_case
def get_user_by_id(user_id: int) -> User:
    pass

async def create_user(user_data: UserCreate) -> User:
    pass

# Classes: PascalCase
class UserService:
    pass

class UserCreate(BaseModel):
    pass

# Constants: UPPER_SNAKE_CASE
MAX_ITEMS_PER_PAGE = 100
DEFAULT_TIMEOUT = 30
```

## Pydantic Schemas

### Base Schema Configuration
```python
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional

class BaseSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,  # Enable ORM mode
        str_strip_whitespace=True,
        validate_assignment=True,
    )

# Request schemas
class UserCreate(BaseSchema):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=100)
    name: str = Field(..., min_length=2, max_length=100)

class UserUpdate(BaseSchema):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[str] = Field(None, min_length=5, max_length=255)

# Response schemas
class UserResponse(BaseSchema):
    id: int
    email: str
    name: str
    is_active: bool
    created_at: datetime

class UserListResponse(BaseSchema):
    items: list[UserResponse]
    total: int
    page: int
    pages: int
```

### Schema Validation
```python
from pydantic import BaseModel, Field, field_validator, model_validator
from email_validator import validate_email, EmailNotValidError

class UserCreate(BaseModel):
    email: str
    password: str
    password_confirm: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        try:
            validation = validate_email(v, check_deliverability=False)
            return validation.normalized.lower()
        except EmailNotValidError as e:
            raise ValueError(str(e))

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain a digit')
        return v

    @model_validator(mode='after')
    def passwords_match(self) -> 'UserCreate':
        if self.password != self.password_confirm:
            raise ValueError('Passwords do not match')
        return self
```

## Router Definition

### Endpoint Structure
```python
from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from app.api.deps import get_db, get_current_user
from app.schemas.user import UserCreate, UserResponse, UserListResponse
from app.crud import user as user_crud
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])

@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user",
    description="Create a new user with the provided data.",
)
async def create_user(
    user_in: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """
    Create a new user.
    
    - **email**: valid email address (required)
    - **password**: strong password (required)
    - **name**: user's display name (required)
    """
    existing = await user_crud.get_by_email(db, email=user_in.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    user = await user_crud.create(db, obj_in=user_in)
    return user

@router.get("/", response_model=UserListResponse)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> UserListResponse:
    users, total = await user_crud.get_multi(db, skip=skip, limit=limit)
    return UserListResponse(
        items=users,
        total=total,
        page=skip // limit + 1,
        pages=(total + limit - 1) // limit,
    )

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: Annotated[int, Path(gt=0)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    user = await user_crud.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user
```

## SQLAlchemy Models

### Model Definition
```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional, List

from app.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(default=True)
    is_superuser: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
    )

    # Relationships
    items: Mapped[List["Item"]] = relationship(
        "Item",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    owner: Mapped["User"] = relationship("User", back_populates="items")
```

## CRUD Operations

### Base CRUD Class
```python
from typing import Generic, TypeVar, Type, Optional, List, Tuple, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.database import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, db: AsyncSession, id: int) -> Optional[ModelType]:
        result = await db.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[ModelType], int]:
        # Get total count
        count_result = await db.execute(
            select(func.count()).select_from(self.model)
        )
        total = count_result.scalar_one()

        # Get items
        result = await db.execute(
            select(self.model).offset(skip).limit(limit)
        )
        items = list(result.scalars().all())

        return items, total

    async def create(
        self,
        db: AsyncSession,
        *,
        obj_in: CreateSchemaType,
    ) -> ModelType:
        obj_data = obj_in.model_dump()
        db_obj = self.model(**obj_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: ModelType,
        obj_in: UpdateSchemaType | dict[str, Any],
    ) -> ModelType:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, *, id: int) -> Optional[ModelType]:
        obj = await self.get(db, id=id)
        if obj:
            await db.delete(obj)
            await db.commit()
        return obj
```

## Dependency Injection

### Common Dependencies
```python
from typing import Annotated, AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.database import async_session
from app.core.config import settings
from app.models.user import User
from app.crud import user as user_crud

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await user_crud.get(db, id=user_id)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )
    return current_user

async def get_current_superuser(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user
```

## Configuration

### Settings with Pydantic
```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Application
    APP_NAME: str = "FastAPI App"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 5

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
```

## Application Factory

### Main Application
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.v1.router import api_router
from app.core.config import settings
from app.database import engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # await create_tables()
    yield
    # Shutdown
    await engine.dispose()

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app

app = create_app()
```
