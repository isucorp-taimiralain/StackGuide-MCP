# Flask Coding Standards

## Project Structure

### Recommended Directory Layout
```
project/
├── app/
│   ├── __init__.py          # Application factory
│   ├── extensions.py         # Flask extensions
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   └── post.py
│   ├── views/                # Blueprints
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── auth.py
│   │   └── api/
│   │       ├── __init__.py
│   │       └── users.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── user_service.py
│   ├── templates/
│   │   ├── base.html
│   │   └── auth/
│   │       └── login.html
│   ├── static/
│   │   ├── css/
│   │   └── js/
│   └── utils/
│       ├── __init__.py
│       └── helpers.py
├── config.py
├── migrations/
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_auth.py
├── requirements.txt
└── run.py
```

## Application Factory

### Basic Factory Pattern
```python
# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager

from config import config

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()

def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    
    # Register blueprints
    from app.views.main import main_bp
    from app.views.auth import auth_bp
    from app.views.api import api_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(api_bp, url_prefix='/api/v1')
    
    # Register error handlers
    register_error_handlers(app)
    
    return app

def register_error_handlers(app):
    @app.errorhandler(404)
    def not_found(error):
        return {'error': 'Not found'}, 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return {'error': 'Internal server error'}, 500
```

## Configuration

### Config Classes
```python
# config.py
import os
from datetime import timedelta

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Session
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    
    # Security
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    @staticmethod
    def init_app(app):
        pass

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///dev.db'
    SESSION_COOKIE_SECURE = False

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False

class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    
    @classmethod
    def init_app(cls, app):
        Config.init_app(app)
        
        # Log to stderr
        import logging
        from logging import StreamHandler
        handler = StreamHandler()
        handler.setLevel(logging.INFO)
        app.logger.addHandler(handler)

config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
```

## Blueprints

### Blueprint Definition
```python
# app/views/auth.py
from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from app.models.user import User
from app.extensions import db
from app.forms.auth import LoginForm, RegisterForm

auth_bp = Blueprint('auth', __name__, template_folder='templates')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data.lower()).first()
        if user and user.verify_password(form.password.data):
            login_user(user, remember=form.remember.data)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('main.index'))
        flash('Invalid email or password', 'error')
    
    return render_template('auth/login.html', form=form)

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index'))

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    form = RegisterForm()
    if form.validate_on_submit():
        user = User(
            email=form.email.data.lower(),
            name=form.name.data,
        )
        user.password = form.password.data
        db.session.add(user)
        db.session.commit()
        flash('Registration successful!', 'success')
        return redirect(url_for('auth.login'))
    
    return render_template('auth/register.html', form=form)
```

## API Blueprints

### RESTful API Pattern
```python
# app/views/api/users.py
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from marshmallow import ValidationError

from app.models.user import User
from app.schemas.user import UserSchema, UserCreateSchema
from app.services.user_service import UserService
from app.extensions import db

users_bp = Blueprint('users', __name__)
user_schema = UserSchema()
users_schema = UserSchema(many=True)

@users_bp.route('/', methods=['GET'])
@login_required
def list_users():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    pagination = User.query.paginate(
        page=page,
        per_page=min(per_page, 100),
        error_out=False
    )
    
    return jsonify({
        'items': users_schema.dump(pagination.items),
        'total': pagination.total,
        'page': page,
        'pages': pagination.pages,
    })

@users_bp.route('/<int:user_id>', methods=['GET'])
@login_required
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    return jsonify(user_schema.dump(user))

@users_bp.route('/', methods=['POST'])
@login_required
def create_user():
    try:
        data = UserCreateSchema().load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 400
    
    user = UserService.create_user(data)
    return jsonify(user_schema.dump(user)), 201

@users_bp.route('/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    
    try:
        data = UserSchema(partial=True).load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    user = UserService.update_user(user, data)
    return jsonify(user_schema.dump(user))

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return '', 204
```

## Models

