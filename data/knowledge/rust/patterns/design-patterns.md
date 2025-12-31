# Rust Design Patterns

## Creational Patterns

### Factory Pattern
```rust
use std::sync::Arc;

pub trait Database: Send + Sync {
    fn connect(&self) -> Result<(), Error>;
    fn query(&self, sql: &str) -> Result<Vec<Row>, Error>;
}

pub struct PostgresDatabase {
    connection_string: String,
}

pub struct SqliteDatabase {
    path: String,
}

impl Database for PostgresDatabase {
    fn connect(&self) -> Result<(), Error> {
        // PostgreSQL connection logic
        Ok(())
    }

    fn query(&self, sql: &str) -> Result<Vec<Row>, Error> {
        // PostgreSQL query logic
        Ok(vec![])
    }
}

impl Database for SqliteDatabase {
    fn connect(&self) -> Result<(), Error> {
        // SQLite connection logic
        Ok(())
    }

    fn query(&self, sql: &str) -> Result<Vec<Row>, Error> {
        // SQLite query logic
        Ok(vec![])
    }
}

#[derive(Debug, Clone, Copy)]
pub enum DatabaseType {
    Postgres,
    Sqlite,
}

pub struct DatabaseFactory;

impl DatabaseFactory {
    pub fn create(db_type: DatabaseType, config: &Config) -> Arc<dyn Database> {
        match db_type {
            DatabaseType::Postgres => Arc::new(PostgresDatabase {
                connection_string: config.postgres_url.clone(),
            }),
            DatabaseType::Sqlite => Arc::new(SqliteDatabase {
                path: config.sqlite_path.clone(),
            }),
        }
    }
}

// Usage
let db = DatabaseFactory::create(DatabaseType::Postgres, &config);
db.connect()?;
```

### Builder Pattern
```rust
#[derive(Debug, Clone)]
pub struct HttpClient {
    base_url: String,
    timeout: Duration,
    headers: HashMap<String, String>,
    retries: u32,
    pool_size: u32,
}

#[derive(Default)]
pub struct HttpClientBuilder {
    base_url: Option<String>,
    timeout: Option<Duration>,
    headers: HashMap<String, String>,
    retries: Option<u32>,
    pool_size: Option<u32>,
}

impl HttpClientBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }

    pub fn retries(mut self, count: u32) -> Self {
        self.retries = Some(count);
        self
    }

    pub fn pool_size(mut self, size: u32) -> Self {
        self.pool_size = Some(size);
        self
    }

    pub fn build(self) -> Result<HttpClient, BuilderError> {
        let base_url = self.base_url.ok_or(BuilderError::MissingField("base_url"))?;

        Ok(HttpClient {
            base_url,
            timeout: self.timeout.unwrap_or(Duration::from_secs(30)),
            headers: self.headers,
            retries: self.retries.unwrap_or(3),
            pool_size: self.pool_size.unwrap_or(10),
        })
    }
}

// Usage
let client = HttpClientBuilder::new()
    .base_url("https://api.example.com")
    .timeout(Duration::from_secs(10))
    .header("Authorization", "Bearer token")
    .retries(5)
    .build()?;
```

### Options Pattern (Functional Options)
```rust
pub struct Server {
    addr: SocketAddr,
    read_timeout: Duration,
    write_timeout: Duration,
    max_connections: usize,
    tls_config: Option<TlsConfig>,
}

pub struct ServerOptions {
    read_timeout: Duration,
    write_timeout: Duration,
    max_connections: usize,
    tls_config: Option<TlsConfig>,
}

impl Default for ServerOptions {
    fn default() -> Self {
        Self {
            read_timeout: Duration::from_secs(30),
            write_timeout: Duration::from_secs(30),
            max_connections: 1000,
            tls_config: None,
        }
    }
}

impl Server {
    pub fn new<F>(addr: SocketAddr, configure: F) -> Self
    where
        F: FnOnce(&mut ServerOptions),
    {
        let mut options = ServerOptions::default();
        configure(&mut options);

        Self {
            addr,
            read_timeout: options.read_timeout,
            write_timeout: options.write_timeout,
            max_connections: options.max_connections,
            tls_config: options.tls_config,
        }
    }
}

// Usage
let server = Server::new("127.0.0.1:8080".parse().unwrap(), |opts| {
    opts.read_timeout = Duration::from_secs(60);
    opts.max_connections = 5000;
    opts.tls_config = Some(TlsConfig::from_pem("cert.pem", "key.pem"));
});
```

