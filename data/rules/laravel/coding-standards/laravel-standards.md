# Laravel Coding Standards

## Project Structure

### Directory Layout
```
app/
├── Console/              # Artisan commands
│   └── Commands/
├── Exceptions/           # Exception handlers
├── Http/
│   ├── Controllers/      # HTTP controllers
│   ├── Middleware/       # Request middleware
│   ├── Requests/         # Form requests (validation)
│   └── Resources/        # API resources
├── Models/               # Eloquent models
├── Policies/             # Authorization policies
├── Providers/            # Service providers
├── Repositories/         # Repository pattern (optional)
├── Services/             # Business logic services
└── Jobs/                 # Queue jobs
config/                   # Configuration files
database/
├── factories/            # Model factories
├── migrations/           # Database migrations
└── seeders/              # Database seeders
resources/
├── views/                # Blade templates
├── js/                   # JavaScript assets
└── css/                  # CSS assets
routes/
├── api.php               # API routes
├── web.php               # Web routes
└── console.php           # Console routes
tests/
├── Feature/              # Feature tests
└── Unit/                 # Unit tests
```

## Controllers

### Resource Controller
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Http\Resources\UserCollection;
use App\Models\User;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class UserController extends Controller
{
    public function __construct(
        private readonly UserService $userService
    ) {}

    public function index(): UserCollection
    {
        $users = User::query()
            ->when(request('search'), fn($q, $search) => 
                $q->where('name', 'like', "%{$search}%")
            )
            ->when(request('role'), fn($q, $role) => 
                $q->where('role', $role)
            )
            ->orderBy(request('sort', 'created_at'), request('order', 'desc'))
            ->paginate(request('per_page', 15));

        return new UserCollection($users);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = $this->userService->create($request->validated());

        return (new UserResource($user))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(User $user): UserResource
    {
        return new UserResource($user->load(['posts', 'profile']));
    }

    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $user = $this->userService->update($user, $request->validated());

        return new UserResource($user);
    }

    public function destroy(User $user): JsonResponse
    {
        $this->authorize('delete', $user);
        
        $this->userService->delete($user);

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }
}
```

## Form Requests

### Validation Requests
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

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
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('users'),
            ],
            'password' => [
                'required',
                'confirmed',
                Password::min(8)
                    ->mixedCase()
                    ->numbers()
                    ->symbols()
                    ->uncompromised(),
            ],
            'role' => ['sometimes', Rule::in(['admin', 'user', 'moderator'])],
            'profile' => ['sometimes', 'array'],
            'profile.bio' => ['nullable', 'string', 'max:500'],
            'profile.avatar' => ['nullable', 'image', 'max:2048'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'This email is already registered.',
            'password.uncompromised' => 'This password has been compromised. Please choose a different one.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => strtolower($this->email),
        ]);
    }
}

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('user'));
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => [
                'sometimes',
                'string',
                'email',
                'max:255',
                Rule::unique('users')->ignore($this->route('user')),
            ],
            'password' => [
                'sometimes',
                'confirmed',
                Password::min(8)->mixedCase()->numbers(),
            ],
        ];
    }
}
```

## Models

### Eloquent Model
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;

class User extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_active' => 'boolean',
        'settings' => 'array',
    ];

    protected $attributes = [
        'role' => 'user',
        'is_active' => true,
    ];

    // Relationships
    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class);
    }

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    // Accessors & Mutators (Laravel 9+)
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn (string $value) => ucfirst($value),
            set: fn (string $value) => strtolower($value),
        );
    }

    protected function password(): Attribute
    {
        return Attribute::make(
            set: fn (string $value) => bcrypt($value),
        );
    }

    // Scopes
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeRole(Builder $query, string $role): Builder
    {
        return $query->where('role', $role);
    }

    public function scopeSearch(Builder $query, string $search): Builder
    {
        return $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
              ->orWhere('email', 'like', "%{$search}%");
        });
    }

    // Custom Methods
    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function hasPermission(string $permission): bool
    {
        return in_array($permission, $this->permissions ?? []);
    }
}
```

## API Resources

### Resource Transformers
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'is_active' => $this->is_active,
            'profile' => new ProfileResource($this->whenLoaded('profile')),
            'posts' => PostResource::collection($this->whenLoaded('posts')),
            'posts_count' => $this->when(
                $this->posts_count !== null,
                $this->posts_count
            ),
            'created_at' => $this->created_at->toISOString(),
            'updated_at' => $this->updated_at->toISOString(),
            
            // Conditional fields
            $this->mergeWhen($request->user()?->isAdmin(), [
                'email_verified_at' => $this->email_verified_at,
                'last_login_at' => $this->last_login_at,
            ]),
        ];
    }

    public function with(Request $request): array
    {
        return [
            'meta' => [
                'api_version' => '1.0',
            ],
        ];
    }
}

// Collection with pagination
class UserCollection extends ResourceCollection
{
    public $collects = UserResource::class;

    public function toArray(Request $request): array
    {
        return [
            'data' => $this->collection,
        ];
    }

    public function paginationInformation($request, $paginated, $default): array
    {
        return [
            'meta' => [
                'current_page' => $paginated['current_page'],
                'last_page' => $paginated['last_page'],
                'per_page' => $paginated['per_page'],
                'total' => $paginated['total'],
            ],
            'links' => [
                'first' => $paginated['first_page_url'],
                'last' => $paginated['last_page_url'],
                'prev' => $paginated['prev_page_url'],
                'next' => $paginated['next_page_url'],
            ],
        ];
    }
}
```

