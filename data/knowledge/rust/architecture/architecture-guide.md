# Rust Architecture Guide

## Clean Architecture

```
src/
├── main.rs                 # Entry point, wiring
├── config.rs               # Configuration
├── error.rs                # Application errors
│
├── domain/                 # Core business logic (innermost layer)
│   ├── mod.rs
│   ├── entities/
│   │   ├── mod.rs
│   │   ├── user.rs         # User entity
│   │   └── order.rs        # Order entity
│   ├── value_objects/
│   │   ├── mod.rs
│   │   ├── email.rs        # Email value object
│   │   └── money.rs        # Money value object
│   └── services/
│       ├── mod.rs
│       └── pricing.rs      # Domain service
│
├── application/            # Use cases layer
│   ├── mod.rs
│   ├── ports/              # Abstract interfaces
│   │   ├── mod.rs
│   │   ├── user_repository.rs
│   │   └── payment_gateway.rs
│   └── use_cases/
│       ├── mod.rs
│       ├── register_user.rs
│       └── create_order.rs
│
├── infrastructure/         # External implementations
│   ├── mod.rs
│   ├── persistence/
│   │   ├── mod.rs
│   │   ├── postgres/
│   │   │   ├── mod.rs
│   │   │   └── user_repository.rs
│   │   └── redis/
│   │       └── cache.rs
│   └── external/
│       ├── mod.rs
│       └── stripe_gateway.rs
│
└── api/                    # Presentation layer
    ├── mod.rs
    ├── routes.rs
    ├── handlers/
    │   ├── mod.rs
    │   ├── user_handlers.rs
    │   └── order_handlers.rs
    └── middleware/
        ├── mod.rs
        └── auth.rs
```

### Domain Layer Implementation
```rust
// domain/entities/user.rs
use uuid::Uuid;
use crate::domain::value_objects::Email;

#[derive(Debug, Clone)]
pub struct User {
    id: UserId,
    email: Email,
    name: String,
    status: UserStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(Uuid);

impl UserId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UserStatus {
    Pending,
    Active,
    Suspended,
}

impl User {
    pub fn new(email: Email, name: String) -> Self {
        Self {
            id: UserId::new(),
            email,
            name,
            status: UserStatus::Pending,
        }
    }

    pub fn activate(&mut self) -> Result<(), DomainError> {
        match self.status {
            UserStatus::Pending => {
                self.status = UserStatus::Active;
                Ok(())
            }
            _ => Err(DomainError::InvalidStateTransition),
        }
    }

    pub fn id(&self) -> UserId {
        self.id
    }

    pub fn email(&self) -> &Email {
        &self.email
    }
}
```

### Application Layer (Use Cases)
```rust
// application/ports/user_repository.rs
use async_trait::async_trait;
use crate::domain::entities::{User, UserId};

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: UserId) -> Result<Option<User>, RepositoryError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, RepositoryError>;
    async fn save(&self, user: &User) -> Result<(), RepositoryError>;
}

// application/use_cases/register_user.rs
use crate::application::ports::UserRepository;
use crate::domain::{entities::User, value_objects::Email};

pub struct RegisterUserInput {
    pub email: String,
    pub name: String,
    pub password: String,
}

pub struct RegisterUserOutput {
    pub user_id: String,
    pub email: String,
}

pub struct RegisterUserUseCase<R: UserRepository> {
    user_repository: R,
}

impl<R: UserRepository> RegisterUserUseCase<R> {
    pub fn new(user_repository: R) -> Self {
        Self { user_repository }
    }

    pub async fn execute(&self, input: RegisterUserInput) -> Result<RegisterUserOutput, UseCaseError> {
        // Validate email
        let email = Email::parse(&input.email)
            .map_err(|_| UseCaseError::Validation("Invalid email".into()))?;

        // Check if user exists
        if self.user_repository.find_by_email(&input.email).await?.is_some() {
            return Err(UseCaseError::Conflict("Email already registered".into()));
        }

        // Create user
        let user = User::new(email, input.name);

        // Persist
        self.user_repository.save(&user).await?;

        Ok(RegisterUserOutput {
            user_id: user.id().to_string(),
            email: user.email().to_string(),
        })
    }
}
```

