# Go (Golang) Common Issues and Solutions

## Error Handling Issues

### Ignoring Errors
```go
// ❌ Bad - Ignoring error
data, _ := json.Marshal(user)

// ✅ Good - Handle all errors
data, err := json.Marshal(user)
if err != nil {
    return fmt.Errorf("marshaling user: %w", err)
}
```

### Losing Error Context
```go
// ❌ Bad - Losing context
if err != nil {
    return err
}

// ❌ Bad - Hiding original error
if err != nil {
    return errors.New("database error")
}

// ✅ Good - Wrap with context
if err != nil {
    return fmt.Errorf("finding user by id %s: %w", id, err)
}
```

### Checking Error Types Wrong
```go
// ❌ Bad - String comparison
if err.Error() == "not found" {
    // ...
}

// ❌ Bad - Type assertion on wrapped error
if _, ok := err.(*NotFoundError); ok {
    // Won't match if error is wrapped
}

// ✅ Good - Use errors.Is for sentinel errors
if errors.Is(err, ErrNotFound) {
    // ...
}

// ✅ Good - Use errors.As for error types
var notFoundErr *NotFoundError
if errors.As(err, &notFoundErr) {
    // ...
}
```

## Concurrency Issues

### Race Conditions
```go
// ❌ Bad - Data race
type Counter struct {
    value int
}

func (c *Counter) Increment() {
    c.value++ // Race condition!
}

// ✅ Good - Use mutex
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
}

// ✅ Good - Use atomic operations
type Counter struct {
    value int64
}

func (c *Counter) Increment() {
    atomic.AddInt64(&c.value, 1)
}
```

### Goroutine Leaks
```go
// ❌ Bad - Goroutine leak (channel never receives)
func process() {
    ch := make(chan int)
    go func() {
        result := expensiveOperation()
        ch <- result // Blocks forever if no receiver
    }()
    
    // Function returns without receiving
    return
}

// ✅ Good - Use context for cancellation
func process(ctx context.Context) error {
    ch := make(chan int, 1) // Buffered channel
    
    go func() {
        result := expensiveOperation()
        select {
        case ch <- result:
        case <-ctx.Done():
        }
    }()
    
    select {
    case result := <-ch:
        return processResult(result)
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

### Channel Deadlock
```go
// ❌ Bad - Deadlock (unbuffered channel, same goroutine)
func deadlock() {
    ch := make(chan int)
    ch <- 1     // Blocks forever
    fmt.Println(<-ch)
}

// ✅ Good - Use goroutine or buffered channel
func noDeadlock() {
    ch := make(chan int, 1) // Buffered
    ch <- 1
    fmt.Println(<-ch)
}

// Or use goroutine
func noDeadlock2() {
    ch := make(chan int)
    go func() {
        ch <- 1
    }()
    fmt.Println(<-ch)
}
```

### Loop Variable Capture
```go
// ❌ Bad - All goroutines use last value
for _, item := range items {
    go func() {
        process(item) // item is shared!
    }()
}

// ✅ Good - Capture as parameter
for _, item := range items {
    go func(i Item) {
        process(i)
    }(item)
}

// ✅ Good - Create new variable (Go 1.22+)
for _, item := range items {
    item := item // Shadow with local copy
    go func() {
        process(item)
    }()
}

// ✅ Best - Go 1.22+ fixes this automatically for loop variables
```

## Memory Issues

### Slice Append Gotcha
```go
// ❌ Problem - Modifying original slice
func modify(slice []int) {
    slice = append(slice, 4) // New slice created
    slice[0] = 100           // Might modify original
}

// ✅ Good - Return new slice
func modify(slice []int) []int {
    result := make([]int, len(slice), cap(slice)+1)
    copy(result, slice)
    result = append(result, 4)
    return result
}
```

### Memory Leak with Subslice
```go
// ❌ Bad - Holds reference to large backing array
func getHeader(data []byte) []byte {
    return data[:10] // Keeps entire data in memory
}

// ✅ Good - Copy to new slice
func getHeader(data []byte) []byte {
    header := make([]byte, 10)
    copy(header, data[:10])
    return header
}
```

### String Memory
```go
// ❌ Bad - String retains large backing array
func extractID(largeJSON string) string {
    // Parsing returns substring pointing to largeJSON
    return parsed.ID // Holds reference to entire largeJSON
}

// ✅ Good - Create new string
func extractID(largeJSON string) string {
    id := parsed.ID
    return strings.Clone(id) // Go 1.20+
    // Or: return string([]byte(id))
}
```

## Interface Issues

### Nil Interface Gotcha
```go
// ❌ Confusing nil behavior
func returnsNil() error {
    var err *MyError = nil
    return err // Returns non-nil interface!
}

func main() {
    err := returnsNil()
    if err != nil {
        fmt.Println("This will print!") // Unexpected!
    }
}

// ✅ Good - Return nil directly
func returnsNil() error {
    var err *MyError = nil
    if err == nil {
        return nil // Return untyped nil
    }
    return err
}
```

### Interface Pointer Receiver
```go
// ❌ Problem - Value doesn't implement interface
type Printer interface {
    Print()
}

type Document struct{}

func (d *Document) Print() {} // Pointer receiver

