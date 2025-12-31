# Laravel Security Guidelines

## Authentication

### Sanctum API Authentication
```php
<?php

// config/sanctum.php
return [
    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', '')),
    'expiration' => 60 * 24, // 24 hours
    'guard' => ['web'],
    'middleware' => [
        'verify_csrf_token' => \App\Http\Middleware\VerifyCsrfToken::class,
        'encrypt_cookies' => \App\Http\Middleware\EncryptCookies::class,
    ],
];

// AuthController.php
class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        if (!Auth::attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $user = Auth::user();
        
        // Revoke existing tokens
        $user->tokens()->delete();
        
        // Create new token with abilities
        $token = $user->createToken('auth-token', $this->getAbilities($user));

        return response()->json([
            'user' => new UserResource($user),
            'token' => $token->plainTextToken,
            'expires_at' => now()->addHours(24)->toISOString(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully']);
    }

    private function getAbilities(User $user): array
    {
        return match ($user->role) {
            'admin' => ['*'],
            'moderator' => ['read', 'write', 'moderate'],
            default => ['read', 'write'],
        };
    }
}

// Protect routes
Route::middleware('auth:sanctum')->group(function () {
    // Protected routes
});

// Check token abilities
Route::middleware(['auth:sanctum', 'ability:moderate'])->group(function () {
    // Only users with 'moderate' ability
});
```

### Password Security
```php
<?php

// Strong password validation
use Illuminate\Validation\Rules\Password;

'password' => [
    'required',
    'confirmed',
    Password::min(8)
        ->mixedCase()
        ->numbers()
        ->symbols()
        ->uncompromised(), // Check against haveibeenpwned
],

// Rate limit login attempts
// In LoginController or custom middleware
protected function throttleKey(Request $request): string
{
    return Str::lower($request->input('email')) . '|' . $request->ip();
}

RateLimiter::for('login', function (Request $request) {
    return Limit::perMinute(5)->by($request->email . '|' . $request->ip());
});

// Password reset with expiration
// config/auth.php
'passwords' => [
    'users' => [
        'provider' => 'users',
        'table' => 'password_resets',
        'expire' => 60, // Token expires in 60 minutes
        'throttle' => 60, // Wait 60 seconds before retrying
    ],
],
```

## Authorization

### Policies
```php
<?php

// Create policy
php artisan make:policy PostPolicy --model=Post

class PostPolicy
{
    public function before(User $user, string $ability): ?bool
    {
        if ($user->isAdmin()) {
            return true;
        }
        return null;
    }

    public function update(User $user, Post $post): Response
    {
        if ($user->id !== $post->user_id) {
            return Response::deny('You do not own this post.');
        }

        if ($post->is_locked) {
            return Response::deny('This post is locked.');
        }

        return Response::allow();
    }

    public function delete(User $user, Post $post): bool
    {
        return $user->id === $post->user_id;
    }
}

// Register in AuthServiceProvider
protected $policies = [
    Post::class => PostPolicy::class,
];

// Use in controller
public function update(UpdatePostRequest $request, Post $post)
{
    $this->authorize('update', $post);
    // Or
    Gate::authorize('update', $post);
    // Or
    if ($request->user()->cannot('update', $post)) {
        abort(403);
    }
}

// In Blade
@can('update', $post)
    <button>Edit</button>
@endcan
```

### Gates
```php
<?php

// AuthServiceProvider
public function boot(): void
{
    Gate::define('access-admin', function (User $user) {
        return $user->isAdmin();
    });

    Gate::define('manage-users', function (User $user) {
        return in_array($user->role, ['admin', 'hr']);
    });

    // Gate with model
    Gate::define('update-post', function (User $user, Post $post) {
        return $user->id === $post->user_id;
    });
}

// Usage
if (Gate::allows('access-admin')) {
    // ...
}

Gate::authorize('update-post', $post);
```

## Input Validation & Sanitization

### SQL Injection Prevention
```php
<?php

// ❌ Vulnerable
$users = DB::select("SELECT * FROM users WHERE name = '$name'");

// ✅ Safe: Parameter binding
$users = DB::select('SELECT * FROM users WHERE name = ?', [$name]);

// ✅ Safe: Query builder
$users = DB::table('users')->where('name', $name)->get();

// ✅ Safe: Eloquent
$users = User::where('name', $name)->get();

// ✅ For raw expressions, use bindings
$users = User::whereRaw('LOWER(name) = ?', [strtolower($name)])->get();
```

### XSS Prevention
```php
<?php

// Blade automatically escapes output
{{ $userInput }} // Safe

// Use {!! !!} only with sanitized content
{!! clean($htmlContent) !!}

// Sanitize HTML with purifier
use HTMLPurifier;

public function sanitize(string $html): string
{
    $config = HTMLPurifier_Config::createDefault();
    $config->set('HTML.Allowed', 'p,a[href],strong,em,ul,li,ol');
    
    $purifier = new HTMLPurifier($config);
    return $purifier->purify($html);
}

// In form request
protected function prepareForValidation(): void
{
    if ($this->has('bio')) {
        $this->merge([
            'bio' => strip_tags($this->bio),
        ]);
    }
}
```