## Structural Patterns

### Adapter Pattern
```rust
// External library type
pub struct ExternalPaymentProvider {
    api_key: String,
}

impl ExternalPaymentProvider {
    pub fn process_transaction(&self, amount: f64, currency: &str) -> Result<String, String> {
        // External API call
        Ok("txn_123".to_string())
    }
}

// Our domain interface
#[async_trait]
pub trait PaymentGateway: Send + Sync {
    async fn charge(&self, amount: Money, customer_id: &str) -> Result<PaymentResult, PaymentError>;
}

// Adapter
pub struct ExternalPaymentAdapter {
    provider: ExternalPaymentProvider,
}

impl ExternalPaymentAdapter {
    pub fn new(api_key: String) -> Self {
        Self {
            provider: ExternalPaymentProvider { api_key },
        }
    }
}

#[async_trait]
impl PaymentGateway for ExternalPaymentAdapter {
    async fn charge(&self, amount: Money, customer_id: &str) -> Result<PaymentResult, PaymentError> {
        let result = self.provider
            .process_transaction(amount.as_f64(), amount.currency())
            .map_err(|e| PaymentError::Provider(e))?;

        Ok(PaymentResult {
            transaction_id: result,
            status: PaymentStatus::Completed,
            amount,
        })
    }
}
```

### Decorator Pattern
```rust
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, Error>;
    async fn save(&self, user: &User) -> Result<(), Error>;
}

/// Caching decorator for UserRepository
pub struct CachingUserRepository<R: UserRepository> {
    inner: R,
    cache: Arc<dyn Cache>,
    ttl: Duration,
}

impl<R: UserRepository> CachingUserRepository<R> {
    pub fn new(inner: R, cache: Arc<dyn Cache>, ttl: Duration) -> Self {
        Self { inner, cache, ttl }
    }
}

#[async_trait]
impl<R: UserRepository> UserRepository for CachingUserRepository<R> {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, Error> {
        let cache_key = format!("user:{}", id);

        // Check cache first
        if let Some(cached) = self.cache.get(&cache_key).await? {
            return Ok(Some(cached));
        }

        // Fallback to database
        let user = self.inner.find_by_id(id).await?;

        // Cache the result
        if let Some(ref u) = user {
            self.cache.set(&cache_key, u, self.ttl).await?;
        }

        Ok(user)
    }

    async fn save(&self, user: &User) -> Result<(), Error> {
        // Invalidate cache
        let cache_key = format!("user:{}", user.id);
        self.cache.delete(&cache_key).await?;

        // Save to database
        self.inner.save(user).await
    }
}

/// Logging decorator
pub struct LoggingUserRepository<R: UserRepository> {
    inner: R,
}

#[async_trait]
impl<R: UserRepository> UserRepository for LoggingUserRepository<R> {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, Error> {
        tracing::debug!("Finding user by id: {}", id);
        let start = Instant::now();
        
        let result = self.inner.find_by_id(id).await;
        
        tracing::debug!("find_by_id took {:?}", start.elapsed());
        result
    }

    async fn save(&self, user: &User) -> Result<(), Error> {
        tracing::debug!("Saving user: {}", user.id);
        self.inner.save(user).await
    }
}

// Compose decorators
let repo = PostgresUserRepository::new(pool);
let cached = CachingUserRepository::new(repo, cache, Duration::from_secs(300));
let logged = LoggingUserRepository::new(cached);
```

## Behavioral Patterns

