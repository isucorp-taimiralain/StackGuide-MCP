# Go (Golang) Best Practices

## Error Handling

```go
// Define custom errors
var (
    ErrNotFound     = errors.New("resource not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrInvalidInput = errors.New("invalid input")
)

// Wrap errors with context
func (r *userRepo) FindByID(ctx context.Context, id string) (*User, error) {
    user, err := r.db.GetUser(ctx, id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrNotFound
        }
        return nil, fmt.Errorf("finding user by id %s: %w", id, err)
    }
    return user, nil
}

// Handle errors appropriately
func (h *handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.service.GetUser(r.Context(), r.PathValue("id"))
    if err != nil {
        switch {
        case errors.Is(err, ErrNotFound):
            http.Error(w, "User not found", http.StatusNotFound)
        case errors.Is(err, ErrUnauthorized):
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
        default:
            h.logger.Error("getting user", "error", err)
            http.Error(w, "Internal server error", http.StatusInternalServerError)
        }
        return
    }
    
    json.NewEncoder(w).Encode(user)
}

// Custom error types with additional info
type ValidationError struct {
    Field   string
    Message string
}

func (e ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
    var msgs []string
    for _, err := range e {
        msgs = append(msgs, err.Error())
    }
    return strings.Join(msgs, "; ")
}
```

## Context Usage

```go
// Always pass context as first parameter
func (s *service) ProcessOrder(ctx context.Context, orderID string) error {
    // Check for cancellation
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }
    
    // Use context for database operations
    order, err := s.repo.FindByID(ctx, orderID)
    if err != nil {
        return err
    }
    
    // Use context for external calls
    resp, err := s.paymentClient.Charge(ctx, order.Total)
    if err != nil {
        return fmt.Errorf("charging payment: %w", err)
    }
    
    return nil
}

// Context with timeout
func (h *handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
    defer cancel()
    
    order, err := h.service.CreateOrder(ctx, req)
    if err != nil {
        if errors.Is(err, context.DeadlineExceeded) {
            http.Error(w, "Request timeout", http.StatusGatewayTimeout)
            return
        }
        // Handle other errors
    }
}

// Context values for request-scoped data
type contextKey string

const (
    userIDKey   contextKey = "userID"
    requestIDKey contextKey = "requestID"
)

func WithUserID(ctx context.Context, userID string) context.Context {
    return context.WithValue(ctx, userIDKey, userID)
}

func UserIDFromContext(ctx context.Context) (string, bool) {
    userID, ok := ctx.Value(userIDKey).(string)
    return userID, ok
}
```

## Dependency Injection

```go
// Use interfaces for dependencies
type OrderService struct {
    orderRepo   OrderRepository
    paymentSvc  PaymentService
    emailSvc    EmailService
    logger      *slog.Logger
}

func NewOrderService(
    orderRepo OrderRepository,
    paymentSvc PaymentService,
    emailSvc EmailService,
    logger *slog.Logger,
) *OrderService {
    return &OrderService{
        orderRepo:  orderRepo,
        paymentSvc: paymentSvc,
        emailSvc:   emailSvc,
        logger:     logger,
    }
}

// Wire up dependencies in main
func main() {
    // Config
    cfg, err := config.Load()
    if err != nil {
        log.Fatal(err)
    }
    
    // Logger
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    
    // Database
    db, err := sql.Open("postgres", cfg.Database.DSN())
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()
    
    // Repositories
    userRepo := repository.NewPostgresUserRepo(db)
    orderRepo := repository.NewPostgresOrderRepo(db)
    
    // Services
    paymentSvc := payment.NewStripeService(cfg.Stripe.Key)
    emailSvc := email.NewSendGridService(cfg.SendGrid.Key)
    
    userSvc := service.NewUserService(userRepo, logger)
    orderSvc := service.NewOrderService(orderRepo, paymentSvc, emailSvc, logger)
    
    // Handlers
    userHandler := handler.NewUserHandler(userSvc, logger)
    orderHandler := handler.NewOrderHandler(orderSvc, logger)
    
    // Router
    router := api.SetupRoutes(userHandler, orderHandler)
    
    // Server
    server := &http.Server{
        Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
        Handler:      router,
        ReadTimeout:  cfg.Server.ReadTimeout,
        WriteTimeout: cfg.Server.WriteTimeout,
    }
    
    log.Printf("Starting server on port %d", cfg.Server.Port)
    log.Fatal(server.ListenAndServe())
}
```