### SQLAlchemy Model
```python
# app/models/user.py
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from app.extensions import db, login_manager

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    role = db.Column(db.String(20), default='user')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    posts = db.relationship('Post', backref='author', lazy='dynamic',
                           cascade='all, delete-orphan')
    
    @property
    def password(self):
        raise AttributeError('password is not a readable attribute')
    
    @password.setter
    def password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def verify_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        return self.role == 'admin'
    
    def __repr__(self):
        return f'<User {self.email}>'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
```

## Forms

### WTForms Integration
```python
# app/forms/auth.py
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import (
    DataRequired, Email, Length, EqualTo, ValidationError, Regexp
)
from app.models.user import User

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[
        DataRequired(),
        Email()
    ])
    password = PasswordField('Password', validators=[
        DataRequired()
    ])
    remember = BooleanField('Remember Me')
    submit = SubmitField('Log In')

class RegisterForm(FlaskForm):
    email = StringField('Email', validators=[
        DataRequired(),
        Email(),
        Length(max=255)
    ])
    name = StringField('Name', validators=[
        DataRequired(),
        Length(min=2, max=100)
    ])
    password = PasswordField('Password', validators=[
        DataRequired(),
        Length(min=8, max=128),
        Regexp(
            r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)',
            message='Password must contain uppercase, lowercase, and number'
        )
    ])
    password_confirm = PasswordField('Confirm Password', validators=[
        DataRequired(),
        EqualTo('password', message='Passwords must match')
    ])
    submit = SubmitField('Register')
    
    def validate_email(self, field):
        if User.query.filter_by(email=field.data.lower()).first():
            raise ValidationError('Email already registered.')
```

## Schemas (Marshmallow)

### Serialization Schemas
```python
# app/schemas/user.py
from marshmallow import Schema, fields, validate, post_load

class UserSchema(Schema):
    id = fields.Int(dump_only=True)
    email = fields.Email(required=True)
    name = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    is_active = fields.Bool(dump_only=True)
    role = fields.Str(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    
    class Meta:
        ordered = True

class UserCreateSchema(Schema):
    email = fields.Email(required=True)
    name = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    password = fields.Str(
        required=True,
        load_only=True,
        validate=validate.Length(min=8, max=128)
    )

class UserUpdateSchema(Schema):
    name = fields.Str(validate=validate.Length(min=2, max=100))
    email = fields.Email()
```

## Decorators

### Custom Decorators
```python
# app/utils/decorators.py
from functools import wraps
from flask import jsonify, request, current_app
from flask_login import current_user

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401
        if not current_user.is_admin():
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

def json_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        return f(*args, **kwargs)
    return decorated_function

def rate_limit(limit=100, per=60):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Implement rate limiting logic
            return f(*args, **kwargs)
        return decorated_function
    return decorator
```

## Context Processors

```python
# app/__init__.py
def create_app(config_name='default'):
    app = Flask(__name__)
    # ... initialization ...
    
    @app.context_processor
    def utility_processor():
        return {
            'app_name': app.config.get('APP_NAME', 'Flask App'),
            'current_year': datetime.utcnow().year,
        }
    
    @app.template_filter('datetime')
    def format_datetime(value, format='%Y-%m-%d %H:%M'):
        if value is None:
            return ''
        return value.strftime(format)
    
    return app
```

## CLI Commands

```python
# app/cli.py
import click
from flask.cli import with_appcontext
from app.extensions import db
from app.models.user import User

def register_commands(app):
    @app.cli.command()
    @with_appcontext
    def init_db():
        """Initialize the database."""
        db.create_all()
        click.echo('Database initialized.')
    
    @app.cli.command()
    @click.argument('email')
    @click.argument('password')
    @with_appcontext
    def create_admin(email, password):
        """Create an admin user."""
        user = User(email=email, name='Admin', role='admin')
        user.password = password
        db.session.add(user)
        db.session.commit()
        click.echo(f'Admin user {email} created.')
```
