# Go (Golang) Design Patterns

## Creational Patterns

### Factory Pattern
```go
// Product interface
type Database interface {
    Connect() error
    Query(query string) ([]Row, error)
    Close() error
}

// Concrete products
type PostgresDB struct {
    dsn string
    conn *sql.DB
}

func (p *PostgresDB) Connect() error {
    conn, err := sql.Open("postgres", p.dsn)
    if err != nil {
        return err
    }
    p.conn = conn
    return nil
}

type MySQLDB struct {
    dsn string
    conn *sql.DB
}

func (m *MySQLDB) Connect() error {
    conn, err := sql.Open("mysql", m.dsn)
    if err != nil {
        return err
    }
    m.conn = conn
    return nil
}

// Factory
type DatabaseFactory struct{}

func (f *DatabaseFactory) Create(dbType string, dsn string) (Database, error) {
    switch dbType {
    case "postgres":
        return &PostgresDB{dsn: dsn}, nil
    case "mysql":
        return &MySQLDB{dsn: dsn}, nil
    default:
        return nil, fmt.Errorf("unsupported database type: %s", dbType)
    }
}

// Usage
factory := &DatabaseFactory{}
db, err := factory.Create("postgres", "postgres://localhost/mydb")
if err != nil {
    log.Fatal(err)
}
db.Connect()
```

### Builder Pattern
```go
type Server struct {
    host         string
    port         int
    timeout      time.Duration
    maxConns     int
    tls          bool
    readTimeout  time.Duration
    writeTimeout time.Duration
}

type ServerBuilder struct {
    server *Server
}

func NewServerBuilder() *ServerBuilder {
    return &ServerBuilder{
        server: &Server{
            host:         "localhost",
            port:         8080,
            timeout:      30 * time.Second,
            maxConns:     100,
            readTimeout:  15 * time.Second,
            writeTimeout: 15 * time.Second,
        },
    }
}

func (b *ServerBuilder) Host(host string) *ServerBuilder {
    b.server.host = host
    return b
}

func (b *ServerBuilder) Port(port int) *ServerBuilder {
    b.server.port = port
    return b
}

func (b *ServerBuilder) Timeout(timeout time.Duration) *ServerBuilder {
    b.server.timeout = timeout
    return b
}

func (b *ServerBuilder) MaxConnections(max int) *ServerBuilder {
    b.server.maxConns = max
    return b
}

func (b *ServerBuilder) WithTLS() *ServerBuilder {
    b.server.tls = true
    return b
}

func (b *ServerBuilder) Build() *Server {
    return b.server
}

// Usage
server := NewServerBuilder().
    Host("0.0.0.0").
    Port(443).
    WithTLS().
    MaxConnections(1000).
    Timeout(60 * time.Second).
    Build()
```

### Singleton Pattern
```go
type Config struct {
    DatabaseURL string
    APIKey      string
    Debug       bool
}

var (
    instance *Config
    once     sync.Once
)

func GetConfig() *Config {
    once.Do(func() {
        instance = &Config{
            DatabaseURL: os.Getenv("DATABASE_URL"),
            APIKey:      os.Getenv("API_KEY"),
            Debug:       os.Getenv("DEBUG") == "true",
        }
    })
    return instance
}

// Usage
config := GetConfig()
```

### Options Pattern (Functional Options)
```go
type Client struct {
    baseURL    string
    timeout    time.Duration
    retries    int
    headers    map[string]string
    httpClient *http.Client
}

type Option func(*Client)

func WithTimeout(timeout time.Duration) Option {
    return func(c *Client) {
        c.timeout = timeout
    }
}

func WithRetries(retries int) Option {
    return func(c *Client) {
        c.retries = retries
    }
}

func WithHeader(key, value string) Option {
    return func(c *Client) {
        if c.headers == nil {
            c.headers = make(map[string]string)
        }
        c.headers[key] = value
    }
}

func WithHTTPClient(httpClient *http.Client) Option {
    return func(c *Client) {
        c.httpClient = httpClient
    }
}

func NewClient(baseURL string, opts ...Option) *Client {
    client := &Client{
        baseURL: baseURL,
        timeout: 30 * time.Second,
        retries: 3,
        headers: make(map[string]string),
    }
    
    for _, opt := range opts {
        opt(client)
    }
    
    if client.httpClient == nil {
        client.httpClient = &http.Client{
            Timeout: client.timeout,
        }
    }
    
    return client
}

// Usage
client := NewClient("https://api.example.com",
    WithTimeout(60*time.Second),
    WithRetries(5),
    WithHeader("Authorization", "Bearer token"),
)
```

## Structural Patterns

