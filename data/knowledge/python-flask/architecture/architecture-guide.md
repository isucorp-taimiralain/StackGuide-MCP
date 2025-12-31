# Flask Architecture Guide

## Application Architecture

### Application Factory Pattern
```python
# app/__init__.py
from flask import Flask
from config import config

def create_app(config_name='default'):
    """Application factory pattern."""
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)
    
    # Initialize extensions
    init_extensions(app)
    
    # Register blueprints
    register_blueprints(app)
    
    # Register error handlers
    register_error_handlers(app)
    
    # Register CLI commands
    register_commands(app)
    
    # Configure logging
    configure_logging(app)
    
    return app

def init_extensions(app):
    """Initialize Flask extensions."""
    from app.extensions import db, migrate, login_manager, cache, limiter
    
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    cache.init_app(app)
    limiter.init_app(app)

def register_blueprints(app):
    """Register application blueprints."""
    from app.views.main import main_bp
    from app.views.auth import auth_bp
    from app.views.api import api_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(api_bp, url_prefix='/api/v1')
```

### Extensions Module
```python
# app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
cache = Cache()
limiter = Limiter(key_func=get_remote_address)
mail = Mail()

# Configure login manager
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'
```

## Layered Architecture

### Request Flow
```
HTTP Request
    ↓
Middleware (Before Request Hooks)
    ↓
Blueprint Router
    ↓
View Function (Controller)
    ↓
Service Layer (Business Logic)
    ↓
Repository Layer (Data Access)
    ↓
Model (SQLAlchemy ORM)
    ↓
Database
```

### Directory Structure
```
app/
├── __init__.py           # Application factory
├── extensions.py         # Flask extensions
├── models/               # SQLAlchemy models
│   ├── __init__.py
│   ├── base.py          # Base model class
│   ├── user.py
│   └── post.py
├── repositories/         # Data access layer
│   ├── __init__.py
│   ├── base.py
│   └── user_repository.py
├── services/            # Business logic layer
│   ├── __init__.py
│   └── user_service.py
├── views/               # Blueprints (Controllers)
│   ├── __init__.py
│   ├── main.py
│   ├── auth.py
│   └── api/
│       ├── __init__.py
│       └── users.py
├── schemas/             # Serialization schemas
│   ├── __init__.py
│   └── user.py
├── forms/               # WTForms
│   ├── __init__.py
│   └── auth.py
├── templates/
└── static/
```

### Base Model
```python
# app/models/base.py
from datetime import datetime
from app.extensions import db

class BaseModel(db.Model):
    __abstract__ = True
    
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
    
    def save(self):
        db.session.add(self)
        db.session.commit()
        return self
    
    def delete(self):
        db.session.delete(self)
        db.session.commit()
    
    @classmethod
    def get_or_404(cls, id):
        return cls.query.get_or_404(id)
```

### Repository Layer
```python
# app/repositories/base.py
from typing import TypeVar, Generic, List, Optional, Type
from app.extensions import db

T = TypeVar('T')

class BaseRepository(Generic[T]):
    def __init__(self, model: Type[T]):
        self.model = model
    
    def get_by_id(self, id: int) -> Optional[T]:
        return self.model.query.get(id)
    
    def get_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        return self.model.query.limit(limit).offset(offset).all()
    
    def create(self, **kwargs) -> T:
        instance = self.model(**kwargs)
        db.session.add(instance)
        db.session.commit()
        return instance
    
    def update(self, instance: T, **kwargs) -> T:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        db.session.commit()
        return instance
    
    def delete(self, instance: T) -> None:
        db.session.delete(instance)
        db.session.commit()
    
    def count(self) -> int:
        return self.model.query.count()

# app/repositories/user_repository.py
from app.models.user import User
from .base import BaseRepository

class UserRepository(BaseRepository[User]):
    def __init__(self):
        super().__init__(User)
    
    def get_by_email(self, email: str) -> Optional[User]:
        return User.query.filter_by(email=email.lower()).first()
    
    def get_active_users(self) -> List[User]:
        return User.query.filter_by(is_active=True).all()
    
    def search(self, query: str) -> List[User]:
        return User.query.filter(
            User.name.ilike(f'%{query}%')
        ).all()
```

