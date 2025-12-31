# Go (Golang) Security Guidelines

## Authentication

### JWT Authentication
```go
package auth

import (
    "errors"
    "time"
    
    "github.com/golang-jwt/jwt/v5"
)

var (
    ErrInvalidToken = errors.New("invalid token")
    ErrExpiredToken = errors.New("token has expired")
)

type Claims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

type JWTService struct {
    secretKey     []byte
    accessExpiry  time.Duration
    refreshExpiry time.Duration
}

func NewJWTService(secretKey string, accessExpiry, refreshExpiry time.Duration) *JWTService {
    return &JWTService{
        secretKey:     []byte(secretKey),
        accessExpiry:  accessExpiry,
        refreshExpiry: refreshExpiry,
    }
}

func (s *JWTService) GenerateAccessToken(userID, email, role string) (string, error) {
    claims := Claims{
        UserID: userID,
        Email:  email,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.accessExpiry)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
        },
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(s.secretKey)
}

func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, ErrInvalidToken
        }
        return s.secretKey, nil
    })
    
    if err != nil {
        if errors.Is(err, jwt.ErrTokenExpired) {
            return nil, ErrExpiredToken
        }
        return nil, ErrInvalidToken
    }
    
    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, ErrInvalidToken
    }
    
    return claims, nil
}
```

### Authentication Middleware
```go
func AuthMiddleware(jwtService *JWTService) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            authHeader := r.Header.Get("Authorization")
            if authHeader == "" {
                http.Error(w, "Missing authorization header", http.StatusUnauthorized)
                return
            }
            
            // Extract token from "Bearer <token>"
            parts := strings.Split(authHeader, " ")
            if len(parts) != 2 || parts[0] != "Bearer" {
                http.Error(w, "Invalid authorization header", http.StatusUnauthorized)
                return
            }
            
            claims, err := jwtService.ValidateToken(parts[1])
            if err != nil {
                if errors.Is(err, ErrExpiredToken) {
                    http.Error(w, "Token expired", http.StatusUnauthorized)
                    return
                }
                http.Error(w, "Invalid token", http.StatusUnauthorized)
                return
            }
            
            // Add claims to context
            ctx := context.WithValue(r.Context(), claimsKey, claims)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### Password Hashing
```go
import "golang.org/x/crypto/bcrypt"

type PasswordHasher interface {
    Hash(password string) (string, error)
    Verify(password, hash string) bool
}

type bcryptHasher struct {
    cost int
}

func NewBcryptHasher(cost int) PasswordHasher {
    if cost < bcrypt.MinCost {
        cost = bcrypt.DefaultCost
    }
    return &bcryptHasher{cost: cost}
}

func (h *bcryptHasher) Hash(password string) (string, error) {
    hash, err := bcrypt.GenerateFromPassword([]byte(password), h.cost)
    if err != nil {
        return "", fmt.Errorf("hashing password: %w", err)
    }
    return string(hash), nil
}

func (h *bcryptHasher) Verify(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

## Authorization

### Role-Based Access Control
```go
type Role string

const (
    RoleAdmin  Role = "admin"
    RoleUser   Role = "user"
    RoleGuest  Role = "guest"
)

type Permission string

const (
    PermissionReadUsers   Permission = "users:read"
    PermissionWriteUsers  Permission = "users:write"
    PermissionDeleteUsers Permission = "users:delete"
    PermissionReadOrders  Permission = "orders:read"
    PermissionWriteOrders Permission = "orders:write"
)

var rolePermissions = map[Role][]Permission{
    RoleAdmin: {
        PermissionReadUsers, PermissionWriteUsers, PermissionDeleteUsers,
        PermissionReadOrders, PermissionWriteOrders,
    },
    RoleUser: {
        PermissionReadUsers, PermissionReadOrders, PermissionWriteOrders,
    },
    RoleGuest: {
        PermissionReadOrders,
    },
}

func HasPermission(role Role, permission Permission) bool {
    permissions, ok := rolePermissions[role]
    if !ok {
        return false
    }
    
    for _, p := range permissions {
        if p == permission {
            return true
        }
    }
    return false
}

func RequirePermission(permission Permission) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims := ClaimsFromContext(r.Context())
            if claims == nil {
                http.Error(w, "Unauthorized", http.StatusUnauthorized)
                return
            }
            
            if !HasPermission(Role(claims.Role), permission) {
                http.Error(w, "Forbidden", http.StatusForbidden)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}
```

## Input Validation

```go
import "github.com/go-playground/validator/v10"

var validate = validator.New()

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email,max=255"`
    Password string `json:"password" validate:"required,min=8,max=128"`
    Name     string `json:"name" validate:"required,min=2,max=100"`
}

