# Rust Best Practices

## Error Handling

### Use thiserror for Library Errors
```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("Entity not found: {entity_type} with id {id}")]
    NotFound { entity_type: &'static str, id: String },

    #[error("Duplicate entry: {0}")]
    Duplicate(String),

    #[error("Connection error: {0}")]
    Connection(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

// Conversion to application error
impl From<RepositoryError> for AppError {
    fn from(err: RepositoryError) -> Self {
        match err {
            RepositoryError::NotFound { .. } => AppError::NotFound(err.to_string()),
            RepositoryError::Duplicate(msg) => AppError::Conflict(msg),
            _ => AppError::Internal(err.to_string()),
        }
    }
}
```

### Use anyhow for Applications
```rust
use anyhow::{anyhow, bail, Context, Result};

async fn process_order(order_id: Uuid) -> Result<Order> {
    let order = repository
        .find_by_id(order_id)
        .await
        .context("Failed to fetch order from database")?
        .ok_or_else(|| anyhow!("Order {} not found", order_id))?;

    if !order.can_be_processed() {
        bail!("Order {} cannot be processed: status is {}", order_id, order.status);
    }

    let payment = payment_service
        .charge(&order)
        .await
        .context("Payment processing failed")?;

    Ok(order)
}
```

### Result Extension Methods
```rust
trait ResultExt<T> {
    fn log_error(self, msg: &str) -> Self;
    fn or_not_found(self, entity: &str, id: impl std::fmt::Display) -> Result<T, Error>;
}

impl<T, E: std::fmt::Display> ResultExt<T> for Result<T, E> {
    fn log_error(self, msg: &str) -> Self {
        if let Err(ref e) = self {
            tracing::error!("{}: {}", msg, e);
        }
        self
    }

    fn or_not_found(self, entity: &str, id: impl std::fmt::Display) -> Result<T, Error> {
        self.map_err(|_| Error::NotFound(format!("{} {} not found", entity, id)))
    }
}

impl<T> ResultExt<T> for Option<T> {
    fn or_not_found(self, entity: &str, id: impl std::fmt::Display) -> Result<T, Error> {
        self.ok_or_else(|| Error::NotFound(format!("{} {} not found", entity, id)))
    }
}

// Usage
let user = repository
    .find_by_id(id)
    .await
    .log_error("Database query failed")?
    .or_not_found("User", id)?;
```

## Async Best Practices

### Proper Task Spawning
```rust
use tokio::task::JoinHandle;

// Spawn background task with proper error handling
fn spawn_task<F>(name: &'static str, future: F) -> JoinHandle<()>
where
    F: Future<Output = Result<()>> + Send + 'static,
{
    tokio::spawn(async move {
        if let Err(e) = future.await {
            tracing::error!(task = name, error = %e, "Task failed");
        }
    })
}

// Usage
spawn_task("order_processor", async move {
    process_orders().await
});
```

### Graceful Shutdown
```rust
use tokio::signal;
use tokio::sync::broadcast;

pub async fn run_server(app: Router, addr: SocketAddr) -> Result<()> {
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    
    // Clone for the shutdown handler
    let shutdown_tx_clone = shutdown_tx.clone();
    
    // Spawn shutdown signal handler
    tokio::spawn(async move {
        shutdown_signal().await;
        let _ = shutdown_tx_clone.send(());
        tracing::info!("Shutdown signal received");
    });

    tracing::info!("Starting server on {}", addr);
    
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .with_graceful_shutdown(async {
            let mut rx = shutdown_tx.subscribe();
            let _ = rx.recv().await;
        })
        .await?;

    tracing::info!("Server stopped");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
```

### Concurrent Processing with Limits
```rust
use futures::stream::{self, StreamExt};
use tokio::sync::Semaphore;

async fn process_items_concurrently(
    items: Vec<Item>,
    concurrency: usize,
) -> Vec<Result<ProcessedItem>> {
    stream::iter(items)
        .map(|item| async move {
            process_item(item).await
        })
        .buffer_unordered(concurrency)
        .collect()
        .await
}

// With semaphore for more control
async fn process_with_semaphore(
    items: Vec<Item>,
    semaphore: Arc<Semaphore>,
) -> Vec<Result<ProcessedItem>> {
    let handles: Vec<_> = items
        .into_iter()
        .map(|item| {
            let permit = semaphore.clone();
            tokio::spawn(async move {
                let _permit = permit.acquire().await.unwrap();
                process_item(item).await
            })
        })
        .collect();

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(handle.await.unwrap());
    }
    results
}
```

## Type System Best Practices

### NewType Pattern
```rust
/// Email address with validation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Email(String);

impl Email {
    pub fn new(email: impl Into<String>) -> Result<Self, ValidationError> {
        let email = email.into();
        if !email.contains('@') || email.len() < 5 {
            return Err(ValidationError::InvalidEmail(email));
        }
        Ok(Self(email))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for Email {
    type Error = ValidationError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl From<Email> for String {
    fn from(email: Email) -> String {
        email.0
    }
}

impl std::fmt::Display for Email {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
```

### Builder Pattern
```rust
#[derive(Debug, Clone)]
pub struct Request {
    url: String,
    method: Method,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    timeout: Duration,
}

#[derive(Debug, Default)]
pub struct RequestBuilder {
    url: Option<String>,
    method: Method,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    timeout: Duration,
}

impl RequestBuilder {
    pub fn new() -> Self {
        Self {
            method: Method::GET,
            timeout: Duration::from_secs(30),
            ..Default::default()
        }
    }

    pub fn url(mut self, url: impl Into<String>) -> Self {
        self.url = Some(url.into());
        self
    }

    pub fn method(mut self, method: Method) -> Self {
        self.method = method;
        self
    }

    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }

    pub fn json<T: Serialize>(mut self, body: &T) -> Result<Self, serde_json::Error> {
        self.body = Some(serde_json::to_vec(body)?);
        self.headers.insert("Content-Type".into(), "application/json".into());
        Ok(self)
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn build(self) -> Result<Request, BuilderError> {
        let url = self.url.ok_or(BuilderError::MissingField("url"))?;
        
        Ok(Request {
            url,
            method: self.method,
            headers: self.headers,
            body: self.body,
            timeout: self.timeout,
        })
    }
}
```