### Adapter Pattern
```go
// Target interface (what our code expects)
type PaymentProcessor interface {
    ProcessPayment(amount float64, currency string) (*PaymentResult, error)
}

// Adaptee (third-party library with different interface)
type StripeClient struct{}

func (s *StripeClient) Charge(cents int64, cur string, token string) (*stripe.Charge, error) {
    // Stripe-specific implementation
    return &stripe.Charge{ID: "ch_123"}, nil
}

// Adapter
type StripeAdapter struct {
    client *StripeClient
    token  string
}

func NewStripeAdapter(token string) PaymentProcessor {
    return &StripeAdapter{
        client: &StripeClient{},
        token:  token,
    }
}

func (a *StripeAdapter) ProcessPayment(amount float64, currency string) (*PaymentResult, error) {
    cents := int64(amount * 100)
    charge, err := a.client.Charge(cents, currency, a.token)
    if err != nil {
        return nil, err
    }
    
    return &PaymentResult{
        TransactionID: charge.ID,
        Status:        "success",
    }, nil
}
```

### Decorator Pattern
```go
// Component interface
type Handler interface {
    Handle(ctx context.Context, request Request) (Response, error)
}

// Concrete component
type UserHandler struct {
    userService UserService
}

func (h *UserHandler) Handle(ctx context.Context, req Request) (Response, error) {
    return h.userService.GetUser(ctx, req.UserID)
}

// Decorators
type LoggingDecorator struct {
    wrapped Handler
    logger  *slog.Logger
}

func WithLogging(handler Handler, logger *slog.Logger) Handler {
    return &LoggingDecorator{wrapped: handler, logger: logger}
}

func (d *LoggingDecorator) Handle(ctx context.Context, req Request) (Response, error) {
    start := time.Now()
    
    d.logger.Info("handling request", "request", req)
    
    resp, err := d.wrapped.Handle(ctx, req)
    
    d.logger.Info("request completed",
        "duration", time.Since(start),
        "error", err,
    )
    
    return resp, err
}

type CachingDecorator struct {
    wrapped Handler
    cache   Cache
    ttl     time.Duration
}

func WithCaching(handler Handler, cache Cache, ttl time.Duration) Handler {
    return &CachingDecorator{wrapped: handler, cache: cache, ttl: ttl}
}

func (d *CachingDecorator) Handle(ctx context.Context, req Request) (Response, error) {
    cacheKey := req.CacheKey()
    
    if cached, ok := d.cache.Get(cacheKey); ok {
        return cached.(Response), nil
    }
    
    resp, err := d.wrapped.Handle(ctx, req)
    if err == nil {
        d.cache.Set(cacheKey, resp, d.ttl)
    }
    
    return resp, err
}

// Usage
handler := &UserHandler{userService: userService}
handler = WithLogging(handler, logger)
handler = WithCaching(handler, cache, 5*time.Minute)
```

### Repository Pattern
```go
// Generic repository interface
type Repository[T any, ID comparable] interface {
    FindByID(ctx context.Context, id ID) (*T, error)
    FindAll(ctx context.Context, opts QueryOptions) ([]*T, error)
    Save(ctx context.Context, entity *T) error
    Update(ctx context.Context, entity *T) error
    Delete(ctx context.Context, id ID) error
}

// Specific repository
type UserRepository interface {
    Repository[User, string]
    FindByEmail(ctx context.Context, email string) (*User, error)
    FindByRole(ctx context.Context, role Role) ([]*User, error)
}

// Implementation
type postgresUserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
    return &postgresUserRepository{db: db}
}

func (r *postgresUserRepository) FindByID(ctx context.Context, id string) (*User, error) {
    query := `SELECT id, email, name FROM users WHERE id = $1`
    
    user := &User{}
    err := r.db.QueryRowContext(ctx, query, id).Scan(&user.ID, &user.Email, &user.Name)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    return user, err
}

func (r *postgresUserRepository) FindByEmail(ctx context.Context, email string) (*User, error) {
    query := `SELECT id, email, name FROM users WHERE email = $1`
    
    user := &User{}
    err := r.db.QueryRowContext(ctx, query, email).Scan(&user.ID, &user.Email, &user.Name)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    return user, err
}
```

## Behavioral Patterns

### Strategy Pattern
```go
// Strategy interface
type PricingStrategy interface {
    CalculatePrice(basePrice float64, quantity int) float64
}

// Concrete strategies
type RegularPricing struct{}

func (p *RegularPricing) CalculatePrice(basePrice float64, quantity int) float64 {
    return basePrice * float64(quantity)
}

type BulkPricing struct {
    threshold int
    discount  float64
}

func (p *BulkPricing) CalculatePrice(basePrice float64, quantity int) float64 {
    total := basePrice * float64(quantity)
    if quantity >= p.threshold {
        return total * (1 - p.discount)
    }
    return total
}

type PremiumPricing struct {
    memberDiscount float64
}

func (p *PremiumPricing) CalculatePrice(basePrice float64, quantity int) float64 {
    return basePrice * float64(quantity) * (1 - p.memberDiscount)
}

// Context
type ShoppingCart struct {
    items    []Item
    strategy PricingStrategy
}

func (c *ShoppingCart) SetPricingStrategy(strategy PricingStrategy) {
    c.strategy = strategy
}

func (c *ShoppingCart) CalculateTotal() float64 {
    var total float64
    for _, item := range c.items {
        total += c.strategy.CalculatePrice(item.Price, item.Quantity)
    }
    return total
}
```

