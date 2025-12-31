# Ruby on Rails Architecture Guide

## Application Architectures

### 1. Standard MVC

```
app/
├── controllers/      # Handle HTTP requests
├── models/           # ActiveRecord (data + business logic)
└── views/            # ERB/Haml templates
```

### 2. Service-Oriented Architecture

```
app/
├── controllers/      # Thin controllers - HTTP only
├── models/           # Data models - validation & associations only
├── services/         # Business logic
├── queries/          # Complex database queries
├── presenters/       # View logic
├── forms/            # Form objects
└── decorators/       # Object decoration
```

```ruby
# Thin Controller
class OrdersController < ApplicationController
  def create
    result = CreateOrderService.call(
      user: current_user,
      params: order_params
    )
    
    if result.success?
      render json: OrderPresenter.new(result.order).as_json
    else
      render json: { errors: result.errors }, status: :unprocessable_entity
    end
  end
end

# Service - Business Logic
class CreateOrderService
  Result = Struct.new(:success?, :order, :errors, keyword_init: true)
  
  def self.call(...)
    new(...).call
  end
  
  def initialize(user:, params:)
    @user = user
    @params = params
    @errors = []
  end
  
  def call
    validate_items!
    return failure if @errors.any?
    
    order = build_order
    
    ActiveRecord::Base.transaction do
      order.save!
      reserve_inventory!(order)
      send_notifications(order)
    end
    
    Result.new(success?: true, order: order)
  rescue ActiveRecord::RecordInvalid => e
    Result.new(success?: false, errors: e.record.errors.full_messages)
  rescue StandardError => e
    Rails.logger.error("Order creation failed: #{e.message}")
    Result.new(success?: false, errors: ['Order creation failed'])
  end
end

# Query Object
class OrdersQuery
  def initialize(scope = Order.all)
    @scope = scope
  end
  
  def call(filters = {})
    result = @scope
    result = filter_by_status(result, filters[:status])
    result = filter_by_date(result, filters[:start_date], filters[:end_date])
    result = search(result, filters[:query])
    sort(result, filters[:sort_by], filters[:order])
  end
  
  private
  
  def filter_by_status(scope, status)
    return scope unless status.present?
    scope.where(status: status)
  end
  
  def filter_by_date(scope, start_date, end_date)
    scope = scope.where('created_at >= ?', start_date) if start_date
    scope = scope.where('created_at <= ?', end_date) if end_date
    scope
  end
  
  def search(scope, query)
    return scope unless query.present?
    scope.where('order_number ILIKE ?', "%#{query}%")
  end
  
  def sort(scope, sort_by, order)
    column = %w[created_at total].include?(sort_by) ? sort_by : 'created_at'
    direction = order == 'asc' ? :asc : :desc
    scope.order(column => direction)
  end
end

# Presenter
class OrderPresenter
  def initialize(order)
    @order = order
  end
  
  def as_json
    {
      id: @order.id,
      order_number: @order.order_number,
      status: @order.status,
      formatted_total: formatted_total,
      items: items_json,
      created_at: @order.created_at.iso8601
    }
  end
  
  def formatted_total
    ActionController::Base.helpers.number_to_currency(@order.total)
  end
  
  def items_json
    @order.order_items.map { |item| OrderItemPresenter.new(item).as_json }
  end
end
```

### 3. Hexagonal Architecture (Ports & Adapters)

```
app/
├── domain/                    # Core business logic (no Rails deps)
│   ├── models/
│   │   └── order.rb          # Plain Ruby objects
│   ├── services/
│   │   └── order_service.rb
│   └── value_objects/
│       └── money.rb
├── application/               # Use cases / Application services
│   └── use_cases/
│       ├── create_order.rb
│       └── cancel_order.rb
├── infrastructure/            # External integrations
│   ├── repositories/
│   │   └── order_repository.rb
│   ├── payment_gateway/
│   │   └── stripe_adapter.rb
│   └── notifications/
│       └── email_adapter.rb
└── interfaces/                # Entry points
    ├── api/
    │   └── orders_controller.rb
    └── web/
        └── orders_controller.rb
```

