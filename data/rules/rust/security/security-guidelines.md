# Rust Security Guidelines

## Authentication

### Password Hashing with Argon2
```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

pub struct PasswordService {
    argon2: Argon2<'static>,
}

impl PasswordService {
    pub fn new() -> Self {
        Self {
            argon2: Argon2::default(),
        }
    }

    pub fn hash(&self, password: &str) -> Result<String, Error> {
        let salt = SaltString::generate(&mut OsRng);
        let hash = self
            .argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(hash.to_string())
    }

    pub fn verify(&self, password: &str, hash: &str) -> Result<bool, Error> {
        let parsed_hash = PasswordHash::new(hash)
            .map_err(|e| Error::Internal(e.to_string()))?;
        
        Ok(self.argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
    }
}
```

### JWT Authentication
```rust
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,  // User ID
    pub email: String,
    pub role: String,
    pub exp: usize,   // Expiration timestamp
    pub iat: usize,   // Issued at
}

pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    expiry: Duration,
}

impl JwtService {
    pub fn new(secret: &str, expiry: Duration) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            expiry,
        }
    }

    pub fn generate_token(&self, user: &User) -> Result<String, Error> {
        let now = Utc::now();
        let claims = Claims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            role: user.role.to_string(),
            exp: (now + self.expiry).timestamp() as usize,
            iat: now.timestamp() as usize,
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| Error::Internal(e.to_string()))
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims, Error> {
        let mut validation = Validation::default();
        validation.validate_exp = true;

        decode::<Claims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => Error::TokenExpired,
                _ => Error::InvalidToken,
            })
    }
}
```

### Authentication Middleware (Axum)
```rust
use axum::{
    extract::State,
    http::{header, Request, StatusCode},
    middleware::Next,
    response::Response,
};

pub async fn auth_middleware<B>(
    State(state): State<AppState>,
    mut request: Request<B>,
    next: Next<B>,
) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = state
        .jwt_service
        .validate_token(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Add claims to request extensions
    request.extensions_mut().insert(claims);

    Ok(next.run(request).await)
}

// Extract claims in handlers
pub async fn protected_handler(
    Extension(claims): Extension<Claims>,
) -> impl IntoResponse {
    format!("Hello, user {}", claims.sub)
}
```

## Authorization

### Role-Based Access Control
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    ReadUsers,
    WriteUsers,
    DeleteUsers,
    ReadOrders,
    WriteOrders,
    Admin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Admin,
    Manager,
    User,
    Guest,
}

impl Role {
    pub fn permissions(&self) -> &'static [Permission] {
        match self {
            Role::Admin => &[
                Permission::Admin,
                Permission::ReadUsers,
                Permission::WriteUsers,
                Permission::DeleteUsers,
                Permission::ReadOrders,
                Permission::WriteOrders,
            ],
            Role::Manager => &[
                Permission::ReadUsers,
                Permission::WriteUsers,
                Permission::ReadOrders,
                Permission::WriteOrders,
            ],
            Role::User => &[
                Permission::ReadOrders,
                Permission::WriteOrders,
            ],
            Role::Guest => &[
                Permission::ReadOrders,
            ],
        }
    }

    pub fn has_permission(&self, permission: Permission) -> bool {
        self.permissions().contains(&permission)
    }
}

// Middleware for permission checking
pub fn require_permission(permission: Permission) -> impl Fn(Request<Body>) -> Result<Request<Body>, StatusCode> + Clone {
    move |request: Request<Body>| {
        let claims = request
            .extensions()
            .get::<Claims>()
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let role: Role = claims.role.parse().map_err(|_| StatusCode::FORBIDDEN)?;

        if role.has_permission(permission) {
            Ok(request)
        } else {
            Err(StatusCode::FORBIDDEN)
        }
    }
}
```

## Input Validation

### Using validator crate
```rust
use validator::{Validate, ValidationError};

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 2, max = 100, message = "Name must be 2-100 characters"))]
    pub name: String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    #[validate(custom = "validate_password_strength")]
    pub password: String,
}

fn validate_password_strength(password: &str) -> Result<(), ValidationError> {
    let has_uppercase = password.chars().any(|c| c.is_uppercase());
    let has_lowercase = password.chars().any(|c| c.is_lowercase());
    let has_digit = password.chars().any(|c| c.is_numeric());
    let has_special = password.chars().any(|c| !c.is_alphanumeric());

    if has_uppercase && has_lowercase && has_digit && has_special {
        Ok(())
    } else {
        let mut error = ValidationError::new("password_strength");
        error.message = Some("Password must contain uppercase, lowercase, digit, and special character".into());
        Err(error)
    }
}

// Use in handler
pub async fn create_user(
    Json(payload): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    // Process valid request
}
```

### Custom Validation with NewTypes
```rust
#[derive(Debug, Clone)]
pub struct Email(String);

impl Email {
    pub fn parse(s: impl Into<String>) -> Result<Self, ValidationError> {
        let s = s.into();
        
        // Basic validation
        if s.is_empty() {
            return Err(ValidationError::new("Email cannot be empty"));
        }
        
        if !s.contains('@') {
            return Err(ValidationError::new("Email must contain @"));
        }
        
        let parts: Vec<&str> = s.split('@').collect();
        if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
            return Err(ValidationError::new("Invalid email format"));
        }
        
        if !parts[1].contains('.') {
            return Err(ValidationError::new("Email domain must contain a dot"));
        }
        
