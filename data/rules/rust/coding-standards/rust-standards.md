# Rust Coding Standards

## Project Structure

### Binary Application
```
myapp/
├── Cargo.toml              # Project manifest
├── Cargo.lock              # Dependency lock file
├── src/
│   ├── main.rs             # Binary entry point
│   ├── lib.rs              # Library entry point (optional)
│   ├── config.rs           # Configuration
│   ├── error.rs            # Custom error types
│   ├── api/
│   │   ├── mod.rs          # Module declaration
│   │   ├── handlers.rs     # HTTP handlers
│   │   ├── routes.rs       # Route definitions
│   │   └── middleware.rs   # Middleware
│   ├── domain/
│   │   ├── mod.rs
│   │   ├── user.rs         # User entity and logic
│   │   └── order.rs        # Order entity and logic
│   ├── repository/
│   │   ├── mod.rs
│   │   └── postgres.rs     # Database implementations
│   └── services/
│       ├── mod.rs
│       └── user_service.rs
├── tests/                  # Integration tests
│   └── integration_test.rs
├── benches/                # Benchmarks
│   └── benchmark.rs
└── examples/               # Example usage
    └── basic_usage.rs
```

### Library Crate
```
mylib/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Library root
│   ├── error.rs            # Public error types
│   ├── types.rs            # Public types
│   └── internal/           # Private implementation
│       └── mod.rs
└── tests/
    └── integration_test.rs
```

## Naming Conventions

```rust
// Modules and files - snake_case
mod user_service;
mod http_client;

// Types (structs, enums, traits) - PascalCase
struct UserAccount;
enum PaymentStatus;
trait Serializable;

// Functions and methods - snake_case
fn calculate_total() {}
fn process_payment() {}

// Variables and parameters - snake_case
let user_id = 42;
let is_active = true;

// Constants - SCREAMING_SNAKE_CASE
const MAX_CONNECTIONS: usize = 100;
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

// Static variables - SCREAMING_SNAKE_CASE
static GLOBAL_CONFIG: Lazy<Config> = Lazy::new(|| Config::load());

// Type parameters - single uppercase letter or PascalCase
fn process<T>(item: T) {}
fn transform<Input, Output>(input: Input) -> Output {}

// Lifetimes - short lowercase, typically 'a, 'b
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {}
```

## Structs and Implementations

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A user in the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    /// Unique identifier
    pub id: Uuid,
    /// User's email address
    pub email: String,
    /// Display name
    pub name: String,
    #[serde(skip_serializing)]
    password_hash: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    User,
    Guest,
}

impl User {
    /// Creates a new user with the given email and name.
    pub fn new(email: impl Into<String>, name: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            email: email.into(),
            name: name.into(),
            password_hash: String::new(),
            role: Role::User,
            created_at: now,
            updated_at: now,
        }
    }

    /// Sets the user's password (hashed).
    pub fn set_password(&mut self, password: &str) -> Result<(), Error> {
        let hash = hash_password(password)?;
        self.password_hash = hash;
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Verifies the provided password.
    pub fn verify_password(&self, password: &str) -> bool {
        verify_password(password, &self.password_hash).unwrap_or(false)
    }

    /// Checks if user has admin privileges.
    pub fn is_admin(&self) -> bool {
        self.role == Role::Admin
    }
}

impl Default for User {
    fn default() -> Self {
        Self::new("", "")
    }
}
```

## Error Handling

```rust
use thiserror::Error;

/// Custom error types for the application.
#[derive(Debug, Error)]
pub enum Error {
    #[error("User not found: {0}")]
    UserNotFound(Uuid),

