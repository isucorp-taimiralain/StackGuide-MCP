# Laravel Architecture Guide

## Application Architectures

### 1. Standard MVC

```
app/
├── Http/
│   └── Controllers/      # Controllers handle HTTP requests
├── Models/               # Eloquent models (data + logic)
└── Views/                # Blade templates
resources/
└── views/                # Blade templates
```

### 2. Service Layer Architecture (Recommended)

```
app/
├── Http/
│   ├── Controllers/      # Thin controllers
│   ├── Requests/         # Form validation
│   └── Resources/        # API transformers
├── Models/               # Eloquent models (data only)
├── Services/             # Business logic
├── Repositories/         # Data access abstraction
├── Actions/              # Single-purpose actions
├── DTOs/                 # Data transfer objects
└── Events/               # Domain events
```

```php
<?php

// Controller - HTTP concerns only
class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orderService
    ) {}

    public function store(CreateOrderRequest $request): JsonResponse
    {
        $dto = CreateOrderDTO::fromRequest($request);
        $order = $this->orderService->create($dto);
        
        return new OrderResource($order);
    }
}

// DTO - Data structure
class CreateOrderDTO
{
    public function __construct(
        public readonly int $userId,
        public readonly array $items,
        public readonly ?string $couponCode,
        public readonly string $shippingAddress
    ) {}

    public static function fromRequest(CreateOrderRequest $request): self
    {
        return new self(
            userId: $request->user()->id,
            items: $request->validated('items'),
            couponCode: $request->validated('coupon_code'),
            shippingAddress: $request->validated('shipping_address')
        );
    }
}

// Service - Business logic
class OrderService
{
    public function __construct(
        private readonly OrderRepository $orderRepository,
        private readonly ProductRepository $productRepository,
        private readonly CouponService $couponService,
        private readonly PaymentService $paymentService
    ) {}

    public function create(CreateOrderDTO $dto): Order
    {
        return DB::transaction(function () use ($dto) {
            // Validate stock
            $this->validateStock($dto->items);
            
            // Calculate totals
            $subtotal = $this->calculateSubtotal($dto->items);
            $discount = $dto->couponCode 
                ? $this->couponService->calculateDiscount($dto->couponCode, $subtotal)
                : 0;
            
            // Create order
            $order = $this->orderRepository->create([
                'user_id' => $dto->userId,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $subtotal - $discount,
                'shipping_address' => $dto->shippingAddress,
            ]);
            
            // Create order items
            foreach ($dto->items as $item) {
                $order->items()->create($item);
                $this->productRepository->decrementStock($item['product_id'], $item['quantity']);
            }
            
            // Dispatch events
            event(new OrderCreated($order));
            
            return $order->load(['items.product', 'user']);
        });
    }
}

// Repository - Data access
class OrderRepository
{
    public function __construct(
        private readonly Order $model
    ) {}

    public function create(array $data): Order
    {
        return $this->model->create($data);
    }

    public function findByUser(User $user, array $filters = []): LengthAwarePaginator
    {
        return $this->model
            ->where('user_id', $user->id)
            ->when($filters['status'] ?? null, fn($q, $status) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate($filters['per_page'] ?? 15);
    }
}
```

### 3. Domain-Driven Design (DDD)

```
app/
├── Domain/
│   ├── Order/
│   │   ├── Models/
│   │   │   ├── Order.php
│   │   │   └── OrderItem.php
│   │   ├── Actions/
│   │   │   ├── CreateOrderAction.php
│   │   │   └── CancelOrderAction.php
│   │   ├── DTOs/
│   │   ├── Events/
│   │   ├── Exceptions/
│   │   ├── Policies/
│   │   └── ValueObjects/
│   │       └── Money.php
│   └── User/
├── Application/
│   ├── Services/
│   └── Commands/
├── Infrastructure/
│   ├── Repositories/
│   ├── External/
│   └── Persistence/
└── Interfaces/
    ├── Http/
    │   ├── Controllers/
    │   └── Resources/
    └── Console/
```

