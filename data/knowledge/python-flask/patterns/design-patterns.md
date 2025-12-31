# Flask Design Patterns

## Application Factory Pattern

```python
# The foundation of Flask application structure
def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Initialize components
    init_extensions(app)
    register_blueprints(app)
    register_error_handlers(app)
    
    return app
```

## Repository Pattern

### Base Repository
```python
from typing import TypeVar, Generic, List, Optional, Type, Dict, Any
from app.extensions import db

T = TypeVar('T', bound=db.Model)

class Repository(Generic[T]):
    """Abstract repository for data access."""
    
    def __init__(self, model: Type[T]):
        self.model = model
    
    def find(self, id: int) -> Optional[T]:
        return self.model.query.get(id)
    
    def find_or_fail(self, id: int) -> T:
        instance = self.find(id)
        if not instance:
            raise ValueError(f'{self.model.__name__} not found')
        return instance
    
    def all(self) -> List[T]:
        return self.model.query.all()
    
    def filter_by(self, **kwargs) -> List[T]:
        return self.model.query.filter_by(**kwargs).all()
    
    def first_by(self, **kwargs) -> Optional[T]:
        return self.model.query.filter_by(**kwargs).first()
    
    def create(self, data: Dict[str, Any]) -> T:
        instance = self.model(**data)
        db.session.add(instance)
        db.session.commit()
        return instance
    
    def update(self, instance: T, data: Dict[str, Any]) -> T:
        for key, value in data.items():
            if hasattr(instance, key):
                setattr(instance, key, value)
        db.session.commit()
        return instance
    
    def delete(self, instance: T) -> None:
        db.session.delete(instance)
        db.session.commit()
    
    def paginate(self, page: int = 1, per_page: int = 20):
        return self.model.query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )

# Concrete repository
class UserRepository(Repository['User']):
    def __init__(self):
        from app.models.user import User
        super().__init__(User)
    
    def find_by_email(self, email: str) -> Optional['User']:
        return self.first_by(email=email.lower())
    
    def find_active(self) -> List['User']:
        return self.filter_by(is_active=True)
```

## Service Pattern

```python
from typing import Dict, Any, Optional
from app.repositories.user_repository import UserRepository
from werkzeug.security import generate_password_hash

class UserService:
    """Business logic for user operations."""
    
    def __init__(self):
        self.repo = UserRepository()
    
    def register(self, data: Dict[str, Any]) -> 'User':
        # Validation
        if self.repo.find_by_email(data['email']):
            raise ValueError('Email already exists')
        
        # Transform data
        data['email'] = data['email'].lower()
        data['password_hash'] = generate_password_hash(data.pop('password'))
        
        # Create user
        user = self.repo.create(data)
        
        # Side effects (could emit events instead)
        self._send_welcome_email(user)
        
        return user
    
    def update_profile(self, user_id: int, data: Dict[str, Any]) -> 'User':
        user = self.repo.find_or_fail(user_id)
        
        # Business rules
        if 'email' in data and data['email'] != user.email:
            if self.repo.find_by_email(data['email']):
                raise ValueError('Email already exists')
        
        return self.repo.update(user, data)
    
    def _send_welcome_email(self, user: 'User') -> None:
        from app.tasks.email import send_welcome_email
        send_welcome_email.delay(user.id)
```

## Factory Pattern

```python
from abc import ABC, abstractmethod
from typing import Dict, Type

class Notification(ABC):
    @abstractmethod
    def send(self, recipient: str, message: str) -> bool:
        pass

class EmailNotification(Notification):
    def send(self, recipient: str, message: str) -> bool:
        # Send email
        return True

class SMSNotification(Notification):
    def send(self, recipient: str, message: str) -> bool:
        # Send SMS
        return True

class PushNotification(Notification):
    def send(self, recipient: str, message: str) -> bool:
        # Send push
        return True

class NotificationFactory:
    _types: Dict[str, Type[Notification]] = {
        'email': EmailNotification,
        'sms': SMSNotification,
        'push': PushNotification,
    }
    
    @classmethod
    def create(cls, notification_type: str) -> Notification:
        notification_class = cls._types.get(notification_type)
        if not notification_class:
            raise ValueError(f'Unknown notification type: {notification_type}')
        return notification_class()
    
    @classmethod
    def register(cls, name: str, notification_class: Type[Notification]):
        cls._types[name] = notification_class

# Usage
notification = NotificationFactory.create('email')
notification.send('user@example.com', 'Hello!')
```

## Strategy Pattern

