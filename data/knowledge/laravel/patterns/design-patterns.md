# Laravel Design Patterns

## Repository Pattern

```php
<?php

namespace App\Repositories;

// Base Repository Interface
interface RepositoryInterface
{
    public function all(): Collection;
    public function find(int $id): ?Model;
    public function create(array $data): Model;
    public function update(Model $model, array $data): Model;
    public function delete(Model $model): bool;
    public function paginate(int $perPage = 15): LengthAwarePaginator;
}

// Base Repository Implementation
abstract class BaseRepository implements RepositoryInterface
{
    public function __construct(
        protected readonly Model $model
    ) {}

    public function all(): Collection
    {
        return $this->model->all();
    }

    public function find(int $id): ?Model
    {
        return $this->model->find($id);
    }

    public function create(array $data): Model
    {
        return $this->model->create($data);
    }

    public function update(Model $model, array $data): Model
    {
        $model->update($data);
        return $model->fresh();
    }

    public function delete(Model $model): bool
    {
        return $model->delete();
    }

    public function paginate(int $perPage = 15): LengthAwarePaginator
    {
        return $this->model->paginate($perPage);
    }

    protected function applyFilters(Builder $query, array $filters): Builder
    {
        foreach ($filters as $field => $value) {
            if ($value !== null) {
                $query->where($field, $value);
            }
        }
        return $query;
    }
}

// Specific Repository
class ProductRepository extends BaseRepository
{
    public function __construct(Product $product)
    {
        parent::__construct($product);
    }

    public function findBySlug(string $slug): ?Product
    {
        return $this->model->where('slug', $slug)->first();
    }

    public function getActive(): Collection
    {
        return $this->model->where('is_active', true)->get();
    }

    public function search(string $term, array $filters = []): LengthAwarePaginator
    {
        $query = $this->model->query();

        if ($term) {
            $query->where(function ($q) use ($term) {
                $q->where('name', 'like', "%{$term}%")
                  ->orWhere('description', 'like', "%{$term}%");
            });
        }

        return $this->applyFilters($query, $filters)->paginate();
    }
}
```

## Service Pattern

```php
<?php

namespace App\Services;

class OrderService
{
    public function __construct(
        private readonly OrderRepository $orderRepository,
        private readonly ProductRepository $productRepository,
        private readonly PaymentService $paymentService,
        private readonly ShippingService $shippingService
    ) {}

    public function create(CreateOrderDTO $dto): Order
    {
        return DB::transaction(function () use ($dto) {
            // Validate stock
            $this->validateStock($dto->items);

            // Calculate pricing
            $pricing = $this->calculatePricing($dto);

            // Create order
            $order = $this->orderRepository->create([
                'user_id' => $dto->userId,
                'status' => OrderStatus::PENDING,
                'subtotal' => $pricing->subtotal,
                'tax' => $pricing->tax,
                'shipping' => $pricing->shipping,
                'discount' => $pricing->discount,
                'total' => $pricing->total,
            ]);

            // Create order items
            $this->createOrderItems($order, $dto->items);

            // Reserve inventory
            $this->reserveInventory($dto->items);

            event(new OrderCreated($order));

            return $order->load(['items.product', 'user']);
        });
    }

    public function process(Order $order, PaymentDTO $payment): Order
    {
        if (!$order->canBeProcessed()) {
            throw new OrderException('Order cannot be processed');
        }

        $paymentResult = $this->paymentService->charge($order, $payment);

        if ($paymentResult->failed()) {
            $order->markAsFailed($paymentResult->error);
            throw new PaymentException($paymentResult->error);
        }

        $order->markAsPaid($paymentResult->transactionId);

        event(new OrderPaid($order));

        return $order;
    }

    public function cancel(Order $order, string $reason): Order
    {
        if (!$order->canBeCancelled()) {
            throw new OrderException('Order cannot be cancelled');
        }

        DB::transaction(function () use ($order, $reason) {
            // Refund if paid
            if ($order->isPaid()) {
                $this->paymentService->refund($order);
            }

            // Release inventory
            $this->releaseInventory($order);

            // Update order
            $order->cancel($reason);
        });

        event(new OrderCancelled($order));

        return $order;
    }
}
```

## Action Pattern