## Services

### Service Layer
```php
<?php

namespace App\Services;

use App\Models\User;
use App\Events\UserCreated;
use App\Notifications\WelcomeNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserService
{
    public function __construct(
        private readonly ProfileService $profileService
    ) {}

    public function create(array $data): User
    {
        return DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => $data['role'] ?? 'user',
            ]);

            if (isset($data['profile'])) {
                $this->profileService->create($user, $data['profile']);
            }

            event(new UserCreated($user));
            $user->notify(new WelcomeNotification());

            return $user->fresh(['profile']);
        });
    }

    public function update(User $user, array $data): User
    {
        return DB::transaction(function () use ($user, $data) {
            $user->update($data);

            if (isset($data['profile'])) {
                $this->profileService->update($user, $data['profile']);
            }

            return $user->fresh(['profile']);
        });
    }

    public function delete(User $user): bool
    {
        return DB::transaction(function () use ($user) {
            $user->profile?->delete();
            return $user->delete();
        });
    }

    public function changePassword(User $user, string $currentPassword, string $newPassword): bool
    {
        if (!Hash::check($currentPassword, $user->password)) {
            throw new \InvalidArgumentException('Current password is incorrect');
        }

        return $user->update(['password' => $newPassword]);
    }
}
```

## Policies

### Authorization Policies
```php
<?php

namespace App\Policies;

use App\Models\Post;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;
use Illuminate\Auth\Access\Response;

class PostPolicy
{
    use HandlesAuthorization;

    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Post $post): bool
    {
        return $post->is_published || $user->id === $post->user_id;
    }

    public function create(User $user): bool
    {
        return $user->hasVerifiedEmail();
    }

    public function update(User $user, Post $post): Response
    {
        if ($user->id !== $post->user_id && !$user->isAdmin()) {
            return Response::deny('You do not own this post.');
        }

        return Response::allow();
    }

    public function delete(User $user, Post $post): bool
    {
        return $user->id === $post->user_id || $user->isAdmin();
    }

    public function restore(User $user, Post $post): bool
    {
        return $user->isAdmin();
    }

    public function forceDelete(User $user, Post $post): bool
    {
        return $user->isAdmin();
    }
}
```

## Routes

### API Routes
```php
<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\PostController;
use Illuminate\Support\Facades\Route;

// Public routes
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/user', [AuthController::class, 'user']);
    
    // Users
    Route::apiResource('users', UserController::class);
    Route::post('/users/{user}/avatar', [UserController::class, 'uploadAvatar']);
    
    // Posts
    Route::apiResource('posts', PostController::class);
    Route::post('/posts/{post}/publish', [PostController::class, 'publish']);
    
    // Admin routes
    Route::middleware('can:admin')->prefix('admin')->group(function () {
        Route::get('/dashboard', [AdminController::class, 'dashboard']);
        Route::get('/users/export', [UserController::class, 'export']);
    });
});

// Versioned API
Route::prefix('v2')->group(function () {
    Route::apiResource('users', Api\V2\UserController::class);
});
```

## Migrations

### Database Migrations
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->enum('role', ['admin', 'user', 'moderator'])->default('user');
            $table->boolean('is_active')->default(true);
            $table->json('settings')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();

            // Indexes
            $table->index('role');
            $table->index('is_active');
            $table->index(['role', 'is_active']);
        });

        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('content');
            $table->boolean('is_published')->default(false);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('is_published');
            $table->fullText(['title', 'content']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
        Schema::dropIfExists('users');
    }
};
```