## Hexagonal Architecture (Ports and Adapters)

```
src/
├── lib.rs
├── core/                   # Business logic
│   ├── mod.rs
│   ├── domain.rs           # Entities and value objects
│   └── services.rs         # Domain services
│
├── ports/                  # Abstract interfaces
│   ├── mod.rs
│   ├── inbound/            # Primary/driving ports
│   │   ├── mod.rs
│   │   └── user_service.rs
│   └── outbound/           # Secondary/driven ports
│       ├── mod.rs
│       ├── user_store.rs
│       └── notifier.rs
│
└── adapters/               # Concrete implementations
    ├── mod.rs
    ├── inbound/            # Primary/driving adapters
    │   ├── mod.rs
    │   ├── http/
    │   │   ├── mod.rs
    │   │   └── handlers.rs
    │   └── grpc/
    │       └── service.rs
    └── outbound/           # Secondary/driven adapters
        ├── mod.rs
        ├── postgres/
        │   └── user_store.rs
        └── email/
            └── notifier.rs
```

### Port Definition
```rust
// ports/inbound/user_service.rs
use async_trait::async_trait;

#[async_trait]
pub trait UserService: Send + Sync {
    async fn register(&self, input: RegisterInput) -> Result<UserDto, ServiceError>;
    async fn authenticate(&self, email: &str, password: &str) -> Result<TokenPair, ServiceError>;
    async fn get_profile(&self, user_id: &str) -> Result<UserDto, ServiceError>;
}

// ports/outbound/user_store.rs
#[async_trait]
pub trait UserStore: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Result<Option<User>, StoreError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, StoreError>;
    async fn create(&self, user: &User) -> Result<(), StoreError>;
    async fn update(&self, user: &User) -> Result<(), StoreError>;
}

// ports/outbound/notifier.rs
#[async_trait]
pub trait Notifier: Send + Sync {
    async fn send_welcome_email(&self, user: &User) -> Result<(), NotifierError>;
    async fn send_password_reset(&self, user: &User, token: &str) -> Result<(), NotifierError>;
}
```

### Adapter Implementation
```rust
// adapters/outbound/postgres/user_store.rs
use sqlx::PgPool;
use crate::ports::outbound::UserStore;

pub struct PostgresUserStore {
    pool: PgPool,
}

impl PostgresUserStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserStore for PostgresUserStore {
    async fn find_by_id(&self, id: &str) -> Result<Option<User>, StoreError> {
        let uuid = Uuid::parse_str(id).map_err(|_| StoreError::InvalidId)?;
        
        let user = sqlx::query_as!(
            UserRow,
            "SELECT * FROM users WHERE id = $1",
            uuid
        )
        .fetch_optional(&self.pool)
        .await?
        .map(User::from);

        Ok(user)
    }

    async fn create(&self, user: &User) -> Result<(), StoreError> {
        sqlx::query!(
            "INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
            user.id,
            user.email,
            user.name,
            user.password_hash,
            user.created_at
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
```

## Event-Driven Architecture

