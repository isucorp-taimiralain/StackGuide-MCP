# Flask Security Guidelines

## Authentication

### Password Hashing
```python
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    password_hash = db.Column(db.String(255), nullable=False)
    
    @property
    def password(self):
        raise AttributeError('password is not readable')
    
    @password.setter
    def password(self, password):
        # Use strong hashing with salt
        self.password_hash = generate_password_hash(
            password,
            method='pbkdf2:sha256',
            salt_length=16
        )
    
    def verify_password(self, password):
        return check_password_hash(self.password_hash, password)
```

### Session Security
```python
# config.py
class Config:
    # Session configuration
    SECRET_KEY = os.environ.get('SECRET_KEY')  # Must be set!
    SESSION_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True  # No JavaScript access
    SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection
    PERMANENT_SESSION_LIFETIME = timedelta(hours=1)
    
    # For Flask-Login
    REMEMBER_COOKIE_SECURE = True
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_DURATION = timedelta(days=14)
```

### JWT Authentication
```python
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from datetime import timedelta

jwt = JWTManager()

# Configuration
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=15)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)

# Blocklist for revoked tokens
revoked_tokens = set()

@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    jti = jwt_payload['jti']
    return jti in revoked_tokens

@auth_bp.route('/login', methods=['POST'])
def login():
    email = request.json.get('email')
    password = request.json.get('password')
    
    user = User.query.filter_by(email=email).first()
    if not user or not user.verify_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)
    
    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token
    })

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    access_token = create_access_token(identity=identity)
    return jsonify({'access_token': access_token})

@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    jti = get_jwt()['jti']
    revoked_tokens.add(jti)
    return jsonify({'message': 'Logged out'})
```

## CSRF Protection

### Flask-WTF CSRF
```python
from flask_wtf.csrf import CSRFProtect, CSRFError

csrf = CSRFProtect()

def create_app():
    app = Flask(__name__)
    csrf.init_app(app)
    
    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        return jsonify({'error': 'CSRF token missing or invalid'}), 400
    
    return app

# In templates
<form method="post">
    {{ form.csrf_token }}
    <!-- or -->
    <input type="hidden" name="csrf_token" value="{{ csrf_token() }}"/>
</form>

# For AJAX requests
<script>
    const csrfToken = "{{ csrf_token() }}";
    
    fetch('/api/endpoint', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(data)
    });
</script>
```

### Exempt API Routes
```python
# For pure API endpoints using JWT
@csrf.exempt
@api_bp.route('/users', methods=['POST'])
@jwt_required()
def create_user():
    pass
```

## Input Validation

### SQL Injection Prevention
```python
# ❌ NEVER do this - SQL injection vulnerable
@app.route('/search')
def search():
    query = request.args.get('q')
    # Vulnerable!
    result = db.engine.execute(f"SELECT * FROM users WHERE name = '{query}'")

# ✅ Use parameterized queries
from sqlalchemy import text

@app.route('/search')
def search():
    query = request.args.get('q')
    result = db.session.execute(
        text("SELECT * FROM users WHERE name = :name"),
        {'name': query}
    )

# ✅ Better: Use ORM
@app.route('/search')
def search():
    query = request.args.get('q')
    users = User.query.filter(User.name == query).all()
```

### XSS Prevention
```python
# Templates auto-escape by default
# {{ user_input }} is safe

# Mark as safe only when necessary and validated
from markupsafe import Markup, escape

# ❌ Dangerous
{{ user_content|safe }}

# ✅ Escape user content
{{ user_content }}  # Auto-escaped

# ✅ If HTML needed, sanitize first
import bleach

def sanitize_html(content):
    allowed_tags = ['b', 'i', 'u', 'em', 'strong', 'a', 'p']
    allowed_attrs = {'a': ['href', 'title']}
    return bleach.clean(content, tags=allowed_tags, attributes=allowed_attrs)
```

## Rate Limiting

### Flask-Limiter
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

def create_app():
    app = Flask(__name__)
    limiter.init_app(app)
    return app

# Per-route limits
@app.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    pass

@app.route('/api/expensive')
@limiter.limit("10 per minute")
def expensive_operation():
    pass

