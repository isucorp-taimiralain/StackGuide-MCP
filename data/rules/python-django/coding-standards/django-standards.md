# Django Coding Standards

Follow these coding standards when developing Django applications.

## Project Structure

```
project/
├── config/                 # Project settings
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   └── wsgi.py
├── apps/                   # Django applications
│   └── app_name/
│       ├── models.py
│       ├── views.py
│       ├── serializers.py
│       ├── urls.py
│       └── tests/
├── templates/
├── static/
└── manage.py
```

## Naming Conventions

- **Models**: Use singular, PascalCase (e.g., `User`, `BlogPost`)
- **Views**: Suffix with purpose (e.g., `UserListView`, `create_user`)
- **URLs**: Use lowercase, hyphens (e.g., `/user-profile/`)
- **Templates**: Use lowercase, underscores (e.g., `user_detail.html`)

## Model Best Practices

```python
from django.db import models
from django.utils.translation import gettext_lazy as _

class BaseModel(models.Model):
    """Abstract base model with common fields."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        abstract = True

class Article(BaseModel):
    title = models.CharField(_("title"), max_length=200)
    slug = models.SlugField(_("slug"), unique=True)
    content = models.TextField(_("content"))
    author = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="articles",
        verbose_name=_("author")
    )
    
    class Meta:
        verbose_name = _("article")
        verbose_name_plural = _("articles")
        ordering = ["-created_at"]
    
    def __str__(self):
        return self.title
```

## View Patterns

Prefer class-based views for complex logic:

```python
from django.views.generic import ListView, DetailView
from django.contrib.auth.mixins import LoginRequiredMixin

class ArticleListView(LoginRequiredMixin, ListView):
    model = Article
    template_name = "articles/list.html"
    context_object_name = "articles"
    paginate_by = 10
    
    def get_queryset(self):
        return super().get_queryset().select_related("author")
```

## Import Order

1. Standard library imports
2. Django imports
3. Third-party imports
4. Local application imports

```python
import json
from datetime import datetime

from django.db import models
from django.utils import timezone

from rest_framework import serializers

from .models import Article
```
