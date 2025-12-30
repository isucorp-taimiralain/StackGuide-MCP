# Django Best Practices

Essential best practices for building robust Django applications.

## Settings Management

Use environment variables and split settings:

```python
# config/settings/base.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = []

# config/settings/development.py
from .base import *

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
```

## Database Optimization

### Use select_related and prefetch_related

```python
# Bad - N+1 queries
articles = Article.objects.all()
for article in articles:
    print(article.author.name)  # Each iteration queries DB

# Good - Single query with join
articles = Article.objects.select_related("author").all()

# For many-to-many or reverse foreign keys
articles = Article.objects.prefetch_related("tags", "comments").all()
```

### Use QuerySet methods efficiently

```python
# Use exists() instead of count() for existence checks
if Article.objects.filter(slug=slug).exists():
    pass

# Use only() or defer() for partial model loading
Article.objects.only("title", "slug").all()

# Use values() or values_list() when you don't need model instances
Article.objects.values_list("id", "title")
```

## Caching Strategies

```python
from django.core.cache import cache
from django.views.decorators.cache import cache_page

# View caching
@cache_page(60 * 15)  # Cache for 15 minutes
def article_list(request):
    pass

# Low-level caching
def get_article(slug):
    key = f"article:{slug}"
    article = cache.get(key)
    if article is None:
        article = Article.objects.get(slug=slug)
        cache.set(key, article, timeout=3600)
    return article
```

## Form and Validation

```python
from django import forms
from django.core.exceptions import ValidationError

class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ["title", "content", "tags"]
    
    def clean_title(self):
        title = self.cleaned_data["title"]
        if len(title) < 5:
            raise ValidationError("Title must be at least 5 characters.")
        return title
```

## Signals - Use Sparingly

```python
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=Article)
def notify_subscribers(sender, instance, created, **kwargs):
    if created:
        # Send notification
        pass
```

## Custom Managers

```python
class PublishedManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status="published")

class Article(models.Model):
    objects = models.Manager()  # Default manager
    published = PublishedManager()  # Custom manager
```
