# Go (Golang) Architecture Guide

## Clean Architecture

```
├── cmd/
│   └── api/
│       └── main.go           # Application entry point
├── internal/
│   ├── domain/               # Enterprise Business Rules
│   │   ├── entity/
│   │   │   ├── user.go
│   │   │   └── order.go
│   │   └── repository/       # Repository interfaces
│   │       ├── user.go
│   │       └── order.go
│   ├── usecase/              # Application Business Rules
│   │   ├── user/
│   │   │   ├── service.go
│   │   │   └── service_test.go
│   │   └── order/
│   ├── adapter/              # Interface Adapters
│   │   ├── controller/       # HTTP handlers
│   │   │   ├── user.go
│   │   │   └── order.go
│   │   ├── presenter/        # Response formatting
│   │   └── gateway/          # External service clients
│   └── infrastructure/       # Frameworks & Drivers
│       ├── persistence/      # Database implementations
│       │   ├── postgres/
│       │   └── redis/
│       ├── config/
│       └── server/
└── pkg/                      # Public packages
    ├── logger/
    └── validator/
```

### Domain Layer (Entities)

```go
// internal/domain/entity/user.go
package entity

import (
    "errors"
    "time"
)

var (
    ErrInvalidEmail    = errors.New("invalid email")
    ErrInvalidPassword = errors.New("password must be at least 8 characters")
)

type User struct {
    ID        string
    Email     string
    Name      string
    Password  string
    Role      Role
    CreatedAt time.Time
    UpdatedAt time.Time
}

type Role string

const (
    RoleAdmin Role = "admin"
    RoleUser  Role = "user"
)

func NewUser(email, name, password string) (*User, error) {
    if !isValidEmail(email) {
        return nil, ErrInvalidEmail
    }
    if len(password) < 8 {
        return nil, ErrInvalidPassword
    }
    
    return &User{
        Email:     email,
        Name:      name,
        Password:  password,
        Role:      RoleUser,
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }, nil
}

func (u *User) CanPerform(action string) bool {
    switch u.Role {
    case RoleAdmin:
        return true
    case RoleUser:
        return action == "read"
    default:
        return false
    }
}
```

### Repository Interface (Domain)

```go
// internal/domain/repository/user.go
package repository

import (
    "context"
    
    "myapp/internal/domain/entity"
)

type UserRepository interface {
    FindByID(ctx context.Context, id string) (*entity.User, error)
    FindByEmail(ctx context.Context, email string) (*entity.User, error)
    Save(ctx context.Context, user *entity.User) error
    Update(ctx context.Context, user *entity.User) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context, opts ListOptions) ([]*entity.User, int64, error)
}

type ListOptions struct {
    Page     int
    PerPage  int
    SortBy   string
    SortDesc bool
    Filters  map[string]interface{}
}
```

### Use Case Layer

```go
// internal/usecase/user/service.go
package user

import (
    "context"
    "fmt"
    
    "myapp/internal/domain/entity"
    "myapp/internal/domain/repository"
)

type Service interface {
    Register(ctx context.Context, input RegisterInput) (*entity.User, error)
    GetByID(ctx context.Context, id string) (*entity.User, error)
    Update(ctx context.Context, id string, input UpdateInput) (*entity.User, error)
    Delete(ctx context.Context, id string) error
}

type service struct {
    userRepo repository.UserRepository
    hasher   PasswordHasher
    logger   Logger
}

func NewService(
    userRepo repository.UserRepository,
    hasher PasswordHasher,
    logger Logger,
) Service {
    return &service{
        userRepo: userRepo,
        hasher:   hasher,
        logger:   logger,
    }
}

type RegisterInput struct {
    Email    string
    Name     string
    Password string
}

func (s *service) Register(ctx context.Context, input RegisterInput) (*entity.User, error) {
    // Check if user exists
    existing, err := s.userRepo.FindByEmail(ctx, input.Email)
    if err != nil && !errors.Is(err, repository.ErrNotFound) {
        return nil, fmt.Errorf("checking existing user: %w", err)
    }
    if existing != nil {
        return nil, ErrEmailTaken
    }
    
    // Create user entity
    user, err := entity.NewUser(input.Email, input.Name, input.Password)
    if err != nil {
        return nil, fmt.Errorf("creating user: %w", err)
    }
    
    // Hash password
    hashedPassword, err := s.hasher.Hash(input.Password)
    if err != nil {
        return nil, fmt.Errorf("hashing password: %w", err)
    }
    user.Password = hashedPassword
    
    // Save to repository
    if err := s.userRepo.Save(ctx, user); err != nil {
        return nil, fmt.Errorf("saving user: %w", err)
    }
    
    s.logger.Info("user registered", "user_id", user.ID, "email", user.Email)
    
    return user, nil
}
```

### Adapter Layer (Controllers)