```rust
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

// Event definitions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DomainEvent {
    UserRegistered(UserRegisteredEvent),
    OrderCreated(OrderCreatedEvent),
    PaymentProcessed(PaymentProcessedEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRegisteredEvent {
    pub user_id: String,
    pub email: String,
    pub timestamp: DateTime<Utc>,
}

// Event bus
pub struct EventBus {
    sender: broadcast::Sender<DomainEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn publish(&self, event: DomainEvent) {
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<DomainEvent> {
        self.sender.subscribe()
    }
}

// Event handler trait
#[async_trait]
pub trait EventHandler: Send + Sync {
    async fn handle(&self, event: &DomainEvent) -> Result<(), HandlerError>;
    fn handles(&self, event: &DomainEvent) -> bool;
}

// Concrete handler
pub struct WelcomeEmailHandler {
    email_service: Arc<dyn EmailService>,
}

#[async_trait]
impl EventHandler for WelcomeEmailHandler {
    fn handles(&self, event: &DomainEvent) -> bool {
        matches!(event, DomainEvent::UserRegistered(_))
    }

    async fn handle(&self, event: &DomainEvent) -> Result<(), HandlerError> {
        if let DomainEvent::UserRegistered(e) = event {
            self.email_service
                .send_welcome(&e.email)
                .await
                .map_err(|e| HandlerError::External(e.to_string()))?;
        }
        Ok(())
    }
}

// Event dispatcher
pub struct EventDispatcher {
    handlers: Vec<Arc<dyn EventHandler>>,
    bus: Arc<EventBus>,
}

impl EventDispatcher {
    pub fn new(bus: Arc<EventBus>) -> Self {
        Self {
            handlers: Vec::new(),
            bus,
        }
    }

    pub fn register(&mut self, handler: Arc<dyn EventHandler>) {
        self.handlers.push(handler);
    }

    pub async fn start(&self) {
        let mut receiver = self.bus.subscribe();
        let handlers = self.handlers.clone();

        tokio::spawn(async move {
            while let Ok(event) = receiver.recv().await {
                for handler in &handlers {
                    if handler.handles(&event) {
                        if let Err(e) = handler.handle(&event).await {
                            tracing::error!("Handler error: {:?}", e);
                        }
                    }
                }
            }
        });
    }
}
```

## CQRS Pattern

```rust
// Command side
mod commands {
    #[derive(Debug)]
    pub struct CreateOrder {
        pub user_id: String,
        pub items: Vec<OrderItem>,
    }

    #[async_trait]
    pub trait CommandHandler<C, R> {
        async fn handle(&self, command: C) -> Result<R, CommandError>;
    }

    pub struct CreateOrderHandler {
        order_repository: Arc<dyn OrderRepository>,
        event_bus: Arc<EventBus>,
    }

    #[async_trait]
    impl CommandHandler<CreateOrder, String> for CreateOrderHandler {
        async fn handle(&self, cmd: CreateOrder) -> Result<String, CommandError> {
            let order = Order::new(cmd.user_id, cmd.items);
            self.order_repository.save(&order).await?;
            
            self.event_bus.publish(DomainEvent::OrderCreated(OrderCreatedEvent {
                order_id: order.id.to_string(),
                user_id: order.user_id.clone(),
                total: order.total,
                timestamp: Utc::now(),
            }));
            
            Ok(order.id.to_string())
        }
    }
}

// Query side
mod queries {
    #[derive(Debug)]
    pub struct GetOrderById {
        pub order_id: String,
    }

    #[async_trait]
    pub trait QueryHandler<Q, R> {
        async fn handle(&self, query: Q) -> Result<R, QueryError>;
    }

    pub struct GetOrderByIdHandler {
        read_db: Arc<dyn OrderReadModel>,
    }

    #[async_trait]
    impl QueryHandler<GetOrderById, OrderView> for GetOrderByIdHandler {
        async fn handle(&self, query: GetOrderById) -> Result<OrderView, QueryError> {
            self.read_db
                .find_by_id(&query.order_id)
                .await?
                .ok_or(QueryError::NotFound)
        }
    }
}
```

## Middleware Chain Pattern

```rust
use axum::{
    http::Request,
    middleware::{self, Next},
    response::Response,
};

pub async fn logging_middleware<B>(
    request: Request<B>,
    next: Next<B>,
) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let start = Instant::now();

    tracing::info!("Started {} {}", method, uri);

    let response = next.run(request).await;

    let duration = start.elapsed();
    tracing::info!(
        "Completed {} {} with {} in {:?}",
        method,
        uri,
        response.status(),
        duration
    );

    response
}

pub async fn request_id_middleware<B>(
    mut request: Request<B>,
    next: Next<B>,
) -> Response {
    let request_id = request
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    request.extensions_mut().insert(RequestId(request_id.clone()));

    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "x-request-id",
        request_id.parse().unwrap(),
    );

    response
}

// Apply middleware chain
pub fn create_router(state: AppState) -> Router {
    Router::new()
        .nest("/api", api_routes())
        .layer(middleware::from_fn(logging_middleware))
        .layer(middleware::from_fn(request_id_middleware))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state)
}
```