### Service Layer
```python
# app/services/user_service.py
from typing import Optional, List, Dict, Any
from werkzeug.security import generate_password_hash
from app.repositories.user_repository import UserRepository
from app.models.user import User

class UserService:
    def __init__(self):
        self.repository = UserRepository()
    
    def get_user(self, user_id: int) -> Optional[User]:
        return self.repository.get_by_id(user_id)
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        return self.repository.get_by_email(email)
    
    def create_user(self, data: Dict[str, Any]) -> User:
        # Check uniqueness
        if self.repository.get_by_email(data['email']):
            raise ValueError('Email already registered')
        
        # Hash password
        password_hash = generate_password_hash(data.pop('password'))
        
        return self.repository.create(
            password_hash=password_hash,
            **data
        )
    
    def update_user(self, user_id: int, data: Dict[str, Any]) -> User:
        user = self.get_user(user_id)
        if not user:
            raise ValueError('User not found')
        
        # Check email uniqueness if changing
        if 'email' in data and data['email'] != user.email:
            if self.repository.get_by_email(data['email']):
                raise ValueError('Email already registered')
        
        return self.repository.update(user, **data)
    
    def delete_user(self, user_id: int) -> None:
        user = self.get_user(user_id)
        if not user:
            raise ValueError('User not found')
        self.repository.delete(user)
    
    def authenticate(self, email: str, password: str) -> Optional[User]:
        user = self.repository.get_by_email(email)
        if user and user.verify_password(password):
            return user
        return None
```

## Event-Driven Architecture

### Signal Handlers
```python
# app/signals.py
from blinker import signal

# Define signals
user_created = signal('user-created')
user_updated = signal('user-updated')
user_deleted = signal('user-deleted')
order_placed = signal('order-placed')

# app/handlers/user_handlers.py
from app.signals import user_created, user_updated
from app.tasks import send_welcome_email, sync_user_to_crm

@user_created.connect
def handle_user_created(sender, user):
    """Handle user created event."""
    send_welcome_email.delay(user.id)
    sync_user_to_crm.delay(user.id)

@user_updated.connect
def handle_user_updated(sender, user, changes):
    """Handle user updated event."""
    if 'email' in changes:
        # Send verification email
        pass

# Usage in service
from app.signals import user_created

class UserService:
    def create_user(self, data):
        user = self.repository.create(**data)
        user_created.send(self, user=user)
        return user
```

### Background Tasks with Celery
```python
# app/tasks/__init__.py
from celery import Celery

celery = Celery('app')

def init_celery(app):
    celery.conf.update(app.config)
    
    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)
    
    celery.Task = ContextTask

# app/tasks/email_tasks.py
from app.tasks import celery
from app.extensions import mail
from flask_mail import Message

@celery.task(bind=True, max_retries=3)
def send_welcome_email(self, user_id):
    try:
        from app.models.user import User
        user = User.query.get(user_id)
        
        msg = Message(
            'Welcome!',
            recipients=[user.email],
            body=f'Welcome {user.name}!'
        )
        mail.send(msg)
    except Exception as exc:
        self.retry(exc=exc, countdown=60)

@celery.task
def send_bulk_emails(user_ids, subject, body):
    from app.models.user import User
    
    with mail.connect() as conn:
        for user_id in user_ids:
            user = User.query.get(user_id)
            msg = Message(subject, recipients=[user.email], body=body)
            conn.send(msg)
```

## Caching Architecture