```python
from abc import ABC, abstractmethod
from typing import Dict, Any

class PaymentProcessor(ABC):
    @abstractmethod
    def process(self, amount: float, details: Dict[str, Any]) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    def refund(self, transaction_id: str) -> bool:
        pass

class StripeProcessor(PaymentProcessor):
    def process(self, amount: float, details: Dict[str, Any]) -> Dict[str, Any]:
        # Stripe-specific implementation
        return {'provider': 'stripe', 'transaction_id': 'str_xxx'}
    
    def refund(self, transaction_id: str) -> bool:
        return True

class PayPalProcessor(PaymentProcessor):
    def process(self, amount: float, details: Dict[str, Any]) -> Dict[str, Any]:
        # PayPal-specific implementation
        return {'provider': 'paypal', 'transaction_id': 'pp_xxx'}
    
    def refund(self, transaction_id: str) -> bool:
        return True

class PaymentService:
    _processors: Dict[str, PaymentProcessor] = {}
    
    @classmethod
    def register_processor(cls, name: str, processor: PaymentProcessor):
        cls._processors[name] = processor
    
    def __init__(self, processor_name: str):
        self.processor = self._processors.get(processor_name)
        if not self.processor:
            raise ValueError(f'Unknown processor: {processor_name}')
    
    def charge(self, amount: float, details: Dict[str, Any]) -> Dict[str, Any]:
        return self.processor.process(amount, details)

# Register processors
PaymentService.register_processor('stripe', StripeProcessor())
PaymentService.register_processor('paypal', PayPalProcessor())

# Usage
service = PaymentService('stripe')
result = service.charge(100.00, {'token': 'xxx'})
```

## Decorator Pattern

### Request Decorators
```python
from functools import wraps
from flask import request, jsonify, g
from flask_login import current_user

def json_required(f):
    """Require JSON content type."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not request.is_json:
            return jsonify({'error': 'JSON required'}), 400
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Require admin role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401
        if not current_user.is_admin():
            return jsonify({'error': 'Admin required'}), 403
        return f(*args, **kwargs)
    return decorated

def rate_limit(limit: int = 100, period: int = 60):
    """Rate limit decorator."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            # Check rate limit
            key = f'{request.remote_addr}:{f.__name__}'
            # Implementation details...
            return f(*args, **kwargs)
        return decorated
    return decorator

def validate_schema(schema_class):
    """Validate request body against schema."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                g.validated_data = schema_class().load(request.json)
            except ValidationError as err:
                return jsonify({'errors': err.messages}), 422
            return f(*args, **kwargs)
        return decorated
    return decorator

# Usage
@app.route('/api/users', methods=['POST'])
@json_required
@admin_required
@validate_schema(UserCreateSchema)
def create_user():
    data = g.validated_data
    user = UserService().register(data)
    return jsonify(UserSchema().dump(user)), 201
```

## Observer Pattern (Events)

```python
from blinker import signal
from typing import Callable, Dict, List

# Event signals
user_registered = signal('user-registered')
user_logged_in = signal('user-logged-in')
order_placed = signal('order-placed')
payment_completed = signal('payment-completed')

class EventEmitter:
    """Simple event emitter for application events."""
    _handlers: Dict[str, List[Callable]] = {}
    
    @classmethod
    def on(cls, event: str, handler: Callable):
        if event not in cls._handlers:
            cls._handlers[event] = []
        cls._handlers[event].append(handler)
    
    @classmethod
    def emit(cls, event: str, **kwargs):
        handlers = cls._handlers.get(event, [])
        for handler in handlers:
            try:
                handler(**kwargs)
            except Exception as e:
                # Log error but don't stop other handlers
                current_app.logger.error(f'Event handler error: {e}')

# Register handlers
@user_registered.connect
def send_welcome_email(sender, user):
    from app.tasks.email import send_welcome_email
    send_welcome_email.delay(user.id)

@user_registered.connect
def track_signup(sender, user):
    from app.services.analytics import track_event
    track_event('user_signup', user_id=user.id)

# Emit in service
class UserService:
    def register(self, data):
        user = self.repo.create(data)
        user_registered.send(self, user=user)
        return user
```

## Unit of Work Pattern

