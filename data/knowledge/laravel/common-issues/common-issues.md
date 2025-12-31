# Laravel Common Issues and Solutions

## Eloquent Issues

### N+1 Query Problem
```php
<?php

// ❌ Problem: N+1 queries
$posts = Post::all();
foreach ($posts as $post) {
    echo $post->author->name; // Query per post
}

// ✅ Solution: Eager loading
$posts = Post::with('author')->get();

// ✅ Nested eager loading
$posts = Post::with(['author', 'comments.user'])->get();

// ✅ Conditional eager loading
$posts = Post::with([
    'comments' => fn($query) => $query->where('approved', true)
])->get();

// ✅ Lazy eager loading (when already fetched)
$posts = Post::all();
$posts->load('author');
```

### Mass Assignment Vulnerability
```php
<?php

// ❌ Problem: Allowing all fields
$user = User::create($request->all());

// ✅ Solution: Use validated data
$user = User::create($request->validated());

// ✅ Define fillable or guarded
protected $fillable = ['name', 'email', 'password'];
// Or
protected $guarded = ['id', 'is_admin'];
```

### Accessor/Mutator Not Working
```php
<?php

// ❌ Problem: Old accessor syntax in Laravel 9+
public function getNameAttribute($value)
{
    return ucfirst($value);
}

// ✅ Solution: New Attribute cast syntax (Laravel 9+)
protected function name(): Attribute
{
    return Attribute::make(
        get: fn (string $value) => ucfirst($value),
        set: fn (string $value) => strtolower($value),
    );
}

// ✅ Or use casts for common transformations
protected $casts = [
    'settings' => 'array',
    'published_at' => 'datetime',
    'is_active' => 'boolean',
];
```

### Model Events Not Firing
```php
<?php

// ❌ Problem: Events not firing with mass updates
User::where('role', 'guest')->update(['is_active' => false]);

// ✅ Solution: Iterate for events to fire
User::where('role', 'guest')->get()->each->update(['is_active' => false]);

// Or use chunk for large datasets
User::where('role', 'guest')->chunk(100, function ($users) {
    $users->each->update(['is_active' => false]);
});

// ❌ Problem: Events not firing with deleteMany
User::where('role', 'guest')->delete(); // No events

// ✅ Solution: Use model instances
User::where('role', 'guest')->get()->each->delete();
```

## Database Issues

### Migration Errors
```php
<?php

// ❌ Problem: Foreign key constraint fails
Schema::create('posts', function (Blueprint $table) {
    $table->foreignId('user_id')->constrained(); // Users table must exist first
});

// ✅ Solution: Correct migration order or use nullable
$table->foreignId('user_id')->nullable()->constrained();

// ❌ Problem: Column too long for index
$table->string('description', 1000)->index(); // May fail

// ✅ Solution: Limit index length
$table->string('description', 1000);
$table->index([DB::raw('description(191)')]);

// Or in MySQL config
// innodb_large_prefix=1
```

### Query Scopes Not Chaining
```php
<?php

// ❌ Problem: Scope doesn't return query builder
public function scopeActive($query)
{
    $query->where('is_active', true);
    // Missing return!
}

// ✅ Solution: Always return the query
public function scopeActive(Builder $query): Builder
{
    return $query->where('is_active', true);
}
```

## Validation Issues

### Validation Not Working
```php
<?php

// ❌ Problem: Validation rules not applied
public function store(Request $request)
{
    $request->validate(['name' => 'required']);
    // Works but Form Request is better
}

// ✅ Solution: Use Form Request for complex validation
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', Rule::unique('users')],
        ];
    }
}

// Controller
public function store(StoreUserRequest $request)
{
    User::create($request->validated());
}
```

### Custom Validation Rule Not Working
```php
<?php

// ❌ Problem: Rule not returning validation result
Rule::make('custom', function ($attribute, $value, $fail) {
    if ($value < 10) {
        return false; // Doesn't work
    }
});

// ✅ Solution: Call $fail closure on failure
Rule::make('custom', function ($attribute, $value, $fail) {
    if ($value < 10) {
        $fail('The :attribute must be at least 10.');
    }
});

// ✅ Or use Rule class
class MinValue implements ValidationRule
{
    public function __construct(private int $min) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value < $this->min) {
            $fail("The :attribute must be at least {$this->min}.");
        }
    }
}
```

## Queue Issues

### Jobs Not Processing
```bash
# ❌ Problem: Queue worker not running
php artisan queue:work # Needs to keep running

# ✅ Solution: Use Supervisor in production
[program:laravel-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/artisan queue:work redis --sleep=3 --tries=3
autostart=true
autorestart=true
numprocs=8

# Or use queue:listen for development
php artisan queue:listen
```

### Job Failed Without Error
```php
<?php

// ❌ Problem: Exception swallowed
public function handle()
{
    try {
        // Do something
    } catch (Exception $e) {
        // Logged but job marked successful
    }
}

// ✅ Solution: Re-throw or use fail()
public function handle()
{
    try {
        // Do something
    } catch (Exception $e) {
        Log::error($e->getMessage());
        $this->fail($e);
    }
}
```