func main() {
    var p Printer
    p = Document{}  // Error! Document doesn't implement Printer
    p = &Document{} // OK - *Document implements Printer
}
```

## HTTP Issues

### Response Body Not Closed
```go
// ❌ Bad - Resource leak
resp, err := http.Get(url)
if err != nil {
    return err
}
body, _ := io.ReadAll(resp.Body)
// Body never closed!

// ✅ Good - Always close body
resp, err := http.Get(url)
if err != nil {
    return err
}
defer resp.Body.Close()
body, err := io.ReadAll(resp.Body)
```

### HTTP Client Timeout
```go
// ❌ Bad - No timeout (can hang forever)
client := &http.Client{}
resp, err := client.Get(url)

// ✅ Good - Set timeout
client := &http.Client{
    Timeout: 30 * time.Second,
}

// ✅ Better - More granular control
client := &http.Client{
    Transport: &http.Transport{
        DialContext: (&net.Dialer{
            Timeout:   5 * time.Second,
            KeepAlive: 30 * time.Second,
        }).DialContext,
        TLSHandshakeTimeout:   5 * time.Second,
        ResponseHeaderTimeout: 10 * time.Second,
        IdleConnTimeout:       90 * time.Second,
        MaxIdleConns:          100,
        MaxIdleConnsPerHost:   10,
    },
    Timeout: 30 * time.Second,
}
```

## Database Issues

### Connection Pool Exhaustion
```go
// ❌ Bad - Rows not closed
func getUsers(db *sql.DB) ([]User, error) {
    rows, err := db.Query("SELECT * FROM users")
    if err != nil {
        return nil, err
    }
    // rows.Close() never called!
    
    var users []User
    for rows.Next() {
        // ...
    }
    return users, nil
}

// ✅ Good - Always close rows
func getUsers(db *sql.DB) ([]User, error) {
    rows, err := db.Query("SELECT * FROM users")
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var users []User
    for rows.Next() {
        // ...
    }
    
    if err := rows.Err(); err != nil {
        return nil, err
    }
    
    return users, nil
}
```

### Prepared Statement in Loop
```go
// ❌ Bad - Creates statement each iteration
for _, id := range ids {
    rows, err := db.Query("SELECT * FROM users WHERE id = $1", id)
    // ...
}

// ✅ Good - Prepare once, use many times
stmt, err := db.Prepare("SELECT * FROM users WHERE id = $1")
if err != nil {
    return err
}
defer stmt.Close()

for _, id := range ids {
    rows, err := stmt.Query(id)
    // ...
}
```

## JSON Issues

### Unexported Fields
```go
// ❌ Problem - Fields won't be serialized
type User struct {
    name  string // unexported, won't serialize
    email string
}

// ✅ Good - Exported fields
type User struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}
```

### Time Serialization
```go
// ❌ Problem - Default time format might not match API
type Event struct {
    StartTime time.Time `json:"start_time"`
}

// ✅ Good - Custom time format
type CustomTime time.Time

func (t CustomTime) MarshalJSON() ([]byte, error) {
    formatted := time.Time(t).Format("2006-01-02")
    return json.Marshal(formatted)
}

func (t *CustomTime) UnmarshalJSON(data []byte) error {
    var s string
    if err := json.Unmarshal(data, &s); err != nil {
        return err
    }
    parsed, err := time.Parse("2006-01-02", s)
    if err != nil {
        return err
    }
    *t = CustomTime(parsed)
    return nil
}
```

## Testing Issues

### Test Pollution
```go
// ❌ Bad - Shared state between tests
var globalDB *sql.DB

func TestCreate(t *testing.T) {
    globalDB.Exec("INSERT INTO users ...")
}

func TestList(t *testing.T) {
    // Depends on TestCreate running first!
}

// ✅ Good - Isolated tests
func TestCreate(t *testing.T) {
    db := setupTestDB(t)
    t.Cleanup(func() { teardownTestDB(db) })
    
    // Test logic
}

func TestList(t *testing.T) {
    db := setupTestDB(t)
    t.Cleanup(func() { teardownTestDB(db) })
    
    // Seed own test data
}
```

### Parallel Test Issues
```go
// ❌ Bad - Race condition in parallel tests
func TestParallel(t *testing.T) {
    tests := []struct{
        name string
        input int
    }{
        {"test1", 1},
        {"test2", 2},
    }
    
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            result := process(tc.input) // tc is shared!
        })
    }
}

// ✅ Good - Capture test case
func TestParallel(t *testing.T) {
    tests := []struct{
        name string
        input int
    }{
        {"test1", 1},
        {"test2", 2},
    }
    
    for _, tc := range tests {
        tc := tc // Capture!
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            result := process(tc.input)
        })
    }
}
```

## Context Issues

### Storing Values in Context
```go
// ❌ Bad - Using string key (collisions)
ctx = context.WithValue(ctx, "userID", userID)

// ✅ Good - Use typed key
type contextKey string

const userIDKey contextKey = "userID"

ctx = context.WithValue(ctx, userIDKey, userID)
```

### Ignoring Context Cancellation
```go
// ❌ Bad - Ignoring cancellation
func longOperation(ctx context.Context) error {
    for i := 0; i < 1000; i++ {
        doWork(i) // Doesn't check context
    }
    return nil
}

// ✅ Good - Check context regularly
func longOperation(ctx context.Context) error {
    for i := 0; i < 1000; i++ {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            doWork(i)
        }
    }
    return nil
}
```
