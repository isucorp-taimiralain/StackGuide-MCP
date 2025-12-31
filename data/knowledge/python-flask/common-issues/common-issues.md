# Flask Common Issues and Solutions

## Application Context Issues

### Working Outside of Application Context
**Error:** `RuntimeError: Working outside of application context.`

```python
# ❌ Problem: Accessing app context outside of request
from app import db

def get_users():
    return db.session.query(User).all()  # Error!

# ✅ Solution 1: Use app context
from app import create_app, db

def get_users():
    app = create_app()
    with app.app_context():
        return db.session.query(User).all()

# ✅ Solution 2: In CLI commands
from flask.cli import with_appcontext

@app.cli.command()
@with_appcontext
def my_command():
    users = User.query.all()  # Works!
```

### Working Outside of Request Context
**Error:** `RuntimeError: Working outside of request context.`

```python
# ❌ Problem: Accessing request outside of request
from flask import request

def log_request():
    print(request.url)  # Error if called outside request!

# ✅ Solution: Pass data explicitly
def log_url(url):
    print(url)

@app.route('/example')
def example():
    log_url(request.url)
```

## Database Issues

### Session Not Committed
```python
# ❌ Problem: Changes not saved
@app.route('/create', methods=['POST'])
def create_user():
    user = User(name='Test')
    db.session.add(user)
    # Forgot to commit!
    return jsonify({'id': user.id})  # user.id is None

# ✅ Solution: Always commit
@app.route('/create', methods=['POST'])
def create_user():
    user = User(name='Test')
    db.session.add(user)
    db.session.commit()
    return jsonify({'id': user.id})
```

### DetachedInstanceError
**Error:** `sqlalchemy.orm.exc.DetachedInstanceError: Instance is not bound to a Session`

```python
# ❌ Problem: Accessing lazy-loaded relationship after session closes
def get_user_with_posts(user_id):
    user = User.query.get(user_id)
    return user

user = get_user_with_posts(1)
print(user.posts)  # Error: posts not loaded, session closed

# ✅ Solution 1: Eager load
def get_user_with_posts(user_id):
    return User.query.options(
        db.joinedload(User.posts)
    ).get(user_id)

# ✅ Solution 2: Access within same context
@app.route('/user/<int:user_id>')
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    posts = user.posts  # OK within request context
    return jsonify({
        'name': user.name,
        'posts': [p.title for p in posts]
    })
```

### Object Already Attached to Session
```python
# ❌ Problem: Adding same object twice
user = User.query.get(1)
db.session.add(user)  # Already in session!

# ✅ Solution: Use merge for objects that might be detached
user = User.query.get(1)
user.name = 'New Name'
db.session.merge(user)
db.session.commit()
```

## Blueprint Issues

### Circular Imports
```python
# ❌ Problem: Circular import between blueprints and app
# app/__init__.py
from app.views.auth import auth_bp  # Imports app
app.register_blueprint(auth_bp)

# app/views/auth.py
from app import app  # Imports app again - circular!

# ✅ Solution: Use application factory and current_app
# app/__init__.py
def create_app():
    app = Flask(__name__)
    from app.views.auth import auth_bp
    app.register_blueprint(auth_bp)
    return app

# app/views/auth.py
from flask import Blueprint, current_app

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/config')
def show_config():
    return current_app.config['SECRET_KEY']
```

### Blueprint Not Registering Routes
```python
# ❌ Problem: Routes not working
# views/api.py
api_bp = Blueprint('api', __name__)

@api_bp.route('/users')  # Registered to blueprint
def get_users():
    pass

# But forgot to register blueprint!

# ✅ Solution: Register blueprint
# app/__init__.py
from app.views.api import api_bp
app.register_blueprint(api_bp, url_prefix='/api')
```

## Form Validation Issues

### CSRF Token Missing
**Error:** `The CSRF token is missing.`

```python
# ❌ Problem: Missing CSRF token in form
<form method="post">
    <input type="text" name="name">
    <button type="submit">Submit</button>
</form>

# ✅ Solution: Include CSRF token
<form method="post">
    {{ form.csrf_token }}
    <!-- or -->
    <input type="hidden" name="csrf_token" value="{{ csrf_token() }}">
    <input type="text" name="name">
    <button type="submit">Submit</button>
</form>
```

### Form Not Validating
```python
# ❌ Problem: Form validation fails silently
@app.route('/register', methods=['GET', 'POST'])
def register():
    form = RegisterForm()
    if form.validate_on_submit():
        # Never reaches here
        pass
    return render_template('register.html', form=form)

# ✅ Solution: Check validation errors
@app.route('/register', methods=['GET', 'POST'])
def register():
    form = RegisterForm()
    if form.validate_on_submit():
        # Process form
        pass
    else:
        # Debug: print errors
        print(form.errors)  # Shows what failed
    return render_template('register.html', form=form)
```

## JSON Response Issues

### Returning Non-JSON Data
```python
# ❌ Problem: Returning dict without jsonify
@app.route('/api/user')
def get_user():
    return {'name': 'John'}  # Works in Flask 2.0+ but not earlier

# ✅ Solution: Use jsonify for compatibility
from flask import jsonify

@app.route('/api/user')
def get_user():
    return jsonify({'name': 'John'})
```

