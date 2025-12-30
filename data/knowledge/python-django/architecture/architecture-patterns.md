# Django Project Architecture

Recommended architecture patterns for scalable Django applications.

## Layered Architecture

```
┌─────────────────────────────────────┐
│           Presentation              │
│  (Views, Templates, Serializers)    │
├─────────────────────────────────────┤
│            Application              │
│      (Services, Use Cases)          │
├─────────────────────────────────────┤
│             Domain                  │
│   (Models, Business Logic)          │
├─────────────────────────────────────┤
│          Infrastructure             │
│  (Database, External APIs, Cache)   │
└─────────────────────────────────────┘
```

## Service Layer Pattern

Separate business logic from views:

```python
# services/article_service.py
from django.db import transaction
from typing import Optional

class ArticleService:
    def __init__(self):
        self.notification_service = NotificationService()
    
    @transaction.atomic
    def create_article(
        self, 
        author_id: int, 
        title: str, 
        content: str,
        tags: list[str] = None
    ) -> Article:
        """Create article with full business logic."""
        author = User.objects.get(id=author_id)
        
        article = Article.objects.create(
            author=author,
            title=title,
            content=content,
            slug=slugify(title)
        )
        
        if tags:
            article.tags.set(Tag.objects.filter(name__in=tags))
        
        # Side effects
        self.notification_service.notify_followers(author, article)
        
        return article
    
    def publish_article(self, article_id: int) -> Article:
        """Publish an article with validation."""
        article = Article.objects.get(id=article_id)
        
        if article.status == "published":
            raise ValueError("Article already published")
        
        if not article.content:
            raise ValueError("Cannot publish empty article")
        
        article.status = "published"
        article.published_at = timezone.now()
        article.save()
        
        return article
```

## Repository Pattern

Abstract database operations:

```python
# repositories/article_repository.py
from abc import ABC, abstractmethod
from typing import List, Optional

class ArticleRepositoryInterface(ABC):
    @abstractmethod
    def get_by_id(self, id: int) -> Optional[Article]:
        pass
    
    @abstractmethod
    def get_published(self) -> List[Article]:
        pass
    
    @abstractmethod
    def save(self, article: Article) -> Article:
        pass

class DjangoArticleRepository(ArticleRepositoryInterface):
    def get_by_id(self, id: int) -> Optional[Article]:
        try:
            return Article.objects.select_related("author").get(id=id)
        except Article.DoesNotExist:
            return None
    
    def get_published(self) -> List[Article]:
        return list(
            Article.objects
            .filter(status="published")
            .select_related("author")
            .prefetch_related("tags")
            .order_by("-published_at")
        )
    
    def save(self, article: Article) -> Article:
        article.save()
        return article
```

## Domain Events

Decouple components with events:

```python
# events/article_events.py
from dataclasses import dataclass
from datetime import datetime

@dataclass
class ArticlePublishedEvent:
    article_id: int
    author_id: int
    published_at: datetime

# events/handlers.py
from django.dispatch import receiver
from .signals import article_published

@receiver(article_published)
def send_notifications(sender, event: ArticlePublishedEvent, **kwargs):
    NotificationService().notify_subscribers(event)

@receiver(article_published)
def update_search_index(sender, event: ArticlePublishedEvent, **kwargs):
    SearchService().index_article(event.article_id)
```

## Module Structure for Large Apps

```
apps/
├── articles/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── article.py
│   │   └── tag.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── article_service.py
│   ├── repositories/
│   │   ├── __init__.py
│   │   └── article_repository.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── urls.py
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_models.py
│   │   ├── test_services.py
│   │   └── test_api.py
│   └── migrations/
```

## Dependency Injection

```python
# container.py
class Container:
    _instances = {}
    
    @classmethod
    def get_article_service(cls) -> ArticleService:
        if "article_service" not in cls._instances:
            repo = DjangoArticleRepository()
            notification = NotificationService()
            cls._instances["article_service"] = ArticleService(repo, notification)
        return cls._instances["article_service"]

# views.py
class ArticleViewSet(viewsets.ViewSet):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = Container.get_article_service()
```
