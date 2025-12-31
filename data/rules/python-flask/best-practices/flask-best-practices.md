# Flask Best Practices

## Application Structure

### Use Application Factory
```python
# ✅ Good: Application factory pattern
def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    init_extensions(app)
    register_blueprints(app)
    register_error_handlers(app)
    
    return app

# ❌ Avoid: Global app instance
app = Flask(__name__)  # Hard to test and configure
```

### Organize with Blueprints
```python
# app/views/__init__.py
from flask import Blueprint

# Main blueprint
main_bp = Blueprint('main', __name__)

# API versioned blueprint
api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Nested blueprints
from .users import users_bp
api_v1.register_blueprint(users_bp, url_prefix='/users')
```

## Database Best Practices

### Transaction Management
```python
from app.extensions import db

class UserService:
    @staticmethod
    def create_user_with_profile(user_data, profile_data):
        try:
            user = User(**user_data)
            db.session.add(user)
            db.session.flush()  # Get user.id without committing
            
            profile = Profile(user_id=user.id, **profile_data)
            db.session.add(profile)
            
            db.session.commit()
            return user
        except Exception as e:
            db.session.rollback()
            raise e

# Using context manager
from contextlib import contextmanager

@contextmanager
def transaction():
    try:
        yield db.session
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

# Usage
with transaction():
    user = User(email='test@test.com')
    db.session.add(user)
```

### Query Optimization
```python
# ❌ Avoid: N+1 queries
users = User.query.all()
for user in users:
    print(user.posts)  # Lazy load for each user!

# ✅ Good: Eager loading
from sqlalchemy.orm import joinedload, selectinload

users = User.query.options(selectinload(User.posts)).all()

# ✅ Good: Specific columns
users = db.session.query(User.id, User.name).all()

# ✅ Good: Pagination
page = request.args.get('page', 1, type=int)
users = User.query.paginate(page=page, per_page=20, error_out=False)
```

## Request Handling

### Input Validation
```python
from flask import request, jsonify
from marshmallow import ValidationError

@app.route('/api/users', methods=['POST'])
def create_user():
    # Validate JSON
    if not request.is_json:
        return jsonify({'error': 'Content-Type must be application/json'}), 400
    
    # Validate schema
    try:
        data = UserCreateSchema().load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 422
    
    # Process valid data
    user = UserService.create(data)
    return jsonify(UserSchema().dump(user)), 201
```

### Request Context
```python
from flask import g, request

@app.before_request
def before_request():
    g.request_start = time.time()
    g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))

@app.after_request
def after_request(response):
    duration = time.time() - g.request_start
    response.headers['X-Request-ID'] = g.request_id
    response.headers['X-Response-Time'] = f'{duration:.3f}s'
    return response
```

## Error Handling

### Centralized Error Handlers
```python
from flask import jsonify
from werkzeug.exceptions import HTTPException

def register_error_handlers(app):
    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        response = {
            'error': error.name,
            'message': error.description,
        }
        return jsonify(response), error.code
    
    @app.errorhandler(ValidationError)
    def handle_validation_error(error):
        return jsonify({
            'error': 'Validation Error',
            'messages': error.messages
        }), 422
    
    @app.errorhandler(Exception)
    def handle_exception(error):
        app.logger.error(f'Unhandled exception: {error}', exc_info=True)
        if app.debug:
            raise error
        return jsonify({'error': 'Internal server error'}), 500
```

### Custom Exceptions
```python
class AppException(Exception):
    status_code = 400
    
    def __init__(self, message, status_code=None, payload=None):
        super().__init__()
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload
    
    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        return rv

class NotFoundError(AppException):
    status_code = 404

class UnauthorizedError(AppException):
    status_code = 401

@app.errorhandler(AppException)
def handle_app_exception(error):
    return jsonify(error.to_dict()), error.status_code
```

## Caching

