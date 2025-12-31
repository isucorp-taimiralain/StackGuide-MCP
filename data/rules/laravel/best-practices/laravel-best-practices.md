# Laravel Best Practices

## Eloquent Best Practices

### Query Optimization
```php
<?php

// ❌ Bad: N+1 query problem
$posts = Post::all();
foreach ($posts as $post) {
    echo $post->author->name; // Query per post
}

// ✅ Good: Eager loading
$posts = Post::with('author')->get();

// ✅ Good: Eager load nested relationships
$posts = Post::with(['author', 'comments.user'])->get();

// ✅ Good: Conditional eager loading
$posts = Post::with([
    'author',
    'comments' => fn($query) => $query->where('is_approved', true),
])->get();

// ✅ Good: Select specific columns
$users = User::select(['id', 'name', 'email'])->get();

// ✅ Good: Use exists() for checking existence
if (User::where('email', $email)->exists()) {
    // ...
}

// ✅ Good: Use chunk for large datasets
User::chunk(1000, function ($users) {
    foreach ($users as $user) {
        // Process
    }
});

// ✅ Good: Use lazy loading for very large datasets
foreach (User::lazy() as $user) {
    // Process
}
```

### Mass Assignment Protection
```php
<?php

// ❌ Bad: Filling all request data
$user = User::create($request->all());

// ✅ Good: Only validated data
$user = User::create($request->validated());

// ✅ Good: Explicit fillable
protected $fillable = ['name', 'email', 'password'];

// ✅ Good: Or explicit guarded
protected $guarded = ['id', 'is_admin'];
```

### Query Scopes
```php
<?php

// ✅ Good: Reusable query scopes
class Post extends Model
{
    public function scopePublished(Builder $query): Builder
    {
        return $query->where('is_published', true)
                     ->whereNotNull('published_at');
    }

    public function scopeByAuthor(Builder $query, User $user): Builder
    {
        return $query->where('user_id', $user->id);
    }

    public function scopeRecent(Builder $query, int $days = 7): Builder
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }
}

// Usage
$posts = Post::published()->recent(30)->byAuthor($user)->get();
```

## Controller Best Practices

### Single Responsibility
```php
<?php

// ❌ Bad: Fat controller
class UserController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([/* rules */]);
        
        $user = User::create($validated);
        
        // Send email
        Mail::to($user)->send(new WelcomeMail($user));
        
        // Create profile
        Profile::create(['user_id' => $user->id]);
        
        // Log activity
        Activity::log('user.created', $user);
        
        return response()->json($user);
    }
}

// ✅ Good: Thin controller with services
class UserController extends Controller
{
    public function __construct(
        private readonly UserService $userService
    ) {}

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = $this->userService->create($request->validated());

        return new UserResource($user);
    }
}
```

### Route Model Binding
```php
<?php

// ✅ Good: Implicit binding
Route::get('/users/{user}', [UserController::class, 'show']);

public function show(User $user): UserResource
{
    return new UserResource($user);
}

// ✅ Good: Custom key
Route::get('/users/{user:slug}', [UserController::class, 'show']);

// ✅ Good: Scoped bindings
Route::get('/teams/{team}/users/{user}', function (Team $team, User $user) {
    // $user belongs to $team
})->scopeBindings();
```

## Validation Best Practices

### Custom Validation Rules
```php
<?php

// Create custom rule
php artisan make:rule StrongPassword

class StrongPassword implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (strlen($value) < 8) {
            $fail('The :attribute must be at least 8 characters.');
            return;
        }

        if (!preg_match('/[A-Z]/', $value)) {
            $fail('The :attribute must contain an uppercase letter.');
            return;
        }

        if (!preg_match('/[0-9]/', $value)) {
            $fail('The :attribute must contain a number.');
        }
    }
}

// Usage
'password' => ['required', new StrongPassword()]
```

### After Validation Hook
```php
<?php

class StoreOrderRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($this->stockIsInsufficient()) {
                $validator->errors()->add('quantity', 'Insufficient stock');
            }
        });
    }

    private function stockIsInsufficient(): bool
    {
        $product = Product::find($this->product_id);
        return $product && $product->stock < $this->quantity;
    }
}
```

## Caching

### Cache Usage
```php
<?php

// ✅ Good: Cache expensive queries
$users = Cache::remember('users.active', 3600, function () {
    return User::active()->with('profile')->get();
});

// ✅ Good: Cache tags for easy invalidation
$posts = Cache::tags(['posts', 'user:'.$userId])->remember(
    'user.posts.'.$userId,
    3600,
    fn() => Post::where('user_id', $userId)->get()
);

// Clear by tag
Cache::tags(['posts'])->flush();

// ✅ Good: Cache lock for concurrent operations
$lock = Cache::lock('process-payment', 10);

if ($lock->get()) {
    try {
        // Process payment
    } finally {
        $lock->release();
    }
}

// ✅ Good: Atomic cache operations
$value = Cache::increment('page.views');
```

### Cache Invalidation
```php
<?php

class Post extends Model
{
    protected static function booted(): void
    {
        static::saved(function (Post $post) {
            Cache::forget("post.{$post->id}");
            Cache::tags(['posts'])->flush();
        });

        static::deleted(function (Post $post) {
            Cache::forget("post.{$post->id}");
            Cache::tags(['posts'])->flush();
        });
    }
}
```

## Queue Jobs