```ruby
# Domain - Pure Ruby (no ActiveRecord)
module Domain
  class Order
    attr_reader :id, :user_id, :items, :status, :total
    
    def initialize(id:, user_id:, items:, status: :pending)
      @id = id
      @user_id = user_id
      @items = items
      @status = status
      @total = calculate_total
    end
    
    def can_be_cancelled?
      %i[pending processing].include?(status)
    end
    
    def cancel
      raise OrderError, 'Cannot cancel' unless can_be_cancelled?
      @status = :cancelled
      self
    end
    
    private
    
    def calculate_total
      items.sum(&:line_total)
    end
  end
  
  class Money
    attr_reader :amount, :currency
    
    def initialize(amount, currency = 'USD')
      @amount = amount
      @currency = currency
    end
    
    def +(other)
      raise 'Currency mismatch' unless currency == other.currency
      Money.new(amount + other.amount, currency)
    end
    
    def to_s
      format("%.2f %s", amount / 100.0, currency)
    end
  end
end

# Application - Use Cases
module Application
  class CreateOrder
    def initialize(order_repository:, payment_gateway:, notifier:)
      @order_repository = order_repository
      @payment_gateway = payment_gateway
      @notifier = notifier
    end
    
    def call(user_id:, items:, payment_details:)
      order = Domain::Order.new(
        id: nil,
        user_id: user_id,
        items: items
      )
      
      saved_order = @order_repository.save(order)
      
      payment_result = @payment_gateway.charge(
        amount: saved_order.total,
        details: payment_details
      )
      
      if payment_result.success?
        @order_repository.update_status(saved_order.id, :paid)
        @notifier.order_confirmed(saved_order)
        Result.success(saved_order)
      else
        Result.failure(payment_result.error)
      end
    end
  end
end

# Infrastructure - Adapters
module Infrastructure
  class OrderRepository
    def save(domain_order)
      record = OrderRecord.create!(
        user_id: domain_order.user_id,
        status: domain_order.status,
        total: domain_order.total.amount
      )
      
      to_domain(record)
    end
    
    def find(id)
      record = OrderRecord.find(id)
      to_domain(record)
    end
    
    private
    
    def to_domain(record)
      Domain::Order.new(
        id: record.id,
        user_id: record.user_id,
        items: record.items.map { |i| to_domain_item(i) },
        status: record.status.to_sym
      )
    end
  end
  
  class StripePaymentAdapter
    def charge(amount:, details:)
      result = Stripe::Charge.create(
        amount: amount.amount,
        currency: amount.currency.downcase,
        source: details[:token]
      )
      
      PaymentResult.new(success: true, transaction_id: result.id)
    rescue Stripe::CardError => e
      PaymentResult.new(success: false, error: e.message)
    end
  end
end

# Interface - API Controller
module Interfaces
  class Api::OrdersController < ApplicationController
    def create
      use_case = Application::CreateOrder.new(
        order_repository: Infrastructure::OrderRepository.new,
        payment_gateway: Infrastructure::StripePaymentAdapter.new,
        notifier: Infrastructure::EmailNotifier.new
      )
      
      result = use_case.call(
        user_id: current_user.id,
        items: build_items(params[:items]),
        payment_details: params[:payment]
      )
      
      if result.success?
        render json: result.value
      else
        render json: { error: result.error }, status: :unprocessable_entity
      end
    end
  end
end
```

## API Architecture

### API-First with Versioning
```
app/
├── controllers/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── base_controller.rb
│   │   │   ├── orders_controller.rb
│   │   │   └── users_controller.rb
│   │   └── v2/
│   │       └── orders_controller.rb
│   └── application_controller.rb
└── serializers/
    ├── v1/
    │   └── order_serializer.rb
    └── v2/
        └── order_serializer.rb
```