### Serialization Issues
```php
<?php

// ❌ Problem: Model not found after serialization
class ProcessOrder implements ShouldQueue
{
    use SerializesModels;
    
    public function __construct(public Order $order) {}
    
    public function handle()
    {
        // Order may not exist if deleted before job runs
    }
}

// ✅ Solution: Handle missing model
public function handle()
{
    if (!$this->order->exists) {
        Log::warning('Order not found', ['order_id' => $this->order->id]);
        return;
    }
    // Process order
}

// Or delete job if model missing
public $deleteWhenMissingModels = true;
```

## Authentication Issues

### Auth Not Working in API
```php
<?php

// ❌ Problem: Using web guard for API
Route::middleware('auth')->get('/user', fn() => auth()->user());

// ✅ Solution: Use sanctum guard
Route::middleware('auth:sanctum')->get('/user', fn() => auth()->user());

// Or in config/auth.php
'defaults' => [
    'guard' => 'sanctum', // For API-first apps
],
```

### Policy Not Found
```php
<?php

// ❌ Problem: Policy not registered
$this->authorize('update', $post); // Policy not found

// ✅ Solution: Register in AuthServiceProvider
protected $policies = [
    Post::class => PostPolicy::class,
];

// Or auto-discovery (if following naming convention)
// App\Policies\PostPolicy for App\Models\Post
```

## Cache Issues

### Cache Not Clearing
```bash
# ❌ Problem: Cache still showing old data

# ✅ Solution: Clear all caches
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

# Or optimize for production
php artisan optimize:clear
```

### Cache Race Condition
```php
<?php

// ❌ Problem: Multiple requests generating same cache
$value = Cache::get('key'); // Miss
// Another request also gets miss
$value = expensiveOperation(); // Computed twice
Cache::put('key', $value);

// ✅ Solution: Use atomic lock
$value = Cache::lock('key-lock')->block(5, function () {
    return Cache::remember('key', 3600, function () {
        return expensiveOperation();
    });
});

// Or use cache lock with remember
$value = Cache::remember('key', 3600, function () {
    return Cache::lock('generating-key')->block(5, function () {
        return expensiveOperation();
    });
});
```

## Testing Issues

### Database Not Refreshing
```php
<?php

// ❌ Problem: Test data persisting
class UserTest extends TestCase
{
    public function test_creates_user()
    {
        User::factory()->create(['email' => 'test@example.com']);
        // Next test may fail due to duplicate email
    }
}

// ✅ Solution: Use RefreshDatabase trait
class UserTest extends TestCase
{
    use RefreshDatabase;
    
    // Database refreshed between tests
}

// ✅ Or use DatabaseTransactions for faster tests
use DatabaseTransactions;
```

### Mocking Not Working
```php
<?php

// ❌ Problem: Mock not being used
$mock = Mockery::mock(PaymentService::class);
$mock->shouldReceive('charge')->andReturn(true);

// Service still uses real implementation

// ✅ Solution: Bind mock to container
$this->mock(PaymentService::class, function ($mock) {
    $mock->shouldReceive('charge')->andReturn(true);
});

// Or use swap
$this->swap(PaymentService::class, $mock);
```

## Performance Issues

### Slow Queries
```php
<?php

// ❌ Problem: Unoptimized queries
User::all()->filter(fn($u) => $u->is_active); // Loads all users

// ✅ Solution: Filter at database level
User::where('is_active', true)->get();

// ✅ Add indexes for frequently queried columns
Schema::table('users', function (Blueprint $table) {
    $table->index('is_active');
    $table->index(['role', 'is_active']); // Composite index
});

// ✅ Use query caching
$users = Cache::remember('active-users', 3600, function () {
    return User::where('is_active', true)->get();
});
```

### Memory Exhaustion
```php
<?php

// ❌ Problem: Loading too much data
$users = User::all(); // Millions of records

// ✅ Solution: Use chunking
User::chunk(1000, function ($users) {
    foreach ($users as $user) {
        // Process
    }
});

// ✅ Or lazy loading for iteration
foreach (User::lazy() as $user) {
    // Process one at a time
}

// ✅ Use cursor for memory efficiency
foreach (User::cursor() as $user) {
    // Hydrates one model at a time
}
```

## Deployment Issues

### Config Not Loading
```bash
# ❌ Problem: Environment changes not reflected

# ✅ Solution: Clear and cache config
php artisan config:clear
php artisan config:cache

# In production, always cache
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Storage Permissions
```bash
# ❌ Problem: Permission denied errors

# ✅ Solution: Set correct permissions
chmod -R 775 storage bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

# Create storage link
php artisan storage:link
```

### Composer Autoload Issues
```bash
# ❌ Problem: Class not found after adding new files

# ✅ Solution: Dump autoload
composer dump-autoload

# In production
composer install --optimize-autoloader --no-dev
```