func (r *CreateUserRequest) Validate() error {
    if err := validate.Struct(r); err != nil {
        return formatValidationErrors(err)
    }
    return nil
}

func formatValidationErrors(err error) error {
    var validationErrs validator.ValidationErrors
    if errors.As(err, &validationErrs) {
        var messages []string
        for _, e := range validationErrs {
            messages = append(messages, fmt.Sprintf(
                "%s: failed on '%s' validation",
                e.Field(),
                e.Tag(),
            ))
        }
        return fmt.Errorf("validation failed: %s", strings.Join(messages, "; "))
    }
    return err
}

// Custom validation
func init() {
    validate.RegisterValidation("password_strength", validatePasswordStrength)
}

func validatePasswordStrength(fl validator.FieldLevel) bool {
    password := fl.Field().String()
    
    var hasUpper, hasLower, hasNumber, hasSpecial bool
    for _, char := range password {
        switch {
        case unicode.IsUpper(char):
            hasUpper = true
        case unicode.IsLower(char):
            hasLower = true
        case unicode.IsNumber(char):
            hasNumber = true
        case unicode.IsPunct(char) || unicode.IsSymbol(char):
            hasSpecial = true
        }
    }
    
    return hasUpper && hasLower && hasNumber && hasSpecial
}
```

## SQL Injection Prevention

```go
// ❌ Vulnerable to SQL injection
func (r *userRepo) FindByEmail(email string) (*User, error) {
    query := fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email)
    return r.db.Query(query)
}

// ✅ Safe - Parameterized query
func (r *userRepo) FindByEmail(ctx context.Context, email string) (*User, error) {
    query := `SELECT id, email, name FROM users WHERE email = $1`
    
    var user User
    err := r.db.QueryRowContext(ctx, query, email).Scan(
        &user.ID, &user.Email, &user.Name,
    )
    
    return &user, err
}

// ✅ Safe - Using query builder (sqlx)
func (r *userRepo) Search(ctx context.Context, filters SearchFilters) ([]*User, error) {
    query := sq.Select("id", "email", "name").
        From("users").
        Where(sq.Eq{"active": true})
    
    if filters.Email != "" {
        query = query.Where(sq.Like{"email": "%" + filters.Email + "%"})
    }
    
    if filters.Role != "" {
        query = query.Where(sq.Eq{"role": filters.Role})
    }
    
    sql, args, err := query.PlaceholderFormat(sq.Dollar).ToSql()
    if err != nil {
        return nil, err
    }
    
    var users []*User
    err = r.db.SelectContext(ctx, &users, sql, args...)
    return users, err
}
```

## Rate Limiting

```go
import (
    "sync"
    "time"
    
    "golang.org/x/time/rate"
)

type IPRateLimiter struct {
    ips map[string]*rate.Limiter
    mu  sync.RWMutex
    r   rate.Limit
    b   int
}

func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
    return &IPRateLimiter{
        ips: make(map[string]*rate.Limiter),
        r:   r,
        b:   b,
    }
}

func (l *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
    l.mu.Lock()
    defer l.mu.Unlock()
    
    limiter, exists := l.ips[ip]
    if !exists {
        limiter = rate.NewLimiter(l.r, l.b)
        l.ips[ip] = limiter
    }
    
    return limiter
}

func RateLimitMiddleware(limiter *IPRateLimiter) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            ip := getIP(r)
            
            if !limiter.GetLimiter(ip).Allow() {
                w.Header().Set("Retry-After", "60")
                http.Error(w, "Too many requests", http.StatusTooManyRequests)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}