```php
<?php

namespace App\Actions;

// Simple action
class PublishPostAction
{
    public function execute(Post $post): Post
    {
        if ($post->is_published) {
            throw new PostAlreadyPublishedException($post);
        }

        $post->update([
            'is_published' => true,
            'published_at' => now(),
        ]);

        event(new PostPublished($post));

        return $post;
    }
}

// Action with dependencies
class CreateUserAction
{
    public function __construct(
        private readonly UserRepository $repository,
        private readonly AvatarService $avatarService,
        private readonly EmailService $emailService
    ) {}

    public function execute(CreateUserDTO $dto): User
    {
        $avatar = null;

        if ($dto->avatarFile) {
            $avatar = $this->avatarService->store($dto->avatarFile);
        }

        $user = $this->repository->create([
            'name' => $dto->name,
            'email' => $dto->email,
            'password' => Hash::make($dto->password),
            'avatar' => $avatar,
        ]);

        $this->emailService->sendWelcome($user);

        event(new UserCreated($user));

        return $user;
    }
}

// Invokable action
class CalculateOrderTotalAction
{
    public function __invoke(Order $order): Money
    {
        $subtotal = $order->items->sum(
            fn($item) => $item->price * $item->quantity
        );

        $tax = $subtotal * config('shop.tax_rate');
        $shipping = $this->calculateShipping($order);
        $discount = $order->discount ?? 0;

        return new Money($subtotal + $tax + $shipping - $discount);
    }
}
```

## Observer Pattern

```php
<?php

namespace App\Observers;

class UserObserver
{
    public function creating(User $user): void
    {
        $user->uuid = Str::uuid();
    }

    public function created(User $user): void
    {
        Profile::create(['user_id' => $user->id]);
        
        Log::info('User created', ['user_id' => $user->id]);
    }

    public function updated(User $user): void
    {
        if ($user->wasChanged('email')) {
            $user->email_verified_at = null;
            $user->saveQuietly();
            
            $user->sendEmailVerificationNotification();
        }
    }

    public function deleted(User $user): void
    {
        $user->tokens()->delete();
        $user->profile?->delete();
        
        Log::info('User deleted', ['user_id' => $user->id]);
    }

    public function forceDeleted(User $user): void
    {
        Storage::delete($user->avatar);
    }
}

// Register in ServiceProvider
User::observe(UserObserver::class);
```

## Factory Pattern

```php
<?php

namespace App\Factories;

// Payment Gateway Factory
interface PaymentGatewayInterface
{
    public function charge(Money $amount, array $details): PaymentResult;
    public function refund(string $transactionId, Money $amount): RefundResult;
}

class PaymentGatewayFactory
{
    public function make(string $provider): PaymentGatewayInterface
    {
        return match ($provider) {
            'stripe' => new StripeGateway(config('services.stripe')),
            'paypal' => new PayPalGateway(config('services.paypal')),
            'square' => new SquareGateway(config('services.square')),
            default => throw new InvalidArgumentException("Unknown provider: {$provider}"),
        };
    }
}

// Notification Factory
class NotificationFactory
{
    public function make(string $type, array $data): Notification
    {
        return match ($type) {
            'order_placed' => new OrderPlacedNotification($data['order']),
            'order_shipped' => new OrderShippedNotification($data['order'], $data['tracking']),
            'payment_failed' => new PaymentFailedNotification($data['order'], $data['error']),
            default => throw new InvalidArgumentException("Unknown notification: {$type}"),
        };
    }

    public function createAndSend(string $type, Notifiable $notifiable, array $data): void
    {
        $notification = $this->make($type, $data);
        $notifiable->notify($notification);
    }
}
```

## Strategy Pattern

```php
<?php

namespace App\Shipping;

interface ShippingCalculator
{
    public function calculate(Order $order): Money;
    public function getEstimatedDays(): int;
}

class StandardShipping implements ShippingCalculator
{
    public function calculate(Order $order): Money
    {
        $weight = $order->items->sum('weight');
        return new Money($weight * 100); // $1 per unit weight
    }

    public function getEstimatedDays(): int
    {
        return 5;
    }
}

class ExpressShipping implements ShippingCalculator
{
    public function calculate(Order $order): Money
    {
        $weight = $order->items->sum('weight');
        return new Money($weight * 250); // $2.50 per unit weight
    }

    public function getEstimatedDays(): int
    {
        return 2;
    }
}

class FreeShipping implements ShippingCalculator
{
    public function calculate(Order $order): Money
    {
        return new Money(0);
    }

    public function getEstimatedDays(): int
    {
        return 7;
    }
}

// Context
class ShippingService
{
    public function __construct(
        private readonly ShippingCalculatorFactory $factory
    ) {}

    public function calculateShipping(Order $order, string $method): ShippingQuote
    {
        $calculator = $this->factory->make($method);
        
        return new ShippingQuote(
            cost: $calculator->calculate($order),
            estimatedDays: $calculator->getEstimatedDays(),
            method: $method
        );
    }
}
```

## Decorator Pattern

