# Rust Common Issues and Solutions

## Ownership and Borrowing Issues

### Cannot Move Out of Borrowed Content
```rust
// ❌ Error: cannot move out of borrowed content
fn get_first(items: &Vec<String>) -> String {
    items[0] // Tries to move String out of borrowed Vec
}

// ✅ Solution 1: Return a reference
fn get_first(items: &Vec<String>) -> &String {
    &items[0]
}

// ✅ Solution 2: Clone if needed
fn get_first(items: &Vec<String>) -> String {
    items[0].clone()
}

// ✅ Solution 3: Take ownership
fn get_first(mut items: Vec<String>) -> String {
    items.remove(0)
}
```

### Cannot Borrow as Mutable More Than Once
```rust
// ❌ Error: cannot borrow as mutable more than once
fn update_both(data: &mut Data) {
    let a = &mut data.field_a;
    let b = &mut data.field_b; // Error if trying to use 'a' after this
    *a += 1;
    *b += 1;
}

// ✅ Solution 1: Separate the borrows
fn update_both(data: &mut Data) {
    data.field_a += 1;
    data.field_b += 1;
}

// ✅ Solution 2: Use split borrowing
fn update_both(data: &mut Data) {
    let Data { field_a, field_b, .. } = data;
    *field_a += 1;
    *field_b += 1;
}

// ✅ Solution 3: Use interior mutability for complex cases
use std::cell::RefCell;

struct Data {
    field_a: RefCell<i32>,
    field_b: RefCell<i32>,
}

fn update_both(data: &Data) {
    *data.field_a.borrow_mut() += 1;
    *data.field_b.borrow_mut() += 1;
}
```

### Borrowed Value Does Not Live Long Enough
```rust
// ❌ Error: borrowed value does not live long enough
fn get_ref() -> &String {
    let s = String::from("hello");
    &s // s is dropped here, returning dangling reference
}

// ✅ Solution 1: Return owned value
fn get_owned() -> String {
    String::from("hello")
}

// ✅ Solution 2: Accept a reference and return with same lifetime
fn get_ref<'a>(s: &'a String) -> &'a str {
    &s[..]
}

// ✅ Solution 3: Use static lifetime for constants
fn get_static() -> &'static str {
    "hello"
}
```

## Lifetime Issues

### Missing Lifetime Specifier
```rust
// ❌ Error: missing lifetime specifier
struct Parser {
    input: &str,
}

// ✅ Solution: Add lifetime annotation
struct Parser<'a> {
    input: &'a str,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input }
    }

    fn parse(&self) -> &'a str {
        self.input
    }
}
```

### Conflicting Lifetimes
```rust
// ❌ May cause issues with lifetime constraints
struct Container<'a> {
    data: &'a str,
    callback: Box<dyn Fn(&str) + 'a>,
}

// ✅ Solution: Use 'static for callbacks when appropriate
struct Container<'a> {
    data: &'a str,
    callback: Box<dyn Fn(&str) + 'static>,
}

// ✅ Or use separate lifetime parameters
struct Container<'a, 'b> {
    data: &'a str,
    callback: Box<dyn Fn(&str) + 'b>,
}
```

## Async Issues

### Future Does Not Implement Send
```rust
// ❌ Error: future is not Send
use std::rc::Rc;

async fn not_send() {
    let rc = Rc::new(42);
    some_async_fn().await;
    println!("{}", rc);
}

// ✅ Solution: Use Arc instead of Rc
use std::sync::Arc;

async fn is_send() {
    let arc = Arc::new(42);
    some_async_fn().await;
    println!("{}", arc);
}

// ✅ Solution: Drop non-Send types before await
async fn also_works() {
    {
        let rc = Rc::new(42);
        println!("{}", rc);
    } // rc dropped here
    some_async_fn().await;
}
```

