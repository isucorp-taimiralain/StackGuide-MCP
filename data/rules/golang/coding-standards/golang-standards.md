# Go (Golang) Coding Standards

## Project Structure

### Standard Layout
```
myapp/
├── cmd/                    # Application entry points
│   ├── api/
│   │   └── main.go        # API server
│   └── worker/
│       └── main.go        # Background worker
├── internal/               # Private application code
│   ├── api/
│   │   ├── handlers/      # HTTP handlers
│   │   ├── middleware/    # HTTP middleware
│   │   └── routes.go      # Route definitions
│   ├── domain/            # Business logic
│   │   ├── user/
│   │   │   ├── entity.go
│   │   │   ├── service.go
│   │   │   └── repository.go
│   │   └── order/
│   ├── repository/        # Data access
│   │   ├── postgres/
│   │   └── redis/
│   └── config/            # Configuration
├── pkg/                    # Public libraries
│   ├── validator/
│   └── logger/
├── migrations/             # Database migrations
├── scripts/                # Build/deploy scripts
├── go.mod
├── go.sum
└── Makefile
```

## Naming Conventions

```go
// Package names - short, lowercase, no underscores
package userservice // Good
package user_service // Bad
package UserService  // Bad

// Exported names - CamelCase starting with uppercase
type User struct{}
func NewUser() *User {}
const MaxRetries = 3

// Unexported names - camelCase starting with lowercase
type userCache struct{}
func validateEmail(email string) bool {}
var defaultTimeout = 30 * time.Second

// Interface names - typically end with -er
type Reader interface {
    Read(p []byte) (n int, err error)
}

type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Save(ctx context.Context, user *User) error
}

// Acronyms - consistent casing
type HTTPClient struct{}  // Not HttpClient
type JSONResponse struct{} // Not JsonResponse
var userID string         // Not userId
var httpURL string        // Not httpUrl

// Error variables - start with Err
var ErrNotFound = errors.New("not found")
var ErrInvalidInput = errors.New("invalid input")
```

## Structs and Methods

```go
// Entity
type User struct {
    ID        string    `json:"id" db:"id"`
    Email     string    `json:"email" db:"email"`
    Name      string    `json:"name" db:"name"`
    Password  string    `json:"-" db:"password"` // Omit from JSON
    CreatedAt time.Time `json:"created_at" db:"created_at"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// Constructor function
func NewUser(email, name, password string) (*User, error) {
    if email == "" {
        return nil, ErrInvalidEmail
    }
    
    hashedPassword, err := hashPassword(password)
    if err != nil {
        return nil, fmt.Errorf("hashing password: %w", err)
    }
    
    return &User{
        ID:        uuid.New().String(),
        Email:     email,
        Name:      name,
        Password:  hashedPassword,
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }, nil
}

// Methods - use pointer receiver for mutations
func (u *User) UpdateEmail(email string) error {
    if email == "" {
        return ErrInvalidEmail
    }
    u.Email = email
    u.UpdatedAt = time.Now()
    return nil
}

// Methods - use value receiver for read-only
func (u User) FullName() string {
    return u.Name
}

func (u User) IsActive() bool {
    return u.Status == StatusActive
}
```

## Interfaces

```go
// Repository interface
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    FindByEmail(ctx context.Context, email string) (*User, error)
    Save(ctx context.Context, user *User) error
    Update(ctx context.Context, user *User) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context, opts ListOptions) ([]*User, error)
}

// Implementation
type postgresUserRepository struct {
    db *sql.DB
}

func NewPostgresUserRepository(db *sql.DB) UserRepository {
    return &postgresUserRepository{db: db}
}

func (r *postgresUserRepository) FindByID(ctx context.Context, id string) (*User, error) {
    query := `SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1`
    
    user := &User{}
    err := r.db.QueryRowContext(ctx, query, id).Scan(
        &user.ID,
        &user.Email,
        &user.Name,
        &user.CreatedAt,
        &user.UpdatedAt,
    )
    
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("querying user: %w", err)
    }
    
    return user, nil
}
```

## HTTP Handlers

```go
// Handler struct with dependencies
type UserHandler struct {
    userService UserService
    logger      *slog.Logger
}

func NewUserHandler(userService UserService, logger *slog.Logger) *UserHandler {
    return &UserHandler{
        userService: userService,
        logger:      logger,
    }
}

// Handler method
func (h *UserHandler) GetUser(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    userID := chi.URLParam(r, "id")
    
    user, err := h.userService.GetByID(ctx, userID)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            h.respondError(w, http.StatusNotFound, "User not found")
            return
        }
        h.logger.Error("failed to get user", "error", err, "user_id", userID)
        h.respondError(w, http.StatusInternalServerError, "Internal server error")
        return
    }
    
    h.respondJSON(w, http.StatusOK, user)
}

func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        h.respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }
    
    if err := req.Validate(); err != nil {
        h.respondError(w, http.StatusBadRequest, err.Error())
        return
    }
    
    user, err := h.userService.Create(r.Context(), req)
    if err != nil {
        if errors.Is(err, ErrEmailTaken) {
            h.respondError(w, http.StatusConflict, "Email already taken")
            return
        }
        h.logger.Error("failed to create user", "error", err)
        h.respondError(w, http.StatusInternalServerError, "Internal server error")
        return
    }
    
    h.respondJSON(w, http.StatusCreated, user)
}

// Helper methods
func (h *UserHandler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func (h *UserHandler) respondError(w http.ResponseWriter, status int, message string) {
    h.respondJSON(w, status, map[string]string{"error": message})
}
```

## Request/Response DTOs

```go
// Request DTO with validation
type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Name     string `json:"name" validate:"required,min=2,max=100"`
    Password string `json:"password" validate:"required,min=8"`
}