```php
<?php

namespace App\Decorators;

interface ProductPriceCalculator
{
    public function calculate(Product $product): Money;
}

class BasePriceCalculator implements ProductPriceCalculator
{
    public function calculate(Product $product): Money
    {
        return new Money($product->base_price);
    }
}

abstract class PriceDecorator implements ProductPriceCalculator
{
    public function __construct(
        protected readonly ProductPriceCalculator $calculator
    ) {}
}

class TaxDecorator extends PriceDecorator
{
    public function __construct(
        ProductPriceCalculator $calculator,
        private readonly float $taxRate = 0.1
    ) {
        parent::__construct($calculator);
    }

    public function calculate(Product $product): Money
    {
        $basePrice = $this->calculator->calculate($product);
        $tax = (int) ($basePrice->amount * $this->taxRate);
        return $basePrice->add(new Money($tax));
    }
}

class DiscountDecorator extends PriceDecorator
{
    public function __construct(
        ProductPriceCalculator $calculator,
        private readonly ?Coupon $coupon = null
    ) {
        parent::__construct($calculator);
    }

    public function calculate(Product $product): Money
    {
        $price = $this->calculator->calculate($product);
        
        if ($this->coupon && $this->coupon->isValidFor($product)) {
            $discount = $this->coupon->calculateDiscount($price);
            return $price->subtract($discount);
        }
        
        return $price;
    }
}

// Usage
$calculator = new TaxDecorator(
    new DiscountDecorator(
        new BasePriceCalculator(),
        $coupon
    ),
    0.1
);

$finalPrice = $calculator->calculate($product);
```

## Builder Pattern

```php
<?php

namespace App\Builders;

class ReportBuilder
{
    private string $title = '';
    private Carbon $startDate;
    private Carbon $endDate;
    private array $metrics = [];
    private array $filters = [];
    private string $format = 'pdf';

    public function title(string $title): self
    {
        $this->title = $title;
        return $this;
    }

    public function dateRange(Carbon $start, Carbon $end): self
    {
        $this->startDate = $start;
        $this->endDate = $end;
        return $this;
    }

    public function addMetric(string $metric): self
    {
        $this->metrics[] = $metric;
        return $this;
    }

    public function filter(string $field, mixed $value): self
    {
        $this->filters[$field] = $value;
        return $this;
    }

    public function format(string $format): self
    {
        $this->format = $format;
        return $this;
    }

    public function build(): Report
    {
        return new Report(
            title: $this->title,
            startDate: $this->startDate,
            endDate: $this->endDate,
            metrics: $this->metrics,
            filters: $this->filters,
            format: $this->format
        );
    }
}

// Usage
$report = (new ReportBuilder())
    ->title('Monthly Sales Report')
    ->dateRange(now()->startOfMonth(), now()->endOfMonth())
    ->addMetric('total_sales')
    ->addMetric('order_count')
    ->addMetric('average_order_value')
    ->filter('status', 'completed')
    ->format('pdf')
    ->build();
```

## Specification Pattern

```php
<?php

namespace App\Specifications;

interface Specification
{
    public function isSatisfiedBy(mixed $candidate): bool;
    public function and(Specification $other): Specification;
    public function or(Specification $other): Specification;
    public function not(): Specification;
}

abstract class AbstractSpecification implements Specification
{
    public function and(Specification $other): Specification
    {
        return new AndSpecification($this, $other);
    }

    public function or(Specification $other): Specification
    {
        return new OrSpecification($this, $other);
    }

    public function not(): Specification
    {
        return new NotSpecification($this);
    }
}

class AndSpecification extends AbstractSpecification
{
    public function __construct(
        private readonly Specification $left,
        private readonly Specification $right
    ) {}

    public function isSatisfiedBy(mixed $candidate): bool
    {
        return $this->left->isSatisfiedBy($candidate)
            && $this->right->isSatisfiedBy($candidate);
    }
}

// Concrete specifications
class ActiveUserSpecification extends AbstractSpecification
{
    public function isSatisfiedBy(mixed $candidate): bool
    {
        return $candidate instanceof User && $candidate->is_active;
    }
}

class PremiumUserSpecification extends AbstractSpecification
{
    public function isSatisfiedBy(mixed $candidate): bool
    {
        return $candidate instanceof User && $candidate->subscription === 'premium';
    }
}

// Usage
$activePremium = (new ActiveUserSpecification())
    ->and(new PremiumUserSpecification());

$users->filter(fn($user) => $activePremium->isSatisfiedBy($user));
```

## Pipeline Pattern

```php
<?php

namespace App\Pipelines;

class OrderProcessingPipeline
{
    protected array $pipes = [
        ValidateOrderPipe::class,
        CheckInventoryPipe::class,
        ApplyDiscountsPipe::class,
        CalculateTaxPipe::class,
        CalculateShippingPipe::class,
        CreateOrderPipe::class,
        ReserveInventoryPipe::class,
        SendConfirmationPipe::class,
    ];

    public function process(OrderDTO $orderDTO): Order
    {
        return app(Pipeline::class)
            ->send($orderDTO)
            ->through($this->pipes)
            ->thenReturn();
    }
}

class CheckInventoryPipe
{
    public function handle(OrderDTO $dto, Closure $next): mixed
    {
        foreach ($dto->items as $item) {
            $product = Product::find($item['product_id']);
            
            if ($product->stock < $item['quantity']) {
                throw new InsufficientStockException($product);
            }
        }

        return $next($dto);
    }
}
```