### Holding Lock Across Await
```rust
// ❌ Bad: MutexGuard held across await point
async fn bad_lock_usage(data: Arc<Mutex<Vec<i32>>>) {
    let mut guard = data.lock().unwrap();
    guard.push(1);
    some_async_fn().await; // Guard still held!
    guard.push(2);
}

// ✅ Solution: Release lock before await
async fn good_lock_usage(data: Arc<Mutex<Vec<i32>>>) {
    {
        let mut guard = data.lock().unwrap();
        guard.push(1);
    } // Guard dropped here
    
    some_async_fn().await;
    
    {
        let mut guard = data.lock().unwrap();
        guard.push(2);
    }
}

// ✅ Solution: Use tokio::sync::Mutex for async contexts
use tokio::sync::Mutex;

async fn async_lock_usage(data: Arc<Mutex<Vec<i32>>>) {
    let mut guard = data.lock().await;
    guard.push(1);
    // Can hold across await with tokio Mutex
    some_async_fn().await;
    guard.push(2);
}
```

### Recursive Async Functions
```rust
// ❌ Error: recursion in async fn requires boxing
async fn recursive(n: u32) -> u32 {
    if n == 0 {
        return 0;
    }
    recursive(n - 1).await + n
}

// ✅ Solution: Box the recursive call
use futures::future::BoxFuture;

fn recursive(n: u32) -> BoxFuture<'static, u32> {
    Box::pin(async move {
        if n == 0 {
            return 0;
        }
        recursive(n - 1).await + n
    })
}

// ✅ Alternative: Use async_recursion crate
use async_recursion::async_recursion;

#[async_recursion]
async fn recursive(n: u32) -> u32 {
    if n == 0 {
        return 0;
    }
    recursive(n - 1).await + n
}
```

## Trait Issues

### Trait Objects and Sized
```rust
// ❌ Error: trait cannot be made into an object
trait NotObjectSafe {
    fn generic_method<T>(&self, item: T);
    fn returns_self(&self) -> Self;
}

// ✅ Solution: Remove generic methods or use associated types
trait ObjectSafe {
    fn method(&self, item: &dyn std::any::Any);
    fn clone_box(&self) -> Box<dyn ObjectSafe>;
}

// ✅ For Self-returning methods, use a workaround
trait Clonable: Clone {
    fn clone_boxed(&self) -> Box<dyn Clonable>;
}

impl<T: Clone + Clonable + 'static> Clonable for T {
    fn clone_boxed(&self) -> Box<dyn Clonable> {
        Box::new(self.clone())
    }
}
```

### Associated Type vs Generic
```rust
// When to use associated types
trait Iterator {
    type Item;  // One implementation per type
    fn next(&mut self) -> Option<Self::Item>;
}

// When to use generics
trait From<T> {  // Multiple implementations possible
    fn from(value: T) -> Self;
}

// Combining both
trait Converter {
    type Output;
    fn convert<T: Into<Self::Output>>(&self, input: T) -> Self::Output;
}
```

## Error Handling Issues

### The ? Operator with Different Error Types
```rust
// ❌ Error: different error types
fn process() -> Result<(), MyError> {
    let file = std::fs::read_to_string("file.txt")?; // io::Error
    let data: Data = serde_json::from_str(&file)?;   // serde_json::Error
    Ok(())
}

// ✅ Solution 1: Use thiserror
use thiserror::Error;

#[derive(Debug, Error)]
enum MyError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

fn process() -> Result<(), MyError> {
    let file = std::fs::read_to_string("file.txt")?;
    let data: Data = serde_json::from_str(&file)?;
    Ok(())
}

// ✅ Solution 2: Use anyhow for applications
use anyhow::Result;

fn process() -> Result<()> {
    let file = std::fs::read_to_string("file.txt")?;
    let data: Data = serde_json::from_str(&file)?;
    Ok(())
}

// ✅ Solution 3: Map errors explicitly
fn process() -> Result<(), MyError> {
    let file = std::fs::read_to_string("file.txt")
        .map_err(MyError::Io)?;
    let data: Data = serde_json::from_str(&file)
        .map_err(MyError::Json)?;
    Ok(())
}
```

### Option and Result Chaining
```rust
// ❌ Verbose nested matching
fn process(id: Option<u32>) -> Result<User, Error> {
    match id {
        Some(id) => {
            match find_user(id) {
                Some(user) => {
                    if user.is_active {
                        Ok(user)
                    } else {
                        Err(Error::Inactive)
                    }
                }
                None => Err(Error::NotFound),
            }
        }
        None => Err(Error::MissingId),
    }
}

// ✅ Clean chaining
fn process(id: Option<u32>) -> Result<User, Error> {
    id.ok_or(Error::MissingId)
        .and_then(|id| find_user(id).ok_or(Error::NotFound))
        .and_then(|user| {
            if user.is_active {
                Ok(user)
            } else {
                Err(Error::Inactive)
            }
        })
}

// ✅ Using filter
fn process(id: Option<u32>) -> Result<User, Error> {
    id.ok_or(Error::MissingId)?
        .pipe(find_user)
        .filter(|u| u.is_active)
        .ok_or(Error::NotFound)
}
```