### Mass Assignment Protection
```php
<?php

// Model
protected $fillable = ['name', 'email', 'password'];
// Or
protected $guarded = ['id', 'is_admin', 'role'];

// Never use
User::create($request->all()); // ❌

// Always use validated data
User::create($request->validated()); // ✅
```

## CSRF Protection

```php
<?php

// Automatically included in web middleware
// For API, use Sanctum with SPA authentication

// Exclude routes from CSRF (use sparingly)
// VerifyCsrfToken middleware
protected $except = [
    'webhook/*', // External webhooks
];

// In Blade forms
<form method="POST">
    @csrf
    <!-- form fields -->
</form>

// For AJAX
<meta name="csrf-token" content="{{ csrf_token() }}">

// JavaScript
axios.defaults.headers.common['X-CSRF-TOKEN'] = 
    document.querySelector('meta[name="csrf-token"]').getAttribute('content');
```

## Rate Limiting

```php
<?php

// RouteServiceProvider
protected function configureRateLimiting(): void
{
    // General API rate limit
    RateLimiter::for('api', function (Request $request) {
        return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
    });

    // Strict limit for auth endpoints
    RateLimiter::for('auth', function (Request $request) {
        return [
            Limit::perMinute(5)->by($request->ip()),
            Limit::perMinute(10)->by($request->input('email')),
        ];
    });

    // Dynamic rate limiting
    RateLimiter::for('premium', function (Request $request) {
        return $request->user()?->isPremium()
            ? Limit::perMinute(1000)
            : Limit::perMinute(100);
    });
}

// Apply in routes
Route::middleware(['throttle:auth'])->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
});
```

## File Upload Security

```php
<?php

class UploadController extends Controller
{
    private const ALLOWED_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'pdf'];
    private const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => [
                'required',
                'file',
                'max:5120', // 5MB in KB
                'mimes:jpg,jpeg,png,gif,pdf',
            ],
        ]);

        $file = $request->file('file');

        // Validate MIME type (not just extension)
        $mimeType = $file->getMimeType();
        $allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        
        if (!in_array($mimeType, $allowedMimes)) {
            throw ValidationException::withMessages([
                'file' => 'Invalid file type.',
            ]);
        }

        // Generate safe filename
        $filename = Str::uuid() . '.' . $file->getClientOriginalExtension();

        // Store in private disk (not public)
        $path = $file->storeAs('uploads', $filename, 'private');

        return response()->json([
            'path' => $path,
            'url' => route('files.download', ['path' => $path]),
        ]);
    }

    public function download(Request $request, string $path): Response
    {
        // Authorization check
        if (!$request->user()->canAccessFile($path)) {
            abort(403);
        }

        return Storage::disk('private')->download($path);
    }
}
```

## Security Headers

```php
<?php

// Middleware
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=()');
        
        if (config('app.env') === 'production') {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains; preload'
            );
        }

        return $response;
    }
}

// Register in Kernel.php
protected $middleware = [
    // ...
    \App\Http\Middleware\SecurityHeaders::class,
];
```

## Encryption

```php
<?php

// Encrypt sensitive data
use Illuminate\Support\Facades\Crypt;

$encrypted = Crypt::encryptString($sensitiveData);
$decrypted = Crypt::decryptString($encrypted);

// Cast in model
protected $casts = [
    'ssn' => 'encrypted',
    'api_key' => 'encrypted:array',
];

// Custom encryption
class EncryptedCast implements CastsAttributes
{
    public function get($model, $key, $value, $attributes)
    {
        return $value ? Crypt::decryptString($value) : null;
    }

    public function set($model, $key, $value, $attributes)
    {
        return $value ? Crypt::encryptString($value) : null;
    }
}
```

## Logging & Monitoring

```php
<?php

// Log security events
class SecurityEventLogger
{
    public function logLoginAttempt(Request $request, bool $success): void
    {
        Log::channel('security')->info('Login attempt', [
            'email' => $request->email,
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'success' => $success,
            'timestamp' => now(),
        ]);
    }

    public function logSuspiciousActivity(Request $request, string $reason): void
    {
        Log::channel('security')->warning('Suspicious activity', [
            'user_id' => $request->user()?->id,
            'ip' => $request->ip(),
            'path' => $request->path(),
            'reason' => $reason,
            'timestamp' => now(),
        ]);
    }
}

// config/logging.php
'channels' => [
    'security' => [
        'driver' => 'daily',
        'path' => storage_path('logs/security.log'),
        'level' => 'info',
        'days' => 90,
    ],
],
```

## Environment Security

```php
<?php

// Never commit .env
// .gitignore
.env

// Validate required env vars
// AppServiceProvider boot()
$required = ['APP_KEY', 'DB_PASSWORD', 'MAIL_PASSWORD'];
foreach ($required as $env) {
    if (empty(env($env))) {
        throw new RuntimeException("Missing required env var: {$env}");
    }
}

// Hide sensitive config in production
if (app()->isProduction()) {
    config(['app.debug' => false]);
    config(['app.debug_blacklist' => [
        '_ENV' => ['APP_KEY', 'DB_PASSWORD', 'MAIL_PASSWORD'],
        '_SERVER' => ['APP_KEY', 'DB_PASSWORD', 'MAIL_PASSWORD'],
    ]]);
}
```