### Multi-Level Caching
```python
# app/cache.py
from functools import wraps
from flask import g
from app.extensions import cache

def cached_with_context(timeout=300, key_prefix='view'):
    """Cache decorator with request context."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            cache_key = f"{key_prefix}:{f.__name__}:{args}:{kwargs}"
            
            # Check request-level cache
            if hasattr(g, '_cache') and cache_key in g._cache:
                return g._cache[cache_key]
            
            # Check application cache
            rv = cache.get(cache_key)
            if rv is not None:
                return rv
            
            # Compute value
            rv = f(*args, **kwargs)
            
            # Store in both caches
            cache.set(cache_key, rv, timeout=timeout)
            if not hasattr(g, '_cache'):
                g._cache = {}
            g._cache[cache_key] = rv
            
            return rv
        return decorated_function
    return decorator

# Usage
@cached_with_context(timeout=600)
def get_expensive_data(user_id):
    # Expensive computation
    return result
```

### Cache Invalidation
```python
# app/services/user_service.py
from app.extensions import cache

class UserService:
    def update_user(self, user_id, data):
        user = self.repository.update(user_id, data)
        
        # Invalidate related caches
        cache.delete(f'user:{user_id}')
        cache.delete_memoized(self.get_user_profile, user_id)
        cache.delete_many([
            f'user_list:*',
            f'user_posts:{user_id}',
        ])
        
        return user
```

## Database Architecture

### Connection Pooling
```python
# config.py
class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 20,
    }
```

### Read Replicas
```python
# app/database.py
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

class ReplicaAwareDatabase:
    def __init__(self):
        self.primary = None
        self.replica = None
    
    def init_app(self, app):
        self.primary = create_engine(app.config['DATABASE_URL'])
        if app.config.get('DATABASE_REPLICA_URL'):
            self.replica = create_engine(app.config['DATABASE_REPLICA_URL'])
    
    def get_read_session(self):
        """Get session for read operations."""
        engine = self.replica or self.primary
        return scoped_session(sessionmaker(bind=engine))
    
    def get_write_session(self):
        """Get session for write operations."""
        return scoped_session(sessionmaker(bind=self.primary))
```

## API Architecture

### RESTful API Structure
```python
# app/views/api/__init__.py
from flask import Blueprint

api_bp = Blueprint('api', __name__)

# Register API resources
from .users import users_bp
from .posts import posts_bp

api_bp.register_blueprint(users_bp, url_prefix='/users')
api_bp.register_blueprint(posts_bp, url_prefix='/posts')

# API-wide error handlers
@api_bp.errorhandler(404)
def not_found(error):
    return {'error': 'Resource not found'}, 404

@api_bp.errorhandler(422)
def validation_error(error):
    return {'error': 'Validation failed', 'details': error.description}, 422
```

### Response Formatting
```python
# app/utils/response.py
from flask import jsonify

def api_response(data=None, message=None, status=200, meta=None):
    """Standardized API response."""
    response = {
        'success': 200 <= status < 300,
        'data': data,
        'message': message,
    }
    if meta:
        response['meta'] = meta
    return jsonify(response), status

def paginated_response(items, total, page, per_page, schema):
    """Paginated API response."""
    return api_response(
        data=schema.dump(items, many=True),
        meta={
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page,
        }
    )
```

## Configuration Management

```python
# config.py
import os
from datetime import timedelta

class Config:
    # Base configuration
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Feature flags
    FEATURE_NEW_DASHBOARD = os.environ.get('FEATURE_NEW_DASHBOARD', 'false') == 'true'
    
    @staticmethod
    def init_app(app):
        pass

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL', 'sqlite:///dev.db')
    CACHE_TYPE = 'simple'

class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    CACHE_TYPE = 'redis'
    CACHE_REDIS_URL = os.environ.get('REDIS_URL')
    
    @classmethod
    def init_app(cls, app):
        Config.init_app(app)
        
        # Production-specific setup
        import logging
        from logging.handlers import SysLogHandler
        
        syslog_handler = SysLogHandler()
        syslog_handler.setLevel(logging.WARNING)
        app.logger.addHandler(syslog_handler)

config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}

def get_config():
    return config[os.environ.get('FLASK_ENV', 'default')]
```