## Serialization Issues

### Serde with Private Fields
```rust
// ❌ Can't deserialize to fields with validation
#[derive(Deserialize)]
struct User {
    email: Email,  // Email has validation in constructor
}

// ✅ Solution: Custom deserialization
impl<'de> Deserialize<'de> for Email {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Email::parse(&s).map_err(serde::de::Error::custom)
    }
}

// ✅ Solution: Use serde attributes
#[derive(Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
struct Email(String);

impl TryFrom<String> for Email {
    type Error = ValidationError;
    
    fn try_from(s: String) -> Result<Self, Self::Error> {
        Email::parse(s)
    }
}

impl From<Email> for String {
    fn from(email: Email) -> String {
        email.0
    }
}
```

### Optional Fields with Default
```rust
#[derive(Deserialize)]
struct Config {
    #[serde(default)]
    port: u16,  // Uses Default trait (0)
    
    #[serde(default = "default_host")]
    host: String,
    
    #[serde(default, skip_serializing_if = "Option::is_none")]
    debug: Option<bool>,
}

fn default_host() -> String {
    "localhost".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 8080,
            host: "localhost".to_string(),
            debug: None,
        }
    }
}
```

## Database Issues (SQLx)

### Type Mismatch with Database
```rust
// ❌ Error: mismatched types in query_as
#[derive(sqlx::FromRow)]
struct User {
    id: i32,           // Database has INTEGER
    created_at: String, // Database has TIMESTAMP
}

// ✅ Solution: Use correct types
#[derive(sqlx::FromRow)]
struct User {
    id: i64,  // SQLite INTEGER is i64
    created_at: chrono::DateTime<Utc>,
}

// ✅ Solution: Use type overrides
let user = sqlx::query_as!(
    User,
    r#"SELECT id, created_at as "created_at: _" FROM users WHERE id = $1"#,
    id
).fetch_one(&pool).await?;
```

### Nullable Columns
```rust
// ❌ Error: column can be NULL but field is not Option
#[derive(sqlx::FromRow)]
struct User {
    id: i64,
    nickname: String,  // Database allows NULL
}

// ✅ Solution: Use Option for nullable columns
#[derive(sqlx::FromRow)]
struct User {
    id: i64,
    nickname: Option<String>,
}

// ✅ Solution: Handle in query
let users = sqlx::query_as!(
    User,
    r#"SELECT id, COALESCE(nickname, '') as nickname FROM users"#
).fetch_all(&pool).await?;
```

## Testing Issues

### Testing Private Functions
```rust
// Module with private function
mod calculator {
    pub fn add(a: i32, b: i32) -> i32 {
        internal_add(a, b)
    }
    
    fn internal_add(a: i32, b: i32) -> i32 {
        a + b
    }
    
    // ✅ Tests in same module can access private functions
    #[cfg(test)]
    mod tests {
        use super::*;
        
        #[test]
        fn test_internal_add() {
            assert_eq!(internal_add(2, 3), 5);
        }
    }
}
```

### Async Test Setup
```rust
// ✅ Use tokio::test for async tests
#[tokio::test]
async fn test_async_function() {
    let result = async_function().await;
    assert!(result.is_ok());
}

// ✅ Shared setup with once_cell
use once_cell::sync::Lazy;

static TEST_DB: Lazy<PgPool> = Lazy::new(|| {
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(async {
            create_test_database().await
        })
});

#[tokio::test]
async fn test_with_db() {
    let pool = &*TEST_DB;
    // Use pool...
}

// ✅ Better: Use test fixtures
use sqlx::PgPool;

async fn setup_test_db() -> PgPool {
    let pool = PgPool::connect("postgres://test:test@localhost/test_db")
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn test_user_creation() {
    let pool = setup_test_db().await;
    // Test with fresh database
}
```
