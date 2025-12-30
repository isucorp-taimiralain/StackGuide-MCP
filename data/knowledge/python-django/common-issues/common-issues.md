# Django Common Issues and Solutions

Solutions to frequently encountered problems in Django development.

## Database Issues

### Migration Conflicts

**Problem**: Multiple developers create migrations that conflict.

**Solution**:
```bash
# Merge migrations
python manage.py makemigrations --merge

# Or squash old migrations
python manage.py squashmigrations app_name 0001 0010
```

### Circular Import in Models

**Problem**: Two models reference each other causing import errors.

**Solution**:
```python
# Use string reference for ForeignKey
class Article(models.Model):
    author = models.ForeignKey(
        "users.User",  # String reference
        on_delete=models.CASCADE
    )

# Or use lazy import in methods
def get_related_articles(self):
    from articles.models import Article
    return Article.objects.filter(author=self.author)
```

## Performance Issues

### N+1 Query Problem

**Problem**: Loop causes multiple database queries.

**Solution**:
```python
# Before: N+1 queries
for article in Article.objects.all():
    print(article.author.name)

# After: 1 query with join
for article in Article.objects.select_related("author"):
    print(article.author.name)

# For reverse relations or M2M
Article.objects.prefetch_related("comments", "tags")
```

### Slow QuerySet Evaluation

**Problem**: Large querysets evaluated multiple times.

**Solution**:
```python
# Cache the queryset result
articles = list(Article.objects.all())  # Evaluate once

# Or use iterator for large datasets
for article in Article.objects.iterator(chunk_size=1000):
    process(article)
```

## Authentication Issues

### Custom User Model Not Working

**Problem**: Migrated before creating custom user model.

**Solution**:
```python
# settings.py - Set this BEFORE first migration
AUTH_USER_MODEL = "users.User"

# users/models.py
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    # Custom fields
    phone = models.CharField(max_length=20, blank=True)
```

### Session Not Persisting

**Problem**: User logged out unexpectedly.

**Solution**:
```python
# Check session settings
SESSION_COOKIE_AGE = 1209600  # 2 weeks
SESSION_SAVE_EVERY_REQUEST = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
```

## Static Files Issues

### Static Files Not Loading in Production

**Problem**: Static files 404 in production.

**Solution**:
```python
# settings.py
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Run collectstatic
# python manage.py collectstatic

# Use whitenoise for serving
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # ...
]
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
```

## Form Issues

### Form Not Saving Data

**Problem**: ModelForm save() not persisting to database.

**Solution**:
```python
# Ensure commit=True or call save() on instance
if form.is_valid():
    instance = form.save(commit=False)
    instance.user = request.user  # Add extra data
    instance.save()
    form.save_m2m()  # Save many-to-many relationships
```

### File Upload Not Working

**Problem**: request.FILES is empty.

**Solution**:
```html
<!-- Form must have enctype -->
<form method="post" enctype="multipart/form-data">
    {% csrf_token %}
    {{ form }}
    <button type="submit">Upload</button>
</form>
```

## Celery Issues

### Task Not Executing

**Problem**: Celery task defined but not running.

**Solution**:
```python
# Ensure app is loaded
# config/__init__.py
from .celery import app as celery_app
__all__ = ("celery_app",)

# Register task correctly
from celery import shared_task

@shared_task
def send_email_task(email_id):
    # Task logic
    pass

# Call with .delay() or .apply_async()
send_email_task.delay(email.id)
```