## Concurrency

```go
// Use goroutines with proper synchronization
func (s *service) ProcessOrders(ctx context.Context, orderIDs []string) error {
    g, ctx := errgroup.WithContext(ctx)
    
    // Limit concurrency
    sem := make(chan struct{}, 10)
    
    for _, id := range orderIDs {
        id := id // Capture for goroutine
        
        g.Go(func() error {
            select {
            case sem <- struct{}{}:
                defer func() { <-sem }()
            case <-ctx.Done():
                return ctx.Err()
            }
            
            return s.processOrder(ctx, id)
        })
    }
    
    return g.Wait()
}

// Channel patterns
func (w *worker) Start(ctx context.Context) error {
    jobs := make(chan Job, 100)
    results := make(chan Result, 100)
    
    // Start workers
    for i := 0; i < w.numWorkers; i++ {
        go w.process(ctx, jobs, results)
    }
    
    // Collect results
    go func() {
        for result := range results {
            w.handleResult(result)
        }
    }()
    
    // Wait for context cancellation
    <-ctx.Done()
    close(jobs)
    return nil
}

// Worker pool pattern
type WorkerPool struct {
    jobs    chan Job
    results chan Result
    workers int
}

func NewWorkerPool(workers, bufferSize int) *WorkerPool {
    return &WorkerPool{
        jobs:    make(chan Job, bufferSize),
        results: make(chan Result, bufferSize),
        workers: workers,
    }
}

func (p *WorkerPool) Start(ctx context.Context) {
    var wg sync.WaitGroup
    
    for i := 0; i < p.workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for {
                select {
                case job, ok := <-p.jobs:
                    if !ok {
                        return
                    }
                    result := job.Process()
                    p.results <- result
                case <-ctx.Done():
                    return
                }
            }
        }()
    }
    
    go func() {
        wg.Wait()
        close(p.results)
    }()
}
```

## Testing

```go
// Table-driven tests
func TestUserService_Create(t *testing.T) {
    tests := []struct {
        name      string
        req       CreateUserRequest
        setupMock func(*MockUserRepository)
        wantErr   error
    }{
        {
            name: "success",
            req: CreateUserRequest{
                Email:    "test@example.com",
                Name:     "Test User",
                Password: "password123",
            },
            setupMock: func(m *MockUserRepository) {
                m.On("FindByEmail", mock.Anything, "test@example.com").
                    Return(nil, ErrNotFound)
                m.On("Save", mock.Anything, mock.AnythingOfType("*User")).
                    Return(nil)
            },
            wantErr: nil,
        },
        {
            name: "email_taken",
            req: CreateUserRequest{
                Email: "existing@example.com",
            },
            setupMock: func(m *MockUserRepository) {
                m.On("FindByEmail", mock.Anything, "existing@example.com").
                    Return(&User{Email: "existing@example.com"}, nil)
            },
            wantErr: ErrEmailTaken,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            mockRepo := new(MockUserRepository)
            tt.setupMock(mockRepo)
            
            service := NewUserService(mockRepo, &mockHasher{}, slog.Default())
            
            _, err := service.Create(context.Background(), tt.req)
            
            if tt.wantErr != nil {
                assert.ErrorIs(t, err, tt.wantErr)
            } else {
                assert.NoError(t, err)
            }
            
            mockRepo.AssertExpectations(t)
        })
    }
}

// HTTP handler tests
func TestUserHandler_GetUser(t *testing.T) {
    t.Run("success", func(t *testing.T) {
        mockService := new(MockUserService)
        mockService.On("GetByID", mock.Anything, "123").
            Return(&User{ID: "123", Name: "Test"}, nil)
        
        handler := NewUserHandler(mockService, slog.Default())
        
        req := httptest.NewRequest("GET", "/users/123", nil)
        req.SetPathValue("id", "123")
        rec := httptest.NewRecorder()
        
        handler.GetUser(rec, req)
        
        assert.Equal(t, http.StatusOK, rec.Code)
        
        var response User
        json.Unmarshal(rec.Body.Bytes(), &response)
        assert.Equal(t, "123", response.ID)
    })
    
    t.Run("not_found", func(t *testing.T) {
        mockService := new(MockUserService)
        mockService.On("GetByID", mock.Anything, "999").
            Return(nil, ErrNotFound)
        
        handler := NewUserHandler(mockService, slog.Default())
        
        req := httptest.NewRequest("GET", "/users/999", nil)
        req.SetPathValue("id", "999")
        rec := httptest.NewRecorder()
        
        handler.GetUser(rec, req)
        
        assert.Equal(t, http.StatusNotFound, rec.Code)
    })
}
```