```php
<?php

// Value Object
namespace App\Domain\Order\ValueObjects;

class Money
{
    public function __construct(
        public readonly int $amount,
        public readonly string $currency = 'USD'
    ) {
        if ($amount < 0) {
            throw new InvalidArgumentException('Amount cannot be negative');
        }
    }

    public function add(Money $other): self
    {
        $this->ensureSameCurrency($other);
        return new self($this->amount + $other->amount, $this->currency);
    }

    public function subtract(Money $other): self
    {
        $this->ensureSameCurrency($other);
        return new self($this->amount - $other->amount, $this->currency);
    }

    public function multiply(float $factor): self
    {
        return new self((int) round($this->amount * $factor), $this->currency);
    }

    public function format(): string
    {
        return number_format($this->amount / 100, 2) . ' ' . $this->currency;
    }

    private function ensureSameCurrency(Money $other): void
    {
        if ($this->currency !== $other->currency) {
            throw new InvalidArgumentException('Cannot operate on different currencies');
        }
    }
}

// Domain Entity
namespace App\Domain\Order\Models;

class Order extends Model
{
    public function getTotal(): Money
    {
        return new Money($this->total_cents);
    }

    public function canBeCancelled(): bool
    {
        return in_array($this->status, ['pending', 'processing']) 
            && $this->created_at->diffInHours(now()) < 24;
    }

    public function cancel(): void
    {
        if (!$this->canBeCancelled()) {
            throw new OrderCannotBeCancelledException($this);
        }

        $this->update(['status' => 'cancelled']);
        event(new OrderCancelled($this));
    }
}

// Action
namespace App\Domain\Order\Actions;

class CreateOrderAction
{
    public function __construct(
        private readonly ValidateStockAction $validateStock,
        private readonly CalculateTotalsAction $calculateTotals,
        private readonly ApplyCouponAction $applyCoupon
    ) {}

    public function execute(CreateOrderDTO $dto): Order
    {
        return DB::transaction(function () use ($dto) {
            $this->validateStock->execute($dto->items);
            
            $totals = $this->calculateTotals->execute($dto->items);
            
            if ($dto->couponCode) {
                $totals = $this->applyCoupon->execute($totals, $dto->couponCode);
            }
            
            $order = Order::create([
                'user_id' => $dto->userId,
                ...$totals->toArray(),
            ]);
            
            $this->createOrderItems($order, $dto->items);
            
            event(new OrderCreated($order));
            
            return $order;
        });
    }
}
```

## Design Patterns in Laravel

### Repository Pattern
```php
<?php

interface UserRepositoryInterface
{
    public function find(int $id): ?User;
    public function findByEmail(string $email): ?User;
    public function create(array $data): User;
    public function update(User $user, array $data): User;
    public function delete(User $user): bool;
    public function paginate(array $filters = []): LengthAwarePaginator;
}

class EloquentUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private readonly User $model
    ) {}

    public function find(int $id): ?User
    {
        return $this->model->find($id);
    }

    public function findByEmail(string $email): ?User
    {
        return $this->model->where('email', $email)->first();
    }

    public function create(array $data): User
    {
        return $this->model->create($data);
    }

    public function update(User $user, array $data): User
    {
        $user->update($data);
        return $user->fresh();
    }

    public function delete(User $user): bool
    {
        return $user->delete();
    }

    public function paginate(array $filters = []): LengthAwarePaginator
    {
        return $this->model
            ->when($filters['search'] ?? null, function ($query, $search) {
                $query->where('name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%");
            })
            ->when($filters['role'] ?? null, fn($q, $role) => $q->where('role', $role))
            ->orderBy($filters['sort'] ?? 'created_at', $filters['order'] ?? 'desc')
            ->paginate($filters['per_page'] ?? 15);
    }
}

// Bind in ServiceProvider
$this->app->bind(UserRepositoryInterface::class, EloquentUserRepository::class);
```

### Action Pattern
```php
<?php

// Single-purpose actions
class CreateUserAction
{
    public function __construct(
        private readonly UserRepository $repository,
        private readonly ImageService $imageService
    ) {}

    public function execute(CreateUserDTO $dto): User
    {
        $avatarPath = null;
        
        if ($dto->avatar) {
            $avatarPath = $this->imageService->store($dto->avatar, 'avatars');
        }
        
        $user = $this->repository->create([
            'name' => $dto->name,
            'email' => $dto->email,
            'password' => Hash::make($dto->password),
            'avatar' => $avatarPath,
        ]);
        
        event(new UserCreated($user));
        
        return $user;
    }
}

// Usage
class UserController extends Controller
{
    public function store(CreateUserRequest $request, CreateUserAction $action): JsonResponse
    {
        $user = $action->execute(CreateUserDTO::fromRequest($request));
        return new UserResource($user);
    }
}
```