```go
// internal/adapter/controller/user.go
package controller

import (
    "encoding/json"
    "net/http"
    
    "myapp/internal/usecase/user"
)

type UserController struct {
    userService user.Service
}

func NewUserController(userService user.Service) *UserController {
    return &UserController{
        userService: userService,
    }
}

func (c *UserController) Register(w http.ResponseWriter, r *http.Request) {
    var req RegisterRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }
    
    if err := req.Validate(); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }
    
    u, err := c.userService.Register(r.Context(), user.RegisterInput{
        Email:    req.Email,
        Name:     req.Name,
        Password: req.Password,
    })
    if err != nil {
        switch {
        case errors.Is(err, user.ErrEmailTaken):
            respondError(w, http.StatusConflict, "Email already taken")
        default:
            respondError(w, http.StatusInternalServerError, "Internal server error")
        }
        return
    }
    
    respondJSON(w, http.StatusCreated, NewUserResponse(u))
}
```

### Infrastructure Layer

```go
// internal/infrastructure/persistence/postgres/user_repository.go
package postgres

import (
    "context"
    "database/sql"
    
    "myapp/internal/domain/entity"
    "myapp/internal/domain/repository"
)

type userRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) repository.UserRepository {
    return &userRepository{db: db}
}

func (r *userRepository) FindByID(ctx context.Context, id string) (*entity.User, error) {
    query := `
        SELECT id, email, name, password, role, created_at, updated_at
        FROM users
        WHERE id = $1
    `
    
    user := &entity.User{}
    err := r.db.QueryRowContext(ctx, query, id).Scan(
        &user.ID,
        &user.Email,
        &user.Name,
        &user.Password,
        &user.Role,
        &user.CreatedAt,
        &user.UpdatedAt,
    )
    
    if errors.Is(err, sql.ErrNoRows) {
        return nil, repository.ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("querying user: %w", err)
    }
    
    return user, nil
}

func (r *userRepository) Save(ctx context.Context, user *entity.User) error {
    query := `
        INSERT INTO users (id, email, name, password, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `
    
    _, err := r.db.ExecContext(ctx, query,
        user.ID,
        user.Email,
        user.Name,
        user.Password,
        user.Role,
        user.CreatedAt,
        user.UpdatedAt,
    )
    if err != nil {
        return fmt.Errorf("inserting user: %w", err)
    }
    
    return nil
}
```

## Hexagonal Architecture

```
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── core/                 # Domain (center of hexagon)
│   │   ├── domain/
│   │   │   ├── user.go
│   │   │   └── order.go
│   │   ├── port/             # Ports (interfaces)
│   │   │   ├── input/        # Primary ports (use cases)
│   │   │   │   └── user_service.go
│   │   │   └── output/       # Secondary ports
│   │   │       ├── user_repository.go
│   │   │       └── email_sender.go
│   │   └── service/          # Domain services
│   │       └── user_service.go
│   └── adapter/              # Adapters
│       ├── input/            # Primary adapters
│       │   ├── http/
│       │   │   └── user_handler.go
│       │   └── grpc/
│       └── output/           # Secondary adapters
│           ├── postgres/
│           │   └── user_repository.go
│           └── sendgrid/
│               └── email_sender.go
```

### Ports

```go
// internal/core/port/input/user_service.go
package input

import (
    "context"
    
    "myapp/internal/core/domain"
)

type UserService interface {
    CreateUser(ctx context.Context, cmd CreateUserCommand) (*domain.User, error)
    GetUser(ctx context.Context, query GetUserQuery) (*domain.User, error)
    UpdateUser(ctx context.Context, cmd UpdateUserCommand) (*domain.User, error)
    DeleteUser(ctx context.Context, cmd DeleteUserCommand) error
}

type CreateUserCommand struct {
    Email    string
    Name     string
    Password string
}

type GetUserQuery struct {
    ID string
}

// internal/core/port/output/user_repository.go
package output

import (
    "context"
    
    "myapp/internal/core/domain"
)

type UserRepository interface {
    Save(ctx context.Context, user *domain.User) error
    FindByID(ctx context.Context, id string) (*domain.User, error)
    FindByEmail(ctx context.Context, email string) (*domain.User, error)
    Update(ctx context.Context, user *domain.User) error
    Delete(ctx context.Context, id string) error
}
```

### Service Implementation

```go
// internal/core/service/user_service.go
package service

import (
    "context"
    "fmt"
    
    "myapp/internal/core/domain"
    "myapp/internal/core/port/input"
    "myapp/internal/core/port/output"
)

type userService struct {
    userRepo    output.UserRepository
    emailSender output.EmailSender
    hasher      output.PasswordHasher
}

func NewUserService(
    userRepo output.UserRepository,
    emailSender output.EmailSender,
    hasher output.PasswordHasher,
) input.UserService {
    return &userService{
        userRepo:    userRepo,
        emailSender: emailSender,
        hasher:      hasher,
    }
}

func (s *userService) CreateUser(ctx context.Context, cmd input.CreateUserCommand) (*domain.User, error) {
    // Business logic
    user, err := domain.NewUser(cmd.Email, cmd.Name, cmd.Password)
    if err != nil {
        return nil, err
    }
    
    hashedPassword, _ := s.hasher.Hash(cmd.Password)
    user.Password = hashedPassword
    
    if err := s.userRepo.Save(ctx, user); err != nil {
        return nil, fmt.Errorf("saving user: %w", err)
    }
    
    // Side effect via port
    _ = s.emailSender.SendWelcome(ctx, user.Email, user.Name)
    
    return user, nil
}
```

## Event-Driven Architecture

```go
// Event types
type Event interface {
    EventName() string
    OccurredAt() time.Time
}

type UserCreated struct {
    UserID    string
    Email     string
    CreatedAt time.Time
}

func (e UserCreated) EventName() string { return "user.created" }
func (e UserCreated) OccurredAt() time.Time { return e.CreatedAt }

// Event dispatcher
type EventDispatcher interface {
    Dispatch(ctx context.Context, events ...Event) error
    Subscribe(eventName string, handler EventHandler)
}

type EventHandler func(ctx context.Context, event Event) error

type inMemoryDispatcher struct {
    handlers map[string][]EventHandler
    mu       sync.RWMutex
}

func NewEventDispatcher() EventDispatcher {
    return &inMemoryDispatcher{
        handlers: make(map[string][]EventHandler),
    }
}

func (d *inMemoryDispatcher) Subscribe(eventName string, handler EventHandler) {
    d.mu.Lock()
    defer d.mu.Unlock()
    d.handlers[eventName] = append(d.handlers[eventName], handler)
}

func (d *inMemoryDispatcher) Dispatch(ctx context.Context, events ...Event) error {
    d.mu.RLock()
    defer d.mu.RUnlock()
    
    for _, event := range events {
        handlers := d.handlers[event.EventName()]
        for _, handler := range handlers {
            if err := handler(ctx, event); err != nil {
                return err
            }
        }
    }
    return nil
}

// Usage
func main() {
    dispatcher := NewEventDispatcher()
    
    // Subscribe handlers
    dispatcher.Subscribe("user.created", func(ctx context.Context, e Event) error {
        event := e.(UserCreated)
        return sendWelcomeEmail(ctx, event.Email)
    })
    
    dispatcher.Subscribe("user.created", func(ctx context.Context, e Event) error {
        event := e.(UserCreated)
        return createDefaultSettings(ctx, event.UserID)
    })
}
```

## CQRS Pattern

```go
// Commands
type Command interface {
    CommandName() string
}

type CreateOrderCommand struct {
    UserID  string
    Items   []OrderItem
    Address string
}

func (c CreateOrderCommand) CommandName() string { return "create_order" }

// Command Handler
type CommandHandler interface {
    Handle(ctx context.Context, cmd Command) error
}

type CreateOrderHandler struct {
    orderRepo OrderRepository
    eventBus  EventBus
}

func (h *CreateOrderHandler) Handle(ctx context.Context, cmd Command) error {
    c := cmd.(CreateOrderCommand)
    
    order := &Order{
        ID:      uuid.New().String(),
        UserID:  c.UserID,
        Items:   c.Items,
        Address: c.Address,
        Status:  StatusPending,
    }
    
    if err := h.orderRepo.Save(ctx, order); err != nil {
        return err
    }
    
    return h.eventBus.Publish(ctx, OrderCreated{
        OrderID: order.ID,
        UserID:  order.UserID,
    })
}

// Queries
type Query interface {
    QueryName() string
}

type GetOrdersQuery struct {
    UserID string
    Status string
    Page   int
    Limit  int
}

func (q GetOrdersQuery) QueryName() string { return "get_orders" }

// Query Handler
type QueryHandler interface {
    Handle(ctx context.Context, query Query) (interface{}, error)
}

type GetOrdersHandler struct {
    readRepo OrderReadRepository // Optimized for reads
}

func (h *GetOrdersHandler) Handle(ctx context.Context, q Query) (interface{}, error) {
    query := q.(GetOrdersQuery)
    return h.readRepo.FindByUser(ctx, query.UserID, query.Status, query.Page, query.Limit)
}
```

## Middleware Chain Pattern

```go
type Middleware func(http.Handler) http.Handler

func Chain(middlewares ...Middleware) Middleware {
    return func(final http.Handler) http.Handler {
        for i := len(middlewares) - 1; i >= 0; i-- {
            final = middlewares[i](final)
        }
        return final
    }
}

// Usage
router := http.NewServeMux()
router.HandleFunc("/api/users", userHandler.List)

handler := Chain(
    LoggingMiddleware(logger),
    RecoveryMiddleware(),
    CORSMiddleware(allowedOrigins),
    AuthMiddleware(jwtService),
    RateLimitMiddleware(limiter),
)(router)

http.ListenAndServe(":8080", handler)
```