```python
from contextlib import contextmanager
from app.extensions import db

class UnitOfWork:
    """Manage database transactions."""
    
    def __init__(self):
        self.session = db.session
    
    @contextmanager
    def transaction(self):
        """Context manager for database transactions."""
        try:
            yield self
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
    
    def add(self, entity):
        self.session.add(entity)
    
    def delete(self, entity):
        self.session.delete(entity)

# Usage
uow = UnitOfWork()

def transfer_funds(from_account_id, to_account_id, amount):
    with uow.transaction():
        from_account = Account.query.get(from_account_id)
        to_account = Account.query.get(to_account_id)
        
        if from_account.balance < amount:
            raise ValueError('Insufficient funds')
        
        from_account.balance -= amount
        to_account.balance += amount
```

## Command Pattern

```python
from abc import ABC, abstractmethod
from typing import Any, Dict, Type

class Command(ABC):
    """Base command class."""
    
    @abstractmethod
    def execute(self) -> Any:
        pass

class CreateUserCommand(Command):
    def __init__(self, email: str, name: str, password: str):
        self.email = email
        self.name = name
        self.password = password
    
    def execute(self) -> 'User':
        from app.services.user_service import UserService
        return UserService().register({
            'email': self.email,
            'name': self.name,
            'password': self.password,
        })

class UpdateUserCommand(Command):
    def __init__(self, user_id: int, data: Dict[str, Any]):
        self.user_id = user_id
        self.data = data
    
    def execute(self) -> 'User':
        from app.services.user_service import UserService
        return UserService().update_profile(self.user_id, self.data)

class CommandBus:
    """Execute commands."""
    
    def dispatch(self, command: Command) -> Any:
        return command.execute()

# Usage
bus = CommandBus()
user = bus.dispatch(CreateUserCommand(
    email='user@example.com',
    name='John Doe',
    password='secret123'
))
```

## Specification Pattern

```python
from abc import ABC, abstractmethod
from typing import TypeVar, Generic
from sqlalchemy import and_, or_, not_

T = TypeVar('T')

class Specification(ABC, Generic[T]):
    """Encapsulates business rules as reusable specifications."""
    
    @abstractmethod
    def is_satisfied_by(self, entity: T) -> bool:
        pass
    
    @abstractmethod
    def to_filter(self):
        """Convert to SQLAlchemy filter."""
        pass
    
    def __and__(self, other: 'Specification[T]') -> 'AndSpecification[T]':
        return AndSpecification(self, other)
    
    def __or__(self, other: 'Specification[T]') -> 'OrSpecification[T]':
        return OrSpecification(self, other)
    
    def __invert__(self) -> 'NotSpecification[T]':
        return NotSpecification(self)

class AndSpecification(Specification[T]):
    def __init__(self, left: Specification[T], right: Specification[T]):
        self.left = left
        self.right = right
    
    def is_satisfied_by(self, entity: T) -> bool:
        return self.left.is_satisfied_by(entity) and self.right.is_satisfied_by(entity)
    
    def to_filter(self):
        return and_(self.left.to_filter(), self.right.to_filter())

# Concrete specifications
class ActiveUserSpec(Specification['User']):
    def is_satisfied_by(self, user: 'User') -> bool:
        return user.is_active
    
    def to_filter(self):
        from app.models.user import User
        return User.is_active == True

class PremiumUserSpec(Specification['User']):
    def is_satisfied_by(self, user: 'User') -> bool:
        return user.subscription == 'premium'
    
    def to_filter(self):
        from app.models.user import User
        return User.subscription == 'premium'

# Usage
spec = ActiveUserSpec() & PremiumUserSpec()
users = User.query.filter(spec.to_filter()).all()
```

## Middleware Pattern

```python
from flask import Flask, request, g
from typing import Callable, List
import time
import uuid

class Middleware:
    """Base middleware class."""
    
    def before_request(self):
        pass
    
    def after_request(self, response):
        return response

class RequestIdMiddleware(Middleware):
    def before_request(self):
        g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
    
    def after_request(self, response):
        response.headers['X-Request-ID'] = g.request_id
        return response

class TimingMiddleware(Middleware):
    def before_request(self):
        g.request_start = time.time()
    
    def after_request(self, response):
        duration = time.time() - g.request_start
        response.headers['X-Response-Time'] = f'{duration:.3f}s'
        return response

def register_middleware(app: Flask, middlewares: List[Middleware]):
    """Register middleware with Flask app."""
    
    @app.before_request
    def before_request():
        for middleware in middlewares:
            middleware.before_request()
    
    @app.after_request
    def after_request(response):
        for middleware in reversed(middlewares):
            response = middleware.after_request(response)
        return response

# Usage
middlewares = [
    RequestIdMiddleware(),
    TimingMiddleware(),
]
register_middleware(app, middlewares)
```