func (r CreateUserRequest) Validate() error {
    validate := validator.New()
    return validate.Struct(r)
}

// Response DTO
type UserResponse struct {
    ID        string    `json:"id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"created_at"`
}

func NewUserResponse(user *User) UserResponse {
    return UserResponse{
        ID:        user.ID,
        Email:     user.Email,
        Name:      user.Name,
        CreatedAt: user.CreatedAt,
    }
}

// Paginated response
type PaginatedResponse[T any] struct {
    Data       []T `json:"data"`
    Page       int `json:"page"`
    PerPage    int `json:"per_page"`
    TotalCount int `json:"total_count"`
    TotalPages int `json:"total_pages"`
}
```

## Service Layer

```go
type UserService interface {
    Create(ctx context.Context, req CreateUserRequest) (*User, error)
    GetByID(ctx context.Context, id string) (*User, error)
    Update(ctx context.Context, id string, req UpdateUserRequest) (*User, error)
    Delete(ctx context.Context, id string) error
    List(ctx context.Context, opts ListOptions) ([]*User, error)
}

type userService struct {
    repo   UserRepository
    hasher PasswordHasher
    logger *slog.Logger
}

func NewUserService(repo UserRepository, hasher PasswordHasher, logger *slog.Logger) UserService {
    return &userService{
        repo:   repo,
        hasher: hasher,
        logger: logger,
    }
}

func (s *userService) Create(ctx context.Context, req CreateUserRequest) (*User, error) {
    // Check for existing user
    existing, err := s.repo.FindByEmail(ctx, req.Email)
    if err != nil && !errors.Is(err, ErrNotFound) {
        return nil, fmt.Errorf("checking existing user: %w", err)
    }
    if existing != nil {
        return nil, ErrEmailTaken
    }
    
    // Hash password
    hashedPassword, err := s.hasher.Hash(req.Password)
    if err != nil {
        return nil, fmt.Errorf("hashing password: %w", err)
    }
    
    // Create user
    user := &User{
        ID:        uuid.New().String(),
        Email:     req.Email,
        Name:      req.Name,
        Password:  hashedPassword,
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }
    
    if err := s.repo.Save(ctx, user); err != nil {
        return nil, fmt.Errorf("saving user: %w", err)
    }
    
    s.logger.Info("user created", "user_id", user.ID, "email", user.Email)
    
    return user, nil
}
```

## Configuration

```go
// Config struct
type Config struct {
    Server   ServerConfig   `yaml:"server"`
    Database DatabaseConfig `yaml:"database"`
    Redis    RedisConfig    `yaml:"redis"`
    JWT      JWTConfig      `yaml:"jwt"`
}

type ServerConfig struct {
    Port         int           `yaml:"port" envconfig:"SERVER_PORT" default:"8080"`
    ReadTimeout  time.Duration `yaml:"read_timeout" default:"15s"`
    WriteTimeout time.Duration `yaml:"write_timeout" default:"15s"`
}

type DatabaseConfig struct {
    Host     string `yaml:"host" envconfig:"DB_HOST" required:"true"`
    Port     int    `yaml:"port" envconfig:"DB_PORT" default:"5432"`
    User     string `yaml:"user" envconfig:"DB_USER" required:"true"`
    Password string `yaml:"password" envconfig:"DB_PASSWORD" required:"true"`
    Name     string `yaml:"name" envconfig:"DB_NAME" required:"true"`
    SSLMode  string `yaml:"ssl_mode" envconfig:"DB_SSL_MODE" default:"disable"`
}

func (c DatabaseConfig) DSN() string {
    return fmt.Sprintf(
        "host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
        c.Host, c.Port, c.User, c.Password, c.Name, c.SSLMode,
    )
}

// Load config
func LoadConfig() (*Config, error) {
    var cfg Config
    
    // Load from file
    data, err := os.ReadFile("config.yaml")
    if err != nil {
        return nil, fmt.Errorf("reading config file: %w", err)
    }
    
    if err := yaml.Unmarshal(data, &cfg); err != nil {
        return nil, fmt.Errorf("parsing config: %w", err)
    }
    
    // Override with environment variables
    if err := envconfig.Process("", &cfg); err != nil {
        return nil, fmt.Errorf("processing env vars: %w", err)
    }
    
    return &cfg, nil
}
```

## Routing (with Chi)

```go
func SetupRoutes(
    userHandler *UserHandler,
    orderHandler *OrderHandler,
    authMiddleware func(http.Handler) http.Handler,
) http.Handler {
    r := chi.NewRouter()
    
    // Global middleware
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.Timeout(30 * time.Second))
    
    // Health check
    r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("OK"))
    })
    
    // API routes
    r.Route("/api/v1", func(r chi.Router) {
        // Public routes
        r.Post("/auth/login", authHandler.Login)
        r.Post("/auth/register", authHandler.Register)
        
        // Protected routes
        r.Group(func(r chi.Router) {
            r.Use(authMiddleware)
            
            // Users
            r.Route("/users", func(r chi.Router) {
                r.Get("/", userHandler.List)
                r.Post("/", userHandler.Create)
                r.Get("/{id}", userHandler.GetUser)
                r.Put("/{id}", userHandler.Update)
                r.Delete("/{id}", userHandler.Delete)
            })
            
            // Orders
            r.Route("/orders", func(r chi.Router) {
                r.Get("/", orderHandler.List)
                r.Post("/", orderHandler.Create)
                r.Get("/{id}", orderHandler.Get)
            })
        })
    })
    
    return r
}
```