### Pipeline Pattern
```php
<?php

// Order processing pipeline
class OrderProcessingPipeline
{
    protected array $pipes = [
        ValidateOrderPipe::class,
        ApplyDiscountsPipe::class,
        CalculateTaxPipe::class,
        CalculateShippingPipe::class,
        FinalizeOrderPipe::class,
    ];

    public function process(Order $order): Order
    {
        return app(Pipeline::class)
            ->send($order)
            ->through($this->pipes)
            ->thenReturn();
    }
}

// Individual pipe
class ApplyDiscountsPipe
{
    public function __construct(
        private readonly DiscountService $discountService
    ) {}

    public function handle(Order $order, Closure $next): Order
    {
        if ($order->coupon_code) {
            $discount = $this->discountService->calculate(
                $order->coupon_code,
                $order->subtotal
            );
            $order->discount = $discount;
        }

        return $next($order);
    }
}
```

### Strategy Pattern
```php
<?php

interface PaymentGateway
{
    public function charge(Money $amount, array $paymentDetails): PaymentResult;
    public function refund(string $transactionId, Money $amount): RefundResult;
}

class StripeGateway implements PaymentGateway
{
    public function charge(Money $amount, array $paymentDetails): PaymentResult
    {
        $charge = Stripe::charges()->create([
            'amount' => $amount->amount,
            'currency' => strtolower($amount->currency),
            'source' => $paymentDetails['token'],
        ]);

        return new PaymentResult(
            success: $charge['status'] === 'succeeded',
            transactionId: $charge['id']
        );
    }

    public function refund(string $transactionId, Money $amount): RefundResult
    {
        // Implementation
    }
}

class PayPalGateway implements PaymentGateway
{
    // Implementation
}

// Factory
class PaymentGatewayFactory
{
    public function make(string $provider): PaymentGateway
    {
        return match ($provider) {
            'stripe' => app(StripeGateway::class),
            'paypal' => app(PayPalGateway::class),
            default => throw new InvalidArgumentException("Unknown provider: {$provider}"),
        };
    }
}

// Usage
class PaymentService
{
    public function __construct(
        private readonly PaymentGatewayFactory $gatewayFactory
    ) {}

    public function processPayment(Order $order, string $provider, array $details): PaymentResult
    {
        $gateway = $this->gatewayFactory->make($provider);
        return $gateway->charge($order->getTotal(), $details);
    }
}
```

## Event-Driven Architecture

```php
<?php

// Event
class OrderPlaced implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly Order $order
    ) {}

    public function broadcastOn(): Channel
    {
        return new PrivateChannel('user.' . $this->order->user_id);
    }
}

// Listeners
class SendOrderConfirmation implements ShouldQueue
{
    public function handle(OrderPlaced $event): void
    {
        Mail::to($event->order->user)->send(
            new OrderConfirmationMail($event->order)
        );
    }
}

class UpdateInventory implements ShouldQueue
{
    public function handle(OrderPlaced $event): void
    {
        foreach ($event->order->items as $item) {
            $item->product->decrement('stock', $item->quantity);
        }
    }
}

// Event subscriber
class OrderEventSubscriber
{
    public function handleOrderPlaced(OrderPlaced $event): void {}
    public function handleOrderShipped(OrderShipped $event): void {}
    public function handleOrderCancelled(OrderCancelled $event): void {}

    public function subscribe(Dispatcher $events): array
    {
        return [
            OrderPlaced::class => 'handleOrderPlaced',
            OrderShipped::class => 'handleOrderShipped',
            OrderCancelled::class => 'handleOrderCancelled',
        ];
    }
}
```

## CQRS (Command Query Responsibility Segregation)

```php
<?php

// Commands (write operations)
namespace App\Commands;

class CreateOrderCommand
{
    public function __construct(
        public readonly int $userId,
        public readonly array $items,
        public readonly ?string $couponCode
    ) {}
}

class CreateOrderHandler
{
    public function handle(CreateOrderCommand $command): Order
    {
        // Write logic
    }
}

// Queries (read operations)
namespace App\Queries;

class GetUserOrdersQuery
{
    public function __construct(
        public readonly int $userId,
        public readonly ?string $status = null,
        public readonly int $perPage = 15
    ) {}
}

class GetUserOrdersHandler
{
    public function handle(GetUserOrdersQuery $query): LengthAwarePaginator
    {
        return Order::query()
            ->where('user_id', $query->userId)
            ->when($query->status, fn($q, $status) => $q->where('status', $status))
            ->with(['items.product'])
            ->orderByDesc('created_at')
            ->paginate($query->perPage);
    }
}

// Command/Query Bus
class Bus
{
    public function dispatch(object $command): mixed
    {
        $handlerClass = $this->resolveHandler($command);
        $handler = app($handlerClass);
        
        return $handler->handle($command);
    }

    private function resolveHandler(object $command): string
    {
        $commandClass = get_class($command);
        return str_replace('Command', 'Handler', $commandClass);
    }
}
```