### Observer Pattern
```go
type Observer interface {
    Update(event Event)
}

type Subject interface {
    Subscribe(observer Observer)
    Unsubscribe(observer Observer)
    Notify(event Event)
}

type Event struct {
    Type    string
    Payload interface{}
}

// Concrete subject
type OrderSubject struct {
    observers []Observer
    mu        sync.RWMutex
}

func NewOrderSubject() *OrderSubject {
    return &OrderSubject{
        observers: make([]Observer, 0),
    }
}

func (s *OrderSubject) Subscribe(observer Observer) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.observers = append(s.observers, observer)
}

func (s *OrderSubject) Unsubscribe(observer Observer) {
    s.mu.Lock()
    defer s.mu.Unlock()
    for i, obs := range s.observers {
        if obs == observer {
            s.observers = append(s.observers[:i], s.observers[i+1:]...)
            break
        }
    }
}

func (s *OrderSubject) Notify(event Event) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    for _, observer := range s.observers {
        go observer.Update(event)
    }
}

// Concrete observers
type EmailNotifier struct {
    emailService EmailService
}

func (n *EmailNotifier) Update(event Event) {
    if event.Type == "order.created" {
        order := event.Payload.(*Order)
        n.emailService.SendOrderConfirmation(order)
    }
}

type InventoryUpdater struct {
    inventoryService InventoryService
}

func (u *InventoryUpdater) Update(event Event) {
    if event.Type == "order.created" {
        order := event.Payload.(*Order)
        for _, item := range order.Items {
            u.inventoryService.DecreaseStock(item.ProductID, item.Quantity)
        }
    }
}
```

### Pipeline Pattern
```go
type Stage[T any] func(ctx context.Context, input T) (T, error)

type Pipeline[T any] struct {
    stages []Stage[T]
}

func NewPipeline[T any](stages ...Stage[T]) *Pipeline[T] {
    return &Pipeline[T]{stages: stages}
}

func (p *Pipeline[T]) Execute(ctx context.Context, input T) (T, error) {
    var err error
    result := input
    
    for _, stage := range p.stages {
        select {
        case <-ctx.Done():
            return result, ctx.Err()
        default:
            result, err = stage(ctx, result)
            if err != nil {
                return result, err
            }
        }
    }
    
    return result, nil
}

// Usage
type Order struct {
    ID     string
    Items  []OrderItem
    Total  float64
    Status string
}

validateOrder := func(ctx context.Context, order Order) (Order, error) {
    if len(order.Items) == 0 {
        return order, errors.New("order must have items")
    }
    return order, nil
}

calculateTotal := func(ctx context.Context, order Order) (Order, error) {
    var total float64
    for _, item := range order.Items {
        total += item.Price * float64(item.Quantity)
    }
    order.Total = total
    return order, nil
}

applyDiscounts := func(ctx context.Context, order Order) (Order, error) {
    if order.Total > 100 {
        order.Total *= 0.9 // 10% discount
    }
    return order, nil
}

pipeline := NewPipeline(validateOrder, calculateTotal, applyDiscounts)
processedOrder, err := pipeline.Execute(ctx, order)
```

### Result Pattern
```go
type Result[T any] struct {
    value T
    err   error
}

func Ok[T any](value T) Result[T] {
    return Result[T]{value: value}
}

func Err[T any](err error) Result[T] {
    return Result[T]{err: err}
}

func (r Result[T]) IsOk() bool {
    return r.err == nil
}

func (r Result[T]) IsErr() bool {
    return r.err != nil
}

func (r Result[T]) Unwrap() T {
    if r.err != nil {
        panic("called Unwrap on error result")
    }
    return r.value
}

func (r Result[T]) UnwrapOr(defaultValue T) T {
    if r.err != nil {
        return defaultValue
    }
    return r.value
}

func (r Result[T]) Map(fn func(T) T) Result[T] {
    if r.err != nil {
        return r
    }
    return Ok(fn(r.value))
}

func (r Result[T]) AndThen(fn func(T) Result[T]) Result[T] {
    if r.err != nil {
        return r
    }
    return fn(r.value)
}

// Usage
func GetUser(id string) Result[User] {
    user, err := repo.FindByID(id)
    if err != nil {
        return Err[User](err)
    }
    return Ok(user)
}

result := GetUser("123").
    Map(func(u User) User {
        u.Name = strings.ToUpper(u.Name)
        return u
    }).
    AndThen(func(u User) Result[User] {
        if !u.IsActive {
            return Err[User](errors.New("user inactive"))
        }
        return Ok(u)
    })
```