    #[error("Email already exists: {0}")]
    EmailExists(String),

    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl Error {
    /// Returns the appropriate HTTP status code for this error.
    pub fn status_code(&self) -> StatusCode {
        match self {
            Error::UserNotFound(_) => StatusCode::NOT_FOUND,
            Error::EmailExists(_) => StatusCode::CONFLICT,
            Error::InvalidCredentials => StatusCode::UNAUTHORIZED,
            Error::Validation(_) => StatusCode::BAD_REQUEST,
            Error::Database(_) | Error::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

// Result type alias for convenience
pub type Result<T> = std::result::Result<T, Error>;
```

## Traits

```rust
use async_trait::async_trait;

/// Repository trait for user persistence.
#[async_trait]
pub trait UserRepository: Send + Sync {
    /// Finds a user by ID.
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>>;
    
    /// Finds a user by email.
    async fn find_by_email(&self, email: &str) -> Result<Option<User>>;
    
    /// Saves a new user.
    async fn save(&self, user: &User) -> Result<()>;
    
    /// Updates an existing user.
    async fn update(&self, user: &User) -> Result<()>;
    
    /// Deletes a user by ID.
    async fn delete(&self, id: Uuid) -> Result<bool>;
    
    /// Lists users with pagination.
    async fn list(&self, page: u32, per_page: u32) -> Result<Vec<User>>;
}

/// Service trait for user business logic.
#[async_trait]
pub trait UserService: Send + Sync {
    async fn register(&self, input: RegisterInput) -> Result<User>;
    async fn get_by_id(&self, id: Uuid) -> Result<User>;
    async fn update(&self, id: Uuid, input: UpdateInput) -> Result<User>;
    async fn delete(&self, id: Uuid) -> Result<()>;
}
```

## HTTP Handlers (Axum)

```rust
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    pub user_service: Arc<dyn UserService>,
}

/// Request body for creating a user.
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

/// Response body for user endpoints.
#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            name: user.name,
            created_at: user.created_at,
        }
    }
}

/// Creates a new user.
pub async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user = state
        .user_service
        .register(RegisterInput {
            email: req.email,
            name: req.name,
            password: req.password,
        })
        .await?;

    Ok((StatusCode::CREATED, Json(UserResponse::from(user))))
}

/// Gets a user by ID.
pub async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<UserResponse>, AppError> {
    let user = state.user_service.get_by_id(id).await?;
    Ok(Json(UserResponse::from(user)))
}

/// Lists users with pagination.
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_per_page")]
    pub per_page: u32,
}

fn default_page() -> u32 { 1 }
fn default_per_page() -> u32 { 20 }

pub async fn list_users(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let users = state.user_service.list(query.page, query.per_page).await?;
    let responses: Vec<UserResponse> = users.into_iter().map(Into::into).collect();
    Ok(Json(responses))
}
```

## Routing

```rust
use axum::{middleware, Router};
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
};

pub fn create_router(state: AppState) -> Router {
    let api_routes = Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/:id", get(get_user).put(update_user).delete(delete_user))
        .route("/orders", get(list_orders).post(create_order))
        .route("/orders/:id", get(get_order));

    let protected_routes = api_routes
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    let public_routes = Router::new()
        .route("/health", get(health_check))
        .route("/auth/login", post(login))
        .route("/auth/register", post(register));

    Router::new()
        .nest("/api/v1", protected_routes)
        .merge(public_routes)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}
```

## Configuration

```rust
use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub server: ServerSettings,
    pub database: DatabaseSettings,
    pub jwt: JwtSettings,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
    #[serde(with = "humantime_serde")]
    pub timeout: Duration,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseSettings {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JwtSettings {
    pub secret: String,
    #[serde(with = "humantime_serde")]
    pub expiry: Duration,
}

impl Settings {
    pub fn load() -> Result<Self, ConfigError> {
        let run_mode = std::env::var("RUN_MODE").unwrap_or_else(|_| "development".into());

        let settings = Config::builder()
            // Start with default config
            .add_source(File::with_name("config/default"))
            // Add environment-specific config
            .add_source(File::with_name(&format!("config/{}", run_mode)).required(false))
            // Override with environment variables (e.g., APP_SERVER__PORT)
            .add_source(
                Environment::with_prefix("APP")
                    .prefix_separator("_")
                    .separator("__"),
            )
            .build()?;

        settings.try_deserialize()
    }
}
```

## Database (SQLx)

```rust
use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn create_pool(settings: &DatabaseSettings) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(settings.max_connections)
        .min_connections(settings.min_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&settings.url)
        .await
}

/// PostgreSQL implementation of UserRepository.
pub struct PostgresUserRepository {
    pool: PgPool,
}

impl PostgresUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query_as!(
            User,
            r#"
            SELECT id, email, name, password_hash, role as "role: Role",
                   created_at, updated_at
            FROM users
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    async fn save(&self, user: &User) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
            user.id,
            user.email,
            user.name,
            user.password_hash,
            user.role as Role,
            user.created_at,
            user.updated_at
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
```