### Job Best Practices
```php
<?php

namespace App\Jobs;

use App\Models\User;
use App\Mail\WelcomeMail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class SendWelcomeEmail implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;
    public int $timeout = 120;
    public int $uniqueFor = 3600;

    public function __construct(
        public readonly User $user
    ) {}

    public function uniqueId(): string
    {
        return $this->user->id;
    }

    public function handle(): void
    {
        Mail::to($this->user)->send(new WelcomeMail($this->user));
    }

    public function failed(\Throwable $exception): void
    {
        // Handle failure - log, notify admin, etc.
        Log::error('Failed to send welcome email', [
            'user_id' => $this->user->id,
            'error' => $exception->getMessage(),
        ]);
    }

    public function retryUntil(): \DateTime
    {
        return now()->addHours(24);
    }
}

// Dispatch
SendWelcomeEmail::dispatch($user);

// Delayed dispatch
SendWelcomeEmail::dispatch($user)->delay(now()->addMinutes(10));

// Chain jobs
Bus::chain([
    new ProcessOrder($order),
    new SendOrderConfirmation($order),
    new NotifyWarehouse($order),
])->dispatch();
```

## Events & Listeners

### Event-Driven Architecture
```php
<?php

// Event
class OrderPlaced
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Order $order
    ) {}
}

// Listeners
class SendOrderConfirmation
{
    public function handle(OrderPlaced $event): void
    {
        Mail::to($event->order->user)->send(
            new OrderConfirmationMail($event->order)
        );
    }
}

class UpdateInventory
{
    public function handle(OrderPlaced $event): void
    {
        foreach ($event->order->items as $item) {
            $item->product->decrement('stock', $item->quantity);
        }
    }
}

// EventServiceProvider
protected $listen = [
    OrderPlaced::class => [
        SendOrderConfirmation::class,
        UpdateInventory::class,
        NotifyWarehouse::class,
    ],
];

// Dispatch event
event(new OrderPlaced($order));
// Or
OrderPlaced::dispatch($order);
```

## Error Handling

### Custom Exception Handler
```php
<?php

// app/Exceptions/Handler.php
public function register(): void
{
    $this->reportable(function (Throwable $e) {
        // Report to external service
        if (app()->bound('sentry')) {
            app('sentry')->captureException($e);
        }
    });

    $this->renderable(function (ModelNotFoundException $e, Request $request) {
        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Resource not found',
            ], 404);
        }
    });

    $this->renderable(function (AuthorizationException $e, Request $request) {
        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'You are not authorized to perform this action',
            ], 403);
        }
    });
}

// Custom exceptions
class InsufficientStockException extends Exception
{
    public function __construct(
        public readonly Product $product,
        public readonly int $requested,
        public readonly int $available
    ) {
        parent::__construct("Insufficient stock for {$product->name}");
    }

    public function render(Request $request)
    {
        if ($request->wantsJson()) {
            return response()->json([
                'message' => $this->getMessage(),
                'product' => $this->product->id,
                'requested' => $this->requested,
                'available' => $this->available,
            ], 422);
        }
    }
}
```

## Testing

### Feature Tests
```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_list_users(): void
    {
        $user = User::factory()->create();
        
        $this->actingAs($user)
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'email'],
                ],
                'meta' => ['current_page', 'total'],
            ]);
    }

    public function test_can_create_user(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->postJson('/api/users', [
                'name' => 'John Doe',
                'email' => 'john@example.com',
                'password' => 'Password123!',
                'password_confirmation' => 'Password123!',
            ])
            ->assertCreated()
            ->assertJson([
                'data' => [
                    'name' => 'John Doe',
                    'email' => 'john@example.com',
                ],
            ]);

        $this->assertDatabaseHas('users', ['email' => 'john@example.com']);
    }

    public function test_cannot_create_user_with_duplicate_email(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create(['email' => 'existing@example.com']);

        $this->actingAs($admin)
            ->postJson('/api/users', [
                'name' => 'John Doe',
                'email' => 'existing@example.com',
                'password' => 'Password123!',
                'password_confirmation' => 'Password123!',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }
}
```

## Performance

### Database Optimization
```php
<?php

// Use database transactions
DB::transaction(function () {
    $order = Order::create($orderData);
    
    foreach ($items as $item) {
        $order->items()->create($item);
    }
    
    return $order;
}, 5); // 5 retry attempts on deadlock

// Use raw queries for complex operations
DB::table('products')
    ->join('orders', 'products.id', '=', 'orders.product_id')
    ->select('products.name', DB::raw('SUM(orders.quantity) as total'))
    ->groupBy('products.name')
    ->having('total', '>', 100)
    ->get();

// Batch inserts
$chunks = collect($data)->chunk(1000);
foreach ($chunks as $chunk) {
    User::insert($chunk->toArray());
}

// Upsert
User::upsert([
    ['email' => 'a@example.com', 'name' => 'A'],
    ['email' => 'b@example.com', 'name' => 'B'],
], ['email'], ['name']);
```

### Response Optimization
```php
<?php

// Compress responses
// In middleware
public function handle($request, Closure $next)
{
    $response = $next($request);
    
    if ($this->shouldCompress($request, $response)) {
        $content = gzencode($response->getContent(), 6);
        $response->setContent($content);
        $response->headers->set('Content-Encoding', 'gzip');
    }
    
    return $response;
}
```