```ruby
# Base API Controller
module Api
  module V1
    class BaseController < ApplicationController
      skip_before_action :verify_authenticity_token
      before_action :authenticate_api_user!
      
      rescue_from ActiveRecord::RecordNotFound, with: :not_found
      rescue_from ActionController::ParameterMissing, with: :bad_request
      
      private
      
      def authenticate_api_user!
        token = request.headers['Authorization']&.split(' ')&.last
        @current_user = ApiToken.active.find_by(token: token)&.user
        render_unauthorized unless @current_user
      end
      
      def render_unauthorized
        render json: { error: 'Unauthorized' }, status: :unauthorized
      end
      
      def not_found
        render json: { error: 'Not found' }, status: :not_found
      end
      
      def bad_request(exception)
        render json: { error: exception.message }, status: :bad_request
      end
      
      def pagination_meta(collection)
        {
          current_page: collection.current_page,
          total_pages: collection.total_pages,
          total_count: collection.total_count
        }
      end
    end
  end
end

# Routes
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :orders, only: [:index, :show, :create, :update]
      resources :products, only: [:index, :show]
      resource :profile, only: [:show, :update]
    end
    
    namespace :v2 do
      resources :orders, only: [:index, :show, :create]
    end
  end
end
```

## Event-Driven Architecture

```ruby
# ActiveSupport Notifications
class Order < ApplicationRecord
  after_commit :publish_created_event, on: :create
  
  private
  
  def publish_created_event
    ActiveSupport::Notifications.instrument('order.created', order: self)
  end
end

# Subscriber
class OrderSubscriber
  def self.subscribe
    ActiveSupport::Notifications.subscribe('order.created') do |*args|
      event = ActiveSupport::Notifications::Event.new(*args)
      order = event.payload[:order]
      
      SendOrderConfirmationJob.perform_later(order.id)
      UpdateInventoryJob.perform_later(order.id)
      NotifyWarehouseJob.perform_later(order.id)
    end
  end
end

# Initialize in config/initializers/subscribers.rb
OrderSubscriber.subscribe
```

## Modular Monolith

```
app/
├── modules/
│   ├── ordering/
│   │   ├── app/
│   │   │   ├── controllers/
│   │   │   ├── models/
│   │   │   └── services/
│   │   ├── lib/
│   │   └── spec/
│   ├── inventory/
│   │   └── ...
│   ├── payments/
│   │   └── ...
│   └── shipping/
│       └── ...
└── shared/
    ├── models/
    └── services/
```

```ruby
# Each module is a Rails Engine
# app/modules/ordering/lib/ordering/engine.rb
module Ordering
  class Engine < ::Rails::Engine
    isolate_namespace Ordering
    
    config.generators do |g|
      g.test_framework :rspec
    end
  end
end

# app/modules/ordering/app/services/ordering/create_order.rb
module Ordering
  class CreateOrder
    def call(user:, items:)
      order = Order.create!(user: user, items: items)
      
      # Communicate with other modules via events
      Rails.application.config.event_bus.publish(
        'ordering.order_created',
        order_id: order.id,
        items: order.items.as_json
      )
      
      order
    end
  end
end

# app/modules/inventory/app/subscribers/inventory/order_subscriber.rb
module Inventory
  class OrderSubscriber
    def on_order_created(event)
      event[:items].each do |item|
        ReserveStockService.call(
          product_id: item['product_id'],
          quantity: item['quantity']
        )
      end
    end
  end
end
```

## Background Processing Architecture

```ruby
# Sidekiq configuration
# config/sidekiq.yml
:concurrency: 10
:queues:
  - [critical, 3]
  - [default, 2]
  - [low, 1]

# Job with retry logic
class ProcessOrderJob < ApplicationJob
  queue_as :default
  
  retry_on StandardError, wait: :exponentially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound
  
  sidekiq_options retry: 5, backtrace: true
  
  def perform(order_id)
    order = Order.find(order_id)
    OrderProcessor.new(order).process
  end
end

# Scheduled jobs with sidekiq-cron
# config/initializers/sidekiq_cron.rb
Sidekiq::Cron::Job.create(
  name: 'Cleanup old orders - every day at 3am',
  cron: '0 3 * * *',
  class: 'CleanupOldOrdersJob'
)
```