### Type State Pattern
```rust
/// Order in draft state (no items required).
pub struct Draft;

/// Order with items (ready for checkout).
pub struct WithItems;

/// Order that has been submitted.
pub struct Submitted;

pub struct Order<State> {
    id: Uuid,
    user_id: Uuid,
    items: Vec<OrderItem>,
    total: Decimal,
    _state: PhantomData<State>,
}

impl Order<Draft> {
    pub fn new(user_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            user_id,
            items: Vec::new(),
            total: Decimal::ZERO,
            _state: PhantomData,
        }
    }

    pub fn add_item(mut self, item: OrderItem) -> Order<WithItems> {
        self.total += item.price * Decimal::from(item.quantity);
        self.items.push(item);
        
        Order {
            id: self.id,
            user_id: self.user_id,
            items: self.items,
            total: self.total,
            _state: PhantomData,
        }
    }
}

impl Order<WithItems> {
    pub fn add_item(mut self, item: OrderItem) -> Self {
        self.total += item.price * Decimal::from(item.quantity);
        self.items.push(item);
        self
    }

    pub fn submit(self) -> Order<Submitted> {
        Order {
            id: self.id,
            user_id: self.user_id,
            items: self.items,
            total: self.total,
            _state: PhantomData,
        }
    }
}

impl Order<Submitted> {
    pub fn id(&self) -> Uuid {
        self.id
    }
}

// Usage - compile-time state enforcement
let order = Order::new(user_id)
    .add_item(item1)
    .add_item(item2)
    .submit();
// order.add_item(item3); // Compile error! Submitted orders can't add items
```

## Testing Best Practices

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn test_user_creation() {
        let user = User::new("test@example.com", "Test User");
        
        assert_eq!(user.email, "test@example.com");
        assert_eq!(user.name, "Test User");
        assert_eq!(user.role, Role::User);
    }

    #[test]
    fn test_email_validation() {
        assert!(Email::new("valid@example.com").is_ok());
        assert!(Email::new("invalid").is_err());
        assert!(Email::new("").is_err());
    }

    #[tokio::test]
    async fn test_async_operation() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

### Integration Tests with Test Fixtures
```rust
// tests/common/mod.rs
use sqlx::PgPool;
use testcontainers::{clients::Cli, images::postgres::Postgres, Container};

pub struct TestContext {
    pub pool: PgPool,
    _container: Container<'static, Postgres>,
}

impl TestContext {
    pub async fn new() -> Self {
        let docker = Cli::default();
        let container = docker.run(Postgres::default());
        
        let connection_string = format!(
            "postgres://postgres:postgres@localhost:{}/postgres",
            container.get_host_port_ipv4(5432)
        );
        
        let pool = PgPool::connect(&connection_string).await.unwrap();
        sqlx::migrate!().run(&pool).await.unwrap();
        
        Self {
            pool,
            _container: container,
        }
    }
}

// tests/user_repository_test.rs
mod common;

use common::TestContext;

#[tokio::test]
async fn test_create_and_find_user() {
    let ctx = TestContext::new().await;
    let repo = PostgresUserRepository::new(ctx.pool.clone());
    
    let user = User::new("test@example.com", "Test");
    repo.save(&user).await.unwrap();
    
    let found = repo.find_by_id(user.id).await.unwrap();
    assert_eq!(found.unwrap().email, "test@example.com");
}
```

### Mock Testing
```rust
use mockall::automock;

#[automock]
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>>;
    async fn save(&self, user: &User) -> Result<()>;
}

#[tokio::test]
async fn test_user_service_register() {
    let mut mock_repo = MockUserRepository::new();
    
    mock_repo
        .expect_find_by_email()
        .with(eq("test@example.com"))
        .returning(|_| Ok(None));
    
    mock_repo
        .expect_save()
        .returning(|_| Ok(()));
    
    let service = UserServiceImpl::new(Arc::new(mock_repo));
    
    let result = service.register(RegisterInput {
        email: "test@example.com".into(),
        name: "Test".into(),
        password: "password123".into(),
    }).await;
    
    assert!(result.is_ok());
}
```

## Performance Best Practices

### Avoid Unnecessary Allocations
```rust
// ❌ Allocates a new String
fn process(data: String) {}

// ✅ Borrows, no allocation
fn process(data: &str) {}

// ✅ Generic over owned and borrowed
fn process(data: impl AsRef<str>) {}

// ❌ Allocates a Vec
fn get_items() -> Vec<Item> {
    self.items.clone()
}

// ✅ Returns iterator
fn get_items(&self) -> impl Iterator<Item = &Item> {
    self.items.iter()
}
```

### Use Cow for Flexible Ownership
```rust
use std::borrow::Cow;

fn process_name(name: Cow<'_, str>) -> String {
    if name.contains(' ') {
        name.into_owned() // Only allocates if modification needed
    } else {
        format!("User: {}", name)
    }
}

// Usage
process_name(Cow::Borrowed("John"));
process_name(Cow::Owned(get_name_from_db()));
```

### Lazy Initialization
```rust
use once_cell::sync::Lazy;

static CONFIG: Lazy<Config> = Lazy::new(|| {
    Config::load().expect("Failed to load config")
});

static REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap()
});
```