        Ok(Self(s.to_lowercase()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for Email {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Email::parse(s).map_err(serde::de::Error::custom)
    }
}
```

## SQL Injection Prevention

```rust
// ❌ Vulnerable - String interpolation
let query = format!("SELECT * FROM users WHERE email = '{}'", email);
sqlx::query(&query).fetch_one(&pool).await?;

// ✅ Safe - Parameterized query with sqlx
let user = sqlx::query_as!(
    User,
    "SELECT * FROM users WHERE email = $1",
    email
)
.fetch_one(&pool)
.await?;

// ✅ Safe - Using query builder
let user = sqlx::query_as::<_, User>(
    "SELECT * FROM users WHERE email = $1 AND active = $2"
)
.bind(&email)
.bind(true)
.fetch_one(&pool)
.await?;

// ✅ Safe - Dynamic queries with sea-query
use sea_query::{Expr, PostgresQueryBuilder, Query};

let (sql, values) = Query::select()
    .columns([Users::Id, Users::Email, Users::Name])
    .from(Users::Table)
    .and_where(Expr::col(Users::Email).eq(&email))
    .and_where(Expr::col(Users::Active).eq(true))
    .build(PostgresQueryBuilder);
```

## Rate Limiting

```rust
use governor::{Quota, RateLimiter};
use std::num::NonZeroU32;

pub struct RateLimiterMiddleware {
    limiter: RateLimiter<String, DashMapStateStore<String>, DefaultClock>,
}

impl RateLimiterMiddleware {
    pub fn new(requests_per_second: u32) -> Self {
        let quota = Quota::per_second(NonZeroU32::new(requests_per_second).unwrap());
        Self {
            limiter: RateLimiter::dashmap(quota),
        }
    }

    pub fn check(&self, key: &str) -> Result<(), Error> {
        self.limiter
            .check_key(&key.to_string())
            .map_err(|_| Error::RateLimited)
    }
}

// Axum middleware
pub async fn rate_limit_middleware<B>(
    State(limiter): State<Arc<RateLimiterMiddleware>>,
    request: Request<B>,
    next: Next<B>,
) -> Result<Response, StatusCode> {
    let ip = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s))
        .unwrap_or("unknown");

    limiter
        .check(ip)
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;

    Ok(next.run(request).await)
}
```

## CORS Configuration

```rust
use tower_http::cors::{Any, CorsLayer};

pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin([
            "https://example.com".parse().unwrap(),
            "https://app.example.com".parse().unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(Duration::from_secs(86400))
        .allow_credentials(true)
}

// Or more permissive for development
pub fn dev_cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
}
```

## Security Headers

```rust
use axum::http::{HeaderValue, Response};
use tower_http::set_header::SetResponseHeaderLayer;

pub fn security_headers_layer() -> tower::ServiceBuilder<...> {
    tower::ServiceBuilder::new()
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_XSS_PROTECTION,
            HeaderValue::from_static("1; mode=block"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'self'"),
        ))
}
```

## Secrets Management

```rust
use secrecy::{ExposeSecret, Secret};

#[derive(Clone)]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Secret<String>,
    pub database: String,
}

impl DatabaseConfig {
    pub fn connection_string(&self) -> Secret<String> {
        Secret::new(format!(
            "postgres://{}:{}@{}:{}/{}",
            self.username,
            self.password.expose_secret(),
            self.host,
            self.port,
            self.database
        ))
    }
}

// Load from environment
impl DatabaseConfig {
    pub fn from_env() -> Result<Self, Error> {
        Ok(Self {
            host: std::env::var("DB_HOST")?,
            port: std::env::var("DB_PORT")?.parse()?,
            username: std::env::var("DB_USER")?,
            password: Secret::new(std::env::var("DB_PASSWORD")?),
            database: std::env::var("DB_NAME")?,
        })
    }
}

// Zeroize sensitive data on drop
use zeroize::Zeroizing;

fn process_password(password: &str) -> Result<String, Error> {
    let mut sensitive = Zeroizing::new(password.to_string());
    let hash = hash_password(&sensitive)?;
    // sensitive is automatically zeroed when dropped
    Ok(hash)
}
```

## Secure File Handling

```rust
use std::path::Path;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES: &[&str] = &["image/jpeg", "image/png", "image/gif", "application/pdf"];

pub async fn upload_file(
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    while let Some(field) = multipart.next_field().await? {
        let content_type = field.content_type().ok_or(AppError::BadRequest("Missing content type"))?;
        
        // Validate MIME type
        if !ALLOWED_MIME_TYPES.contains(&content_type) {
            return Err(AppError::BadRequest("File type not allowed"));
        }

        // Read with size limit
        let data = field.bytes().await?;
        if data.len() as u64 > MAX_FILE_SIZE {
            return Err(AppError::BadRequest("File too large"));
        }

        // Validate magic bytes match claimed type
        let detected_type = infer::get(&data)
            .ok_or(AppError::BadRequest("Could not detect file type"))?;
        
        if detected_type.mime_type() != content_type {
            return Err(AppError::BadRequest("File type mismatch"));
        }

        // Generate safe filename
        let filename = format!("{}.{}", Uuid::new_v4(), detected_type.extension());
        let path = Path::new("uploads").join(&filename);

        // Save file
        tokio::fs::write(&path, &data).await?;

        return Ok(Json(json!({ "filename": filename })));
    }

    Err(AppError::BadRequest("No file provided"))
}
```