### Flask-Caching Integration
```python
from flask_caching import Cache

cache = Cache()

def create_app():
    app = Flask(__name__)
    cache.init_app(app, config={
        'CACHE_TYPE': 'redis',
        'CACHE_REDIS_URL': 'redis://localhost:6379/0',
        'CACHE_DEFAULT_TIMEOUT': 300,
    })
    return app

# View caching
@app.route('/api/stats')
@cache.cached(timeout=60)
def get_stats():
    return jsonify(compute_stats())

# Memoization
@cache.memoize(timeout=300)
def get_user(user_id):
    return User.query.get(user_id)

# Manual cache control
def update_user(user_id, data):
    user = User.query.get(user_id)
    user.update(data)
    db.session.commit()
    cache.delete_memoized(get_user, user_id)
    return user
```

## Background Tasks

### Celery Integration
```python
# app/tasks/__init__.py
from celery import Celery

celery = Celery()

def init_celery(app):
    celery.conf.update(
        broker_url=app.config['CELERY_BROKER_URL'],
        result_backend=app.config['CELERY_RESULT_BACKEND'],
    )
    
    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)
    
    celery.Task = ContextTask
    return celery

# tasks/email.py
@celery.task
def send_email(to, subject, body):
    with mail.connect() as conn:
        msg = Message(subject=subject, recipients=[to], body=body)
        conn.send(msg)

# Usage
from app.tasks.email import send_email
send_email.delay('user@example.com', 'Welcome', 'Hello!')
```

## Testing

### Test Configuration
```python
# tests/conftest.py
import pytest
from app import create_app, db

@pytest.fixture
def app():
    app = create_app('testing')
    
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def runner(app):
    return app.test_cli_runner()

@pytest.fixture
def auth_client(client, app):
    with app.app_context():
        user = User(email='test@test.com', name='Test')
        user.password = 'password123'
        db.session.add(user)
        db.session.commit()
        
        # Login
        client.post('/auth/login', data={
            'email': 'test@test.com',
            'password': 'password123'
        })
    
    return client
```

### Test Examples
```python
# tests/test_auth.py
def test_login_success(client):
    # Create user first
    response = client.post('/auth/register', data={
        'email': 'test@test.com',
        'name': 'Test User',
        'password': 'Password123',
        'password_confirm': 'Password123'
    })
    
    # Login
    response = client.post('/auth/login', data={
        'email': 'test@test.com',
        'password': 'Password123'
    }, follow_redirects=True)
    
    assert response.status_code == 200
    assert b'Welcome' in response.data

def test_api_requires_auth(client):
    response = client.get('/api/v1/users/')
    assert response.status_code == 401
```

## Logging

### Structured Logging
```python
import logging
from logging.handlers import RotatingFileHandler
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
        }
        if record.exc_info:
            log_record['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_record)

def configure_logging(app):
    handler = RotatingFileHandler(
        'logs/app.log',
        maxBytes=10485760,  # 10MB
        backupCount=10
    )
    handler.setFormatter(JSONFormatter())
    handler.setLevel(logging.INFO)
    
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
```

## Security Headers

### Security Middleware
```python
from flask_talisman import Talisman

def configure_security(app):
    csp = {
        'default-src': "'self'",
        'script-src': "'self'",
        'style-src': "'self' 'unsafe-inline'",
        'img-src': "'self' data: https:",
    }
    
    Talisman(
        app,
        content_security_policy=csp,
        force_https=True,
        strict_transport_security=True,
        session_cookie_secure=True,
        session_cookie_http_only=True,
    )
```

## Performance

### Response Compression
```python
from flask_compress import Compress

compress = Compress()

def create_app():
    app = Flask(__name__)
    compress.init_app(app)
    return app
```

### Connection Pooling
```python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    'postgresql://user:pass@localhost/db',
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
)
```

## API Versioning

```python
# app/views/api/__init__.py
from flask import Blueprint

api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')
api_v2 = Blueprint('api_v2', __name__, url_prefix='/api/v2')

# Register version-specific routes
from .v1 import users as users_v1
from .v2 import users as users_v2

api_v1.register_blueprint(users_v1.bp, url_prefix='/users')
api_v2.register_blueprint(users_v2.bp, url_prefix='/users')
```

## File Uploads

```python
from werkzeug.utils import secure_filename
import os

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}_{filename}"
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
    
    return jsonify({'filename': unique_filename}), 201
```
