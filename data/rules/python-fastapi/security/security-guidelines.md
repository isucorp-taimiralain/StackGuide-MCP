# FastAPI Security Guidelines

## Authentication

### JWT Implementation
```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class TokenPayload(BaseModel):
    sub: int
    exp: datetime
    type: str  # "access" or "refresh"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(
    user_id: int,
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_refresh_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> Optional[TokenPayload]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return TokenPayload(**payload)
    except JWTError:
        return None
```

### OAuth2 with Password Flow
```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
async def login(
    db: Annotated[AsyncSession, Depends(get_db)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    user = await user_crud.get_by_email(db, email=form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        # Use same error for both cases to prevent user enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )
    
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }

@router.post("/refresh")
async def refresh_token(
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: str,
):
    payload = decode_token(refresh_token)
    
    if not payload or payload.type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    
    user = await user_crud.get(db, id=int(payload.sub))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user",
        )
    
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
    }
```

## Input Validation

### Strict Validation
```python
from pydantic import BaseModel, Field, field_validator
import re
import bleach

class UserInput(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=255)
    bio: str = Field(None, max_length=500)

    @field_validator('username')
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must be alphanumeric')
        return v.lower()

    @field_validator('bio')
    @classmethod
    def sanitize_bio(cls, v: str) -> str:
        if v:
            # Remove HTML tags
            return bleach.clean(v, strip=True)
        return v
```

### SQL Injection Prevention
```python
from sqlalchemy import select, text

# ❌ NEVER do this - SQL injection vulnerable
async def search_users_bad(db: AsyncSession, query: str):
    result = await db.execute(text(f"SELECT * FROM users WHERE name = '{query}'"))
    return result.fetchall()

# ✅ Use parameterized queries
async def search_users(db: AsyncSession, query: str):
    result = await db.execute(
        select(User).where(User.name == query)
    )
    return result.scalars().all()

# ✅ If raw SQL is needed, use parameters
async def search_users_raw(db: AsyncSession, query: str):
    result = await db.execute(
        text("SELECT * FROM users WHERE name = :name"),
        {"name": query}
    )
    return result.fetchall()
```

## Rate Limiting and Brute Force Protection

### Account Lockout
```python
from datetime import datetime, timedelta
from typing import Optional
import redis.asyncio as redis

redis_client = redis.from_url(settings.REDIS_URL)

async def check_login_attempts(email: str) -> tuple[bool, int]:
    """Check if account is locked and return attempts count."""
    key = f"login_attempts:{email}"
    attempts = await redis_client.get(key)
    
    if attempts and int(attempts) >= 5:
        return False, int(attempts)
    
    return True, int(attempts) if attempts else 0

async def record_failed_attempt(email: str) -> None:
    """Record a failed login attempt."""
    key = f"login_attempts:{email}"
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, 900)  # 15 minutes
    await pipe.execute()

async def clear_attempts(email: str) -> None:
    """Clear login attempts after successful login."""
    await redis_client.delete(f"login_attempts:{email}")

@router.post("/login")
async def login(
    db: Annotated[AsyncSession, Depends(get_db)],
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    # Check lockout
    allowed, attempts = await check_login_attempts(form_data.username)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again in 15 minutes.",
        )
    
    user = await authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        await record_failed_attempt(form_data.username)
        remaining = 5 - attempts - 1
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid credentials. {remaining} attempts remaining.",
        )
    
    await clear_attempts(form_data.username)
    return create_tokens(user)
```

## CORS Configuration

```python
from fastapi.middleware.cors import CORSMiddleware

# Production CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yourdomain.com",
        "https://app.yourdomain.com",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)
```

## Security Headers

```python
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

## File Upload Security

```python
from fastapi import UploadFile, HTTPException
import magic
import hashlib
from pathlib import Path

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

async def validate_upload(file: UploadFile) -> bytes:
    """Validate and read uploaded file."""
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size is 5MB.",
        )
    
    # Check actual file type (not just extension)
    mime = magic.from_buffer(content, mime=True)
    if mime not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {mime}. Allowed: {ALLOWED_TYPES}",
        )
    
    return content

def generate_safe_filename(original: str) -> str:
    """Generate a safe, unique filename."""
    ext = Path(original).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        ext = ".bin"
    
    unique = hashlib.sha256(f"{original}{datetime.utcnow()}".encode()).hexdigest()[:16]
    return f"{unique}{ext}"

@router.post("/upload")
async def upload_file(
    file: UploadFile,
    current_user: Annotated[User, Depends(get_current_user)],
):
    content = await validate_upload(file)
    filename = generate_safe_filename(file.filename)
    
    # Save to secure location
    path = Path(settings.UPLOAD_DIR) / str(current_user.id) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    
    return {"filename": filename, "size": len(content)}
```

## Secrets Management

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Never hardcode secrets
    SECRET_KEY: str  # Required from environment
    DATABASE_URL: str
    REDIS_URL: str
    
    # API keys
    STRIPE_SECRET_KEY: str
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    
    class Config:
        env_file = ".env"
        case_sensitive = True

# Validate all required secrets at startup
settings = Settings()

# Never log secrets
import logging

class SecretsFilter(logging.Filter):
    def filter(self, record):
        message = str(record.getMessage())
        # Mask potential secrets
        if "SECRET" in message or "PASSWORD" in message:
            record.msg = "[REDACTED]"
        return True
```

## Audit Logging

```python
from datetime import datetime
import logging
from fastapi import Request

audit_logger = logging.getLogger("audit")

async def log_security_event(
    event_type: str,
    user_id: Optional[int],
    request: Request,
    details: dict = None,
):
    """Log security-relevant events."""
    audit_logger.info({
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": event_type,
        "user_id": user_id,
        "ip_address": request.client.host,
        "user_agent": request.headers.get("user-agent"),
        "path": request.url.path,
        "method": request.method,
        "details": details or {},
    })

# Usage
@router.post("/login")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate(form_data.username, form_data.password)
    
    if user:
        await log_security_event("LOGIN_SUCCESS", user.id, request)
    else:
        await log_security_event(
            "LOGIN_FAILED",
            None,
            request,
            {"email": form_data.username},
        )
```

## HTTPS and TLS

```python
# Redirect HTTP to HTTPS
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

if settings.ENVIRONMENT == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

# Trust proxy headers (behind load balancer)
from starlette.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["yourdomain.com", "*.yourdomain.com"],
)
```