func getIP(r *http.Request) string {
    // Check X-Forwarded-For header
    xff := r.Header.Get("X-Forwarded-For")
    if xff != "" {
        ips := strings.Split(xff, ",")
        return strings.TrimSpace(ips[0])
    }
    
    // Check X-Real-IP header
    xri := r.Header.Get("X-Real-IP")
    if xri != "" {
        return xri
    }
    
    // Fall back to RemoteAddr
    ip, _, _ := net.SplitHostPort(r.RemoteAddr)
    return ip
}
```

## CORS Configuration

```go
func CORSMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
    originSet := make(map[string]bool)
    for _, origin := range allowedOrigins {
        originSet[origin] = true
    }
    
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            
            if originSet[origin] {
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
                w.Header().Set("Access-Control-Max-Age", "86400")
                w.Header().Set("Access-Control-Allow-Credentials", "true")
            }
            
            if r.Method == "OPTIONS" {
                w.WriteHeader(http.StatusNoContent)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}
```

## Security Headers

```go
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Prevent MIME sniffing
        w.Header().Set("X-Content-Type-Options", "nosniff")
        
        // XSS protection
        w.Header().Set("X-XSS-Protection", "1; mode=block")
        
        // Clickjacking protection
        w.Header().Set("X-Frame-Options", "DENY")
        
        // HSTS (for HTTPS)
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        
        // Content Security Policy
        w.Header().Set("Content-Security-Policy", "default-src 'self'")
        
        // Referrer Policy
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        
        next.ServeHTTP(w, r)
    })
}
```

## Secrets Management

```go
// Never hardcode secrets
// ❌ Bad
const apiKey = "sk_live_abc123"

// ✅ Good - Environment variables
func LoadConfig() (*Config, error) {
    return &Config{
        JWTSecret:   mustGetEnv("JWT_SECRET"),
        DBPassword:  mustGetEnv("DB_PASSWORD"),
        APIKey:      mustGetEnv("API_KEY"),
    }, nil
}

func mustGetEnv(key string) string {
    value := os.Getenv(key)
    if value == "" {
        log.Fatalf("Required environment variable %s is not set", key)
    }
    return value
}

// ✅ Good - Using Vault
type VaultSecrets struct {
    client *vault.Client
}

func (v *VaultSecrets) GetSecret(path string) (string, error) {
    secret, err := v.client.Logical().Read(path)
    if err != nil {
        return "", fmt.Errorf("reading secret: %w", err)
    }
    
    if secret == nil || secret.Data == nil {
        return "", fmt.Errorf("secret not found")
    }
    
    value, ok := secret.Data["data"].(map[string]interface{})["value"].(string)
    if !ok {
        return "", fmt.Errorf("invalid secret format")
    }
    
    return value, nil
}
```

## Secure File Handling

```go
const (
    MaxUploadSize = 10 << 20 // 10 MB
)

var allowedMimeTypes = map[string]bool{
    "image/jpeg": true,
    "image/png":  true,
    "image/gif":  true,
    "application/pdf": true,
}

func (h *handler) UploadFile(w http.ResponseWriter, r *http.Request) {
    // Limit request body size
    r.Body = http.MaxBytesReader(w, r.Body, MaxUploadSize)
    
    if err := r.ParseMultipartForm(MaxUploadSize); err != nil {
        http.Error(w, "File too large", http.StatusRequestEntityTooLarge)
        return
    }
    
    file, header, err := r.FormFile("file")
    if err != nil {
        http.Error(w, "Error reading file", http.StatusBadRequest)
        return
    }
    defer file.Close()
    
    // Detect content type
    buffer := make([]byte, 512)
    _, err = file.Read(buffer)
    if err != nil {
        http.Error(w, "Error reading file", http.StatusBadRequest)
        return
    }
    
    contentType := http.DetectContentType(buffer)
    if !allowedMimeTypes[contentType] {
        http.Error(w, "File type not allowed", http.StatusBadRequest)
        return
    }
    
    // Reset file pointer
    file.Seek(0, 0)
    
    // Generate safe filename
    ext := filepath.Ext(header.Filename)
    safeFilename := uuid.New().String() + ext
    
    // Save file
    dst, err := os.Create(filepath.Join(uploadDir, safeFilename))
    if err != nil {
        http.Error(w, "Error saving file", http.StatusInternalServerError)
        return
    }
    defer dst.Close()
    
    if _, err := io.Copy(dst, file); err != nil {
        http.Error(w, "Error saving file", http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]string{
        "filename": safeFilename,
    })
}
```