# Custom key function for authenticated users
def get_rate_limit_key():
    if current_user.is_authenticated:
        return f"user:{current_user.id}"
    return get_remote_address()

@limiter.limit("100 per hour", key_func=get_rate_limit_key)
def api_endpoint():
    pass
```

## Security Headers

### Flask-Talisman
```python
from flask_talisman import Talisman

def configure_security(app):
    csp = {
        'default-src': "'self'",
        'script-src': ["'self'", 'cdn.example.com'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'fonts.googleapis.com'],
        'connect-src': ["'self'"],
        'frame-ancestors': "'none'",
        'form-action': "'self'",
    }
    
    Talisman(
        app,
        content_security_policy=csp,
        content_security_policy_nonce_in=['script-src'],
        force_https=True,
        strict_transport_security=True,
        strict_transport_security_max_age=31536000,
        strict_transport_security_include_subdomains=True,
        session_cookie_secure=True,
        session_cookie_http_only=True,
    )
```

### Manual Headers
```python
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response
```

## File Upload Security

```python
import os
import uuid
import magic
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}
ALLOWED_MIMETYPES = {
    'image/png', 'image/jpeg', 'image/gif', 'application/pdf'
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_file(file):
    # Check filename
    if not file.filename:
        raise ValueError('No filename')
    
    # Check extension
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError('Invalid file extension')
    
    # Check actual file type (not just extension)
    file_content = file.read(2048)
    file.seek(0)
    
    mime = magic.from_buffer(file_content, mime=True)
    if mime not in ALLOWED_MIMETYPES:
        raise ValueError(f'Invalid file type: {mime}')
    
    # Check file size
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    
    if size > MAX_FILE_SIZE:
        raise ValueError('File too large')
    
    return True

@app.route('/upload', methods=['POST'])
@login_required
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    
    file = request.files['file']
    
    try:
        validate_file(file)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    
    # Generate safe filename
    ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    
    # Save outside web root
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    return jsonify({'filename': filename}), 201
```

## Secrets Management

```python
import os

class Config:
    # Never hardcode secrets
    SECRET_KEY = os.environ['SECRET_KEY']
    DATABASE_URL = os.environ['DATABASE_URL']
    JWT_SECRET_KEY = os.environ['JWT_SECRET_KEY']
    
    # Validate at startup
    @classmethod
    def init_app(cls, app):
        required = ['SECRET_KEY', 'DATABASE_URL', 'JWT_SECRET_KEY']
        missing = [key for key in required if not os.environ.get(key)]
        if missing:
            raise RuntimeError(f'Missing environment variables: {missing}')
```

## Logging Security Events

```python
import logging
from flask import request, g
from flask_login import current_user

security_logger = logging.getLogger('security')

def log_security_event(event_type, details=None):
    log_data = {
        'event': event_type,
        'ip': request.remote_addr,
        'user_agent': request.user_agent.string,
        'path': request.path,
        'user_id': current_user.id if current_user.is_authenticated else None,
        'request_id': g.get('request_id'),
        'details': details or {},
    }
    security_logger.info(log_data)

# Usage
@auth_bp.route('/login', methods=['POST'])
def login():
    user = authenticate(request.json)
    if user:
        log_security_event('LOGIN_SUCCESS', {'email': user.email})
        login_user(user)
        return jsonify({'success': True})
    else:
        log_security_event('LOGIN_FAILED', {'email': request.json.get('email')})
        return jsonify({'error': 'Invalid credentials'}), 401
```

## CORS Configuration

```python
from flask_cors import CORS

def configure_cors(app):
    CORS(app, 
        origins=[
            'https://yourdomain.com',
            'https://app.yourdomain.com'
        ],
        methods=['GET', 'POST', 'PUT', 'DELETE'],
        allow_headers=['Content-Type', 'Authorization'],
        expose_headers=['X-Request-ID'],
        supports_credentials=True,
        max_age=600
    )
```

## HTTPS Enforcement

```python
from flask_talisman import Talisman

# Force HTTPS in production
if app.config['ENV'] == 'production':
    Talisman(app, force_https=True)

# Or manually
@app.before_request
def redirect_https():
    if app.config['ENV'] == 'production':
        if not request.is_secure:
            url = request.url.replace('http://', 'https://', 1)
            return redirect(url, code=301)
```
