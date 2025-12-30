# Django Security Guidelines

Critical security practices for Django applications.

## CRITICAL: Security Checklist

- [ ] SECRET_KEY is kept secret and rotated
- [ ] DEBUG is False in production
- [ ] ALLOWED_HOSTS is properly configured
- [ ] HTTPS is enforced
- [ ] CSRF protection is enabled
- [ ] SQL injection is prevented (use ORM)
- [ ] XSS protection is enabled

## Settings for Production

```python
# config/settings/production.py

DEBUG = False
ALLOWED_HOSTS = ["yourdomain.com", "www.yourdomain.com"]

# Security settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# HTTPS settings
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Cookie settings
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
```

## Authentication Security

```python
# Strong password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", 
     "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Rate limiting login attempts
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=15)
```

## SQL Injection Prevention

```python
# ALWAYS use ORM or parameterized queries

# DANGEROUS - Never do this!
query = f"SELECT * FROM articles WHERE id = {user_input}"

# SAFE - Use ORM
Article.objects.filter(id=user_input)

# SAFE - Parameterized raw query if needed
Article.objects.raw("SELECT * FROM articles WHERE id = %s", [user_input])
```

## XSS Prevention

```html
<!-- Django auto-escapes by default -->
{{ user_input }}

<!-- Be careful with safe filter -->
{{ user_input|safe }}  <!-- Only use with trusted content -->

<!-- Use bleach for user HTML -->
{{ user_input|bleach }}
```

## CSRF Protection

```html
<!-- Always include in forms -->
<form method="post">
    {% csrf_token %}
    ...
</form>
```

```python
# For AJAX requests
from django.views.decorators.csrf import ensure_csrf_cookie

@ensure_csrf_cookie
def get_csrf_token(request):
    return JsonResponse({"status": "ok"})
```

## File Upload Security

```python
import os
from django.core.exceptions import ValidationError

def validate_file_extension(value):
    ext = os.path.splitext(value.name)[1].lower()
    valid_extensions = [".pdf", ".doc", ".docx"]
    if ext not in valid_extensions:
        raise ValidationError("Unsupported file extension.")

def validate_file_size(value):
    limit = 5 * 1024 * 1024  # 5MB
    if value.size > limit:
        raise ValidationError("File too large.")

class Document(models.Model):
    file = models.FileField(
        upload_to="documents/",
        validators=[validate_file_extension, validate_file_size]
    )
```

## Sensitive Data

```python
# Never log sensitive data
import logging
logger = logging.getLogger(__name__)

# BAD
logger.info(f"User {user.email} logged in with password {password}")

# GOOD
logger.info(f"User {user.id} logged in successfully")

# Use Django's signing for tokens
from django.core.signing import Signer
signer = Signer()
signed_value = signer.sign("my-data")
```