## Logging

```go
// Structured logging with slog
func main() {
    handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    })
    logger := slog.New(handler)
    slog.SetDefault(logger)
}

// Log with context
func (s *service) ProcessOrder(ctx context.Context, orderID string) error {
    logger := s.logger.With(
        "order_id", orderID,
        "request_id", RequestIDFromContext(ctx),
    )
    
    logger.Info("processing order")
    
    if err := s.validate(ctx, orderID); err != nil {
        logger.Error("validation failed", "error", err)
        return err
    }
    
    logger.Info("order processed successfully")
    return nil
}

// Middleware for request logging
func LoggingMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            
            // Wrap response writer to capture status
            wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}
            
            next.ServeHTTP(wrapped, r)
            
            logger.Info("request completed",
                "method", r.Method,
                "path", r.URL.Path,
                "status", wrapped.status,
                "duration_ms", time.Since(start).Milliseconds(),
                "remote_addr", r.RemoteAddr,
            )
        })
    }
}
```

## Database Best Practices

```go
// Connection pooling
func NewDB(cfg DatabaseConfig) (*sql.DB, error) {
    db, err := sql.Open("postgres", cfg.DSN())
    if err != nil {
        return nil, err
    }
    
    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    db.SetConnMaxIdleTime(1 * time.Minute)
    
    // Verify connection
    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("pinging database: %w", err)
    }
    
    return db, nil
}

// Transactions
func (r *orderRepo) CreateWithItems(ctx context.Context, order *Order, items []*OrderItem) error {
    tx, err := r.db.BeginTx(ctx, nil)
    if err != nil {
        return fmt.Errorf("beginning transaction: %w", err)
    }
    defer tx.Rollback()
    
    // Insert order
    _, err = tx.ExecContext(ctx,
        `INSERT INTO orders (id, user_id, total) VALUES ($1, $2, $3)`,
        order.ID, order.UserID, order.Total,
    )
    if err != nil {
        return fmt.Errorf("inserting order: %w", err)
    }
    
    // Insert items
    for _, item := range items {
        _, err = tx.ExecContext(ctx,
            `INSERT INTO order_items (id, order_id, product_id, quantity) VALUES ($1, $2, $3, $4)`,
            item.ID, order.ID, item.ProductID, item.Quantity,
        )
        if err != nil {
            return fmt.Errorf("inserting order item: %w", err)
        }
    }
    
    if err := tx.Commit(); err != nil {
        return fmt.Errorf("committing transaction: %w", err)
    }
    
    return nil
}
```

## Graceful Shutdown

```go
func main() {
    // Setup server
    server := &http.Server{
        Addr:    ":8080",
        Handler: router,
    }
    
    // Channel to listen for errors
    serverErrors := make(chan error, 1)
    
    // Start server
    go func() {
        log.Println("Starting server on :8080")
        serverErrors <- server.ListenAndServe()
    }()
    
    // Channel to listen for OS signals
    shutdown := make(chan os.Signal, 1)
    signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)
    
    // Block until signal or error
    select {
    case err := <-serverErrors:
        log.Fatalf("Server error: %v", err)
        
    case <-shutdown:
        log.Println("Shutting down...")
        
        // Give outstanding requests time to complete
        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()
        
        if err := server.Shutdown(ctx); err != nil {
            log.Printf("Graceful shutdown failed: %v", err)
            server.Close()
        }
    }
}
```