### Strategy Pattern
```rust
pub trait PricingStrategy: Send + Sync {
    fn calculate(&self, base_price: Decimal, quantity: u32) -> Decimal;
}

pub struct RegularPricing;

impl PricingStrategy for RegularPricing {
    fn calculate(&self, base_price: Decimal, quantity: u32) -> Decimal {
        base_price * Decimal::from(quantity)
    }
}

pub struct BulkDiscountPricing {
    threshold: u32,
    discount_percent: Decimal,
}

impl PricingStrategy for BulkDiscountPricing {
    fn calculate(&self, base_price: Decimal, quantity: u32) -> Decimal {
        let total = base_price * Decimal::from(quantity);
        if quantity >= self.threshold {
            total * (Decimal::ONE - self.discount_percent / Decimal::from(100))
        } else {
            total
        }
    }
}

pub struct PremiumPricing {
    discount_percent: Decimal,
}

impl PricingStrategy for PremiumPricing {
    fn calculate(&self, base_price: Decimal, quantity: u32) -> Decimal {
        let total = base_price * Decimal::from(quantity);
        total * (Decimal::ONE - self.discount_percent / Decimal::from(100))
    }
}

pub struct OrderCalculator {
    strategy: Box<dyn PricingStrategy>,
}

impl OrderCalculator {
    pub fn new(strategy: Box<dyn PricingStrategy>) -> Self {
        Self { strategy }
    }

    pub fn set_strategy(&mut self, strategy: Box<dyn PricingStrategy>) {
        self.strategy = strategy;
    }

    pub fn calculate_total(&self, items: &[OrderItem]) -> Decimal {
        items
            .iter()
            .map(|item| self.strategy.calculate(item.price, item.quantity))
            .sum()
    }
}
```

### Observer Pattern (Event Emitter)
```rust
use std::collections::HashMap;
use tokio::sync::RwLock;

type Listener<T> = Box<dyn Fn(&T) + Send + Sync>;

pub struct EventEmitter<T> {
    listeners: RwLock<HashMap<String, Vec<Listener<T>>>>,
}

impl<T> EventEmitter<T> {
    pub fn new() -> Self {
        Self {
            listeners: RwLock::new(HashMap::new()),
        }
    }

    pub async fn on<F>(&self, event: &str, listener: F)
    where
        F: Fn(&T) + Send + Sync + 'static,
    {
        let mut listeners = self.listeners.write().await;
        listeners
            .entry(event.to_string())
            .or_default()
            .push(Box::new(listener));
    }

    pub async fn emit(&self, event: &str, data: &T) {
        let listeners = self.listeners.read().await;
        if let Some(handlers) = listeners.get(event) {
            for handler in handlers {
                handler(data);
            }
        }
    }
}

// Usage with async handlers
#[async_trait]
pub trait AsyncEventHandler<T>: Send + Sync {
    async fn handle(&self, event: &T);
}

pub struct AsyncEventEmitter<T: Send + Sync> {
    handlers: RwLock<Vec<Arc<dyn AsyncEventHandler<T>>>>,
}

impl<T: Send + Sync> AsyncEventEmitter<T> {
    pub async fn subscribe(&self, handler: Arc<dyn AsyncEventHandler<T>>) {
        let mut handlers = self.handlers.write().await;
        handlers.push(handler);
    }

    pub async fn emit(&self, event: &T) {
        let handlers = self.handlers.read().await;
        for handler in handlers.iter() {
            handler.handle(event).await;
        }
    }
}
```

### Pipeline Pattern
```rust
use std::future::Future;
use std::pin::Pin;

type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait Stage<I, O>: Send + Sync {
    fn process(&self, input: I) -> BoxFuture<'_, Result<O, PipelineError>>;
}

pub struct Pipeline<I, O> {
    stages: Vec<Box<dyn Stage<I, O>>>,
}

// Composable pipeline with different types
pub struct ValidationStage;

impl Stage<RawOrder, ValidatedOrder> for ValidationStage {
    fn process(&self, input: RawOrder) -> BoxFuture<'_, Result<ValidatedOrder, PipelineError>> {
        Box::pin(async move {
            // Validate order
            Ok(ValidatedOrder::from(input))
        })
    }
}

pub struct EnrichmentStage {
    user_service: Arc<dyn UserService>,
}

impl Stage<ValidatedOrder, EnrichedOrder> for EnrichmentStage {
    fn process(&self, input: ValidatedOrder) -> BoxFuture<'_, Result<EnrichedOrder, PipelineError>> {
        Box::pin(async move {
            let user = self.user_service.get(input.user_id).await?;
            Ok(EnrichedOrder { order: input, user })
        })
    }
}

// Simpler pipeline with same type
pub struct TransformPipeline<T> {
    transforms: Vec<Box<dyn Fn(T) -> Result<T, Error> + Send + Sync>>,
}

impl<T> TransformPipeline<T> {
    pub fn new() -> Self {
        Self { transforms: Vec::new() }
    }

    pub fn add<F>(mut self, transform: F) -> Self
    where
        F: Fn(T) -> Result<T, Error> + Send + Sync + 'static,
    {
        self.transforms.push(Box::new(transform));
        self
    }

    pub fn execute(self, input: T) -> Result<T, Error> {
        self.transforms.into_iter().try_fold(input, |acc, f| f(acc))
    }
}

// Usage
let result = TransformPipeline::new()
    .add(|data| validate(data))
    .add(|data| transform(data))
    .add(|data| enrich(data))
    .execute(input)?;
```