### Datetime Serialization
```python
# ❌ Problem: Can't serialize datetime
@app.route('/api/user')
def get_user():
    user = User.query.get(1)
    return jsonify({
        'created_at': user.created_at  # Error!
    })

# ✅ Solution 1: Convert to string
return jsonify({
    'created_at': user.created_at.isoformat()
})

# ✅ Solution 2: Custom JSON encoder
from flask.json import JSONEncoder
from datetime import datetime

class CustomJSONEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

app.json_encoder = CustomJSONEncoder
```

## Authentication Issues

### User Not Logged In After Login
```python
# ❌ Problem: Login doesn't persist
@auth_bp.route('/login', methods=['POST'])
def login():
    user = User.query.filter_by(email=email).first()
    if user and user.check_password(password):
        # Forgot login_user!
        return redirect(url_for('main.index'))

# ✅ Solution: Use login_user
from flask_login import login_user

@auth_bp.route('/login', methods=['POST'])
def login():
    user = User.query.filter_by(email=email).first()
    if user and user.check_password(password):
        login_user(user, remember=True)
        return redirect(url_for('main.index'))
```

### User Loader Not Defined
**Error:** `No user_loader has been installed for this LoginManager`

```python
# ❌ Problem: Missing user_loader
login_manager = LoginManager(app)
# Forgot to define user_loader!

# ✅ Solution: Define user_loader
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
```

## Template Issues

### Template Not Found
**Error:** `jinja2.exceptions.TemplateNotFound`

```python
# ❌ Problem: Wrong template path
# File: app/views/auth/templates/login.html
render_template('login.html')  # Not found!

# ✅ Solution 1: Use correct path
render_template('auth/login.html')

# ✅ Solution 2: Configure template folder in blueprint
auth_bp = Blueprint('auth', __name__, template_folder='templates')
render_template('login.html')  # Now works
```

### Variable Undefined in Template
```python
# ❌ Problem: Variable not passed to template
@app.route('/profile')
def profile():
    user = get_current_user()
    return render_template('profile.html')  # user not passed!

# ✅ Solution: Pass variables
@app.route('/profile')
def profile():
    user = get_current_user()
    return render_template('profile.html', user=user)
```

## Testing Issues

### Test Database Affecting Production
```python
# ❌ Problem: Tests use production database
def test_create_user(client):
    client.post('/users', json={'name': 'Test'})
    # Modifies production database!

# ✅ Solution: Use test configuration
@pytest.fixture
def app():
    app = create_app('testing')  # Use test config
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()
```

### Tests Not Isolated
```python
# ❌ Problem: Tests affect each other
def test_create_user():
    user = User(email='test@test.com')
    db.session.add(user)
    db.session.commit()
    # User persists to next test!

# ✅ Solution: Rollback after each test
@pytest.fixture
def db_session(app):
    with app.app_context():
        connection = db.engine.connect()
        transaction = connection.begin()
        
        yield db.session
        
        transaction.rollback()
        connection.close()
```

## Configuration Issues

### Environment Variables Not Loading
```python
# ❌ Problem: .env not loading
SECRET_KEY = os.environ.get('SECRET_KEY')  # None

# ✅ Solution: Load .env file
from dotenv import load_dotenv

load_dotenv()  # Call before accessing env vars

SECRET_KEY = os.environ.get('SECRET_KEY')
```

### Debug Mode in Production
```python
# ❌ Problem: Debug enabled in production
app.run(debug=True)  # NEVER in production!

# ✅ Solution: Use environment variable
debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
app.run(debug=debug)

# Or use WSGI server in production
# gunicorn app:app
```

## Performance Issues

### N+1 Query Problem
```python
# ❌ Problem: Loading relationships one by one
users = User.query.all()
for user in users:
    print(user.posts)  # Separate query for each user!

# ✅ Solution: Eager loading
from sqlalchemy.orm import joinedload

users = User.query.options(joinedload(User.posts)).all()
for user in users:
    print(user.posts)  # Already loaded!
```

### Response Not Compressed
```python
# ❌ Problem: Large responses sent uncompressed
@app.route('/large-data')
def large_data():
    return jsonify(huge_list)  # Slow for large data

# ✅ Solution: Enable compression
from flask_compress import Compress

compress = Compress()
compress.init_app(app)
```

## File Upload Issues

### File Too Large
```python
# ❌ Problem: Large file crashes server
@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['file']
    # No size limit!

# ✅ Solution: Set max content length
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

# Handle error
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large'}), 413
```

### Insecure Filename
```python
# ❌ Problem: Using user-provided filename
filename = file.filename
file.save(os.path.join(upload_folder, filename))  # Dangerous!

# ✅ Solution: Sanitize filename
from werkzeug.utils import secure_filename
import uuid

filename = secure_filename(file.filename)
unique_filename = f"{uuid.uuid4()}_{filename}"
file.save(os.path.join(upload_folder, unique_filename))
```
