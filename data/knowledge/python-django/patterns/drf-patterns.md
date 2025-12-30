# Django REST Framework Patterns

Common patterns for building APIs with Django REST Framework.

## Serializer Patterns

### Nested Serializers

```python
from rest_framework import serializers

class AuthorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Author
        fields = ["id", "name", "email"]

class ArticleSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    author_id = serializers.PrimaryKeyRelatedField(
        queryset=Author.objects.all(),
        write_only=True,
        source="author"
    )
    
    class Meta:
        model = Article
        fields = ["id", "title", "content", "author", "author_id"]
```

### Dynamic Serializers

```python
class DynamicFieldsSerializer(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        fields = kwargs.pop("fields", None)
        super().__init__(*args, **kwargs)
        
        if fields is not None:
            allowed = set(fields)
            existing = set(self.fields)
            for field_name in existing - allowed:
                self.fields.pop(field_name)
```

## ViewSet Patterns

### Custom Actions

```python
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        article = self.get_object()
        article.status = "published"
        article.published_at = timezone.now()
        article.save()
        return Response({"status": "published"})
    
    @action(detail=False, methods=["get"])
    def recent(self, request):
        recent = self.queryset.order_by("-created_at")[:5]
        serializer = self.get_serializer(recent, many=True)
        return Response(serializer.data)
```

## Filtering and Pagination

```python
from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "author", "category"]
    search_fields = ["title", "content"]
    ordering_fields = ["created_at", "title"]
    ordering = ["-created_at"]
```

## Authentication and Permissions

```python
from rest_framework.permissions import IsAuthenticated, IsAdminUser

class ArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        if self.action in ["create", "update", "destroy"]:
            return [IsAdminUser()]
        return super().get_permissions()
```

## Error Handling

```python
from rest_framework.views import exception_handler
from rest_framework.response import Response

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    
    if response is not None:
        response.data["status_code"] = response.status_code
        response.data["error_type"] = exc.__class__.__name__
    
    return response
```

## API Versioning

```python
# settings.py
REST_FRAMEWORK = {
    "DEFAULT_VERSIONING_CLASS": "rest_framework.versioning.URLPathVersioning",
    "DEFAULT_VERSION": "v1",
    "ALLOWED_VERSIONS": ["v1", "v2"],
}

# urls.py
urlpatterns = [
    path("api/<version>/", include("api.urls")),
]
```