## Rust-Specific Patterns

### Result Pattern (Railway-Oriented)
```rust
pub trait ResultExt<T, E> {
    fn and_then_async<U, F, Fut>(self, f: F) -> BoxFuture<'static, Result<U, E>>
    where
        F: FnOnce(T) -> Fut + Send + 'static,
        Fut: Future<Output = Result<U, E>> + Send + 'static,
        T: Send + 'static,
        E: Send + 'static,
        U: Send + 'static;
}

impl<T, E> ResultExt<T, E> for Result<T, E> {
    fn and_then_async<U, F, Fut>(self, f: F) -> BoxFuture<'static, Result<U, E>>
    where
        F: FnOnce(T) -> Fut + Send + 'static,
        Fut: Future<Output = Result<U, E>> + Send + 'static,
        T: Send + 'static,
        E: Send + 'static,
        U: Send + 'static,
    {
        Box::pin(async move {
            match self {
                Ok(v) => f(v).await,
                Err(e) => Err(e),
            }
        })
    }
}

// Chain async operations
async fn process_order(order_id: Uuid) -> Result<Receipt, Error> {
    find_order(order_id)
        .await
        .and_then_async(|order| validate_inventory(order))
        .await?
        .and_then_async(|order| process_payment(order))
        .await?
        .and_then_async(|order| ship_order(order))
        .await
}
```

### Extension Trait Pattern
```rust
pub trait StringExt {
    fn truncate_with_ellipsis(&self, max_len: usize) -> String;
    fn to_slug(&self) -> String;
}

impl StringExt for str {
    fn truncate_with_ellipsis(&self, max_len: usize) -> String {
        if self.len() <= max_len {
            self.to_string()
        } else {
            format!("{}...", &self[..max_len.saturating_sub(3)])
        }
    }

    fn to_slug(&self) -> String {
        self.to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-")
    }
}

// Usage
let title = "Hello, World!";
println!("{}", title.to_slug()); // "hello-world"
```

### Interior Mutability Pattern
```rust
use std::cell::RefCell;
use std::sync::{Arc, Mutex, RwLock};

// Single-threaded interior mutability
pub struct Counter {
    count: RefCell<u32>,
}

impl Counter {
    pub fn new() -> Self {
        Self { count: RefCell::new(0) }
    }

    pub fn increment(&self) {
        *self.count.borrow_mut() += 1;
    }

    pub fn get(&self) -> u32 {
        *self.count.borrow()
    }
}

// Thread-safe with Mutex
pub struct SharedCounter {
    count: Mutex<u32>,
}

impl SharedCounter {
    pub fn new() -> Self {
        Self { count: Mutex::new(0) }
    }

    pub fn increment(&self) {
        let mut count = self.count.lock().unwrap();
        *count += 1;
    }
}

// Read-heavy with RwLock
pub struct Cache<K, V> {
    data: RwLock<HashMap<K, V>>,
}

impl<K: Eq + Hash, V: Clone> Cache<K, V> {
    pub fn get(&self, key: &K) -> Option<V> {
        self.data.read().unwrap().get(key).cloned()
    }

    pub fn insert(&self, key: K, value: V) {
        self.data.write().unwrap().insert(key, value);
    }
}
```
