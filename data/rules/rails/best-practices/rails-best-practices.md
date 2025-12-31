# Ruby on Rails Best Practices

## Service Objects

```ruby
# Use service objects for complex business logic
class ProcessPaymentService
  Result = Struct.new(:success?, :payment, :error, keyword_init: true)
  
  def initialize(order:, payment_method:)
    @order = order
    @payment_method = payment_method
  end
  
  def call
    return Result.new(success?: false, error: 'Order already paid') if order.paid?
    
    ActiveRecord::Base.transaction do
      payment = create_payment
      charge_result = charge_payment(payment)
      
      if charge_result.success?
        payment.update!(status: :completed, transaction_id: charge_result.transaction_id)
        order.update!(status: :processing)
        
        OrderMailer.payment_received(order).deliver_later
        
        Result.new(success?: true, payment: payment)
      else
        payment.update!(status: :failed, error_message: charge_result.error)
        Result.new(success?: false, error: charge_result.error)
      end
    end
  rescue StandardError => e
    Rails.logger.error("Payment failed: #{e.message}")
    Result.new(success?: false, error: 'Payment processing failed')
  end
  
  private
  
  attr_reader :order, :payment_method
  
  def create_payment
    order.payments.create!(
      amount: order.total,
      payment_method: payment_method,
      status: :pending
    )
  end
  
  def charge_payment(payment)
    PaymentGateway.charge(
      amount: payment.amount,
      method: payment.payment_method
    )
  end
end
```

## Query Objects

```ruby
# Encapsulate complex queries
class OrdersQuery
  def initialize(scope = Order.all)
    @scope = scope
  end
  
  def call(params = {})
    scope = @scope
    
    scope = filter_by_status(scope, params[:status])
    scope = filter_by_date_range(scope, params[:start_date], params[:end_date])
    scope = filter_by_amount(scope, params[:min_amount], params[:max_amount])
    scope = search(scope, params[:query])
    scope = sort(scope, params[:sort_by], params[:sort_order])
    
    scope
  end
  
  private
  
  def filter_by_status(scope, status)
    return scope if status.blank?
    scope.where(status: status)
  end
  
  def filter_by_date_range(scope, start_date, end_date)
    scope = scope.where('created_at >= ?', start_date) if start_date.present?
    scope = scope.where('created_at <= ?', end_date) if end_date.present?
    scope
  end
  
  def filter_by_amount(scope, min_amount, max_amount)
    scope = scope.where('total >= ?', min_amount) if min_amount.present?
    scope = scope.where('total <= ?', max_amount) if max_amount.present?
    scope
  end
  
  def search(scope, query)
    return scope if query.blank?
    scope.where('order_number ILIKE ? OR notes ILIKE ?', "%#{query}%", "%#{query}%")
  end
  
  def sort(scope, sort_by, sort_order)
    column = %w[created_at total status].include?(sort_by) ? sort_by : 'created_at'
    direction = sort_order == 'asc' ? :asc : :desc
    scope.order(column => direction)
  end
end

# Usage
@orders = OrdersQuery.new(current_user.orders).call(params)
```

## Form Objects

```ruby
class RegistrationForm
  include ActiveModel::Model
  include ActiveModel::Validations
  
  attr_accessor :email, :password, :password_confirmation,
                :first_name, :last_name, :company_name
  
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, presence: true, length: { minimum: 8 }
  validates :password_confirmation, presence: true
  validates :first_name, :last_name, presence: true
  validate :passwords_match
  
  def save
    return false unless valid?
    
    ActiveRecord::Base.transaction do
      @user = User.create!(
        email: email,
        password: password,
        first_name: first_name,
        last_name: last_name
      )
      
      @company = Company.create!(
        name: company_name,
        owner: @user
      )
      
      @user.update!(company: @company)
    end
    
    true
  rescue ActiveRecord::RecordInvalid => e
    errors.add(:base, e.message)
    false
  end
  
  def user
    @user
  end
  
  private
  
  def passwords_match
    if password != password_confirmation
      errors.add(:password_confirmation, "doesn't match password")
    end
  end
end
```

## Background Jobs

```ruby
class ProcessOrderJob < ApplicationJob
  queue_as :orders
  
  retry_on StandardError, wait: :exponentially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound
  
  def perform(order_id)
    order = Order.find(order_id)
    
    return if order.processed?
    
    ActiveRecord::Base.transaction do
      reserve_inventory(order)
      calculate_shipping(order)
      notify_warehouse(order)
      
      order.update!(status: :processing, processed_at: Time.current)
    end
    
    OrderMailer.processing_notification(order).deliver_later
  end
  
  private
  
  def reserve_inventory(order)
    order.order_items.each do |item|
      item.product.decrement!(:stock, item.quantity)
    end
  end
  
  def calculate_shipping(order)
    shipping_cost = ShippingCalculator.new(order).calculate
    order.update!(shipping_cost: shipping_cost)
  end
  
  def notify_warehouse(order)
    WarehouseService.new.notify(order)
  end
end
```

## Caching

```ruby
class ProductsController < ApplicationController
  def index
    @products = Rails.cache.fetch('products/featured', expires_in: 1.hour) do
      Product.featured.includes(:category).limit(20).to_a
    end
  end
  
  def show
    @product = Rails.cache.fetch(product_cache_key, expires_in: 4.hours) do
      Product.includes(:variants, :reviews).find(params[:id])
    end
  end
  
  private
  
  def product_cache_key
    product = Product.find(params[:id])
    "products/#{product.id}-#{product.updated_at.to_i}"
  end
end

# Model caching
class Product < ApplicationRecord
  after_commit :expire_cache
  
  def self.cached_find(id)
    Rails.cache.fetch("products/#{id}", expires_in: 1.hour) do
      find(id)
    end
  end
  
  private
  
  def expire_cache
    Rails.cache.delete("products/#{id}")
    Rails.cache.delete('products/featured')
  end
end

# Fragment caching in views
<% cache @product do %>
  <div class="product">
    <h2><%= @product.name %></h2>
    <!-- ... -->
  </div>
<% end %>

# Russian doll caching
<% cache @order do %>
  <% @order.items.each do |item| %>
    <% cache item do %>
      <%= render item %>
    <% end %>
  <% end %>
<% end %>
```

## Database Optimization

```ruby
class Order < ApplicationRecord
  # Use counter cache
  belongs_to :user, counter_cache: true
  
  # Efficient scopes
  scope :with_associations, -> { 
    includes(:user, :order_items, order_items: :product)
  }
  
  # Avoid N+1 with bullet gem
  # config/environments/development.rb
  # Bullet.enable = true
  # Bullet.alert = true
end

# Batch processing
class CleanupOldOrdersJob < ApplicationJob
  def perform
    # Use find_each for large datasets
    Order.where('created_at < ?', 1.year.ago)
         .find_each(batch_size: 1000) do |order|
      order.archive!
    end
  end
end

# Bulk operations
class BulkUpdateService
  def update_prices(products, increase_percent)
    products.update_all(
      "price = price * #{1 + increase_percent / 100.0}"
    )
  end
  
  # Or use insert_all for bulk inserts
  def import_products(data)
    Product.insert_all(
      data.map { |d| d.merge(created_at: Time.current, updated_at: Time.current) }
    )
  end
end
```

## Error Handling

```ruby
# Custom exceptions
module Orders
  class Error < StandardError; end
  class InsufficientStockError < Error; end
  class PaymentFailedError < Error; end
  class AlreadyProcessedError < Error; end
end

# Global error handling
class ApplicationController < ActionController::Base
  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from ActionController::ParameterMissing, with: :bad_request
  rescue_from Pundit::NotAuthorizedError, with: :forbidden
  
  private
  
  def not_found(exception)
    respond_to do |format|
      format.html { render 'errors/not_found', status: :not_found }
      format.json { render json: { error: 'Not found' }, status: :not_found }
    end
  end
  
  def bad_request(exception)
    respond_to do |format|
      format.html { render 'errors/bad_request', status: :bad_request }
      format.json { render json: { error: exception.message }, status: :bad_request }
    end
  end
  
  def forbidden(exception)
    respond_to do |format|
      format.html { redirect_to root_path, alert: 'You are not authorized' }
      format.json { render json: { error: 'Forbidden' }, status: :forbidden }
    end
  end
end
```

## Testing Best Practices

```ruby
# spec/services/create_order_service_spec.rb
RSpec.describe CreateOrderService do
  describe '#call' do
    subject(:service) { described_class.new(user: user, params: params) }
    
    let(:user) { create(:user) }
    let(:product) { create(:product, stock: 10, price: 100) }
    let(:params) do
      {
        shipping_address: '123 Main St',
        items: [{ product_id: product.id, quantity: 2 }]
      }
    end
    
    context 'with valid params' do
      it 'creates an order' do
        expect { service.call }.to change(Order, :count).by(1)
      end
      
      it 'returns success' do
        result = service.call
        expect(result).to be_success
        expect(result.order).to be_persisted
      end
      
      it 'enqueues confirmation email' do
        expect { service.call }
          .to have_enqueued_mail(OrderMailer, :confirmation)
      end
    end
    
    context 'with insufficient stock' do
      before { product.update!(stock: 1) }
      
      it 'returns failure' do
        result = service.call
        expect(result).not_to be_success
        expect(result.errors).to include(/insufficient stock/)
      end
      
      it 'does not create order' do
        expect { service.call }.not_to change(Order, :count)
      end
    end
  end
end

# Use factories
FactoryBot.define do
  factory :order do
    association :user
    shipping_address { Faker::Address.full_address }
    status { :pending }
    
    trait :with_items do
      after(:create) do |order|
        create_list(:order_item, 3, order: order)
        order.reload
      end
    end
    
    trait :completed do
      status { :delivered }
      completed_at { Time.current }
    end
  end
end
```

## Security

```ruby
# Strong parameters
def user_params
  params.require(:user).permit(:name, :email)
  # Never permit :is_admin, :role, etc.
end

# Scoped queries
def show
  # Always scope to current user
  @order = current_user.orders.find(params[:id])
end

# Use Pundit for authorization
class OrderPolicy < ApplicationPolicy
  def show?
    record.user == user || user.admin?
  end
  
  def update?
    record.user == user && record.pending?
  end
  
  def destroy?
    user.admin?
  end
  
  class Scope < Scope
    def resolve
      if user.admin?
        scope.all
      else
        scope.where(user: user)
      end
    end
  end
end
```

## Configuration

```ruby
# Use Rails credentials
# Edit: rails credentials:edit

# Access:
Rails.application.credentials.stripe_api_key
Rails.application.credentials.dig(:aws, :access_key_id)

# Environment-specific
Rails.application.credentials.dig(Rails.env.to_sym, :database_password)

# Configuration classes
class AppConfig
  class << self
    def stripe_key
      ENV.fetch('STRIPE_API_KEY') { Rails.application.credentials.stripe_api_key }
    end
    
    def redis_url
      ENV.fetch('REDIS_URL', 'redis://localhost:6379/0')
    end
    
    def feature_enabled?(feature)
      ENV["FEATURE_#{feature.upcase}"] == 'true'
    end
  end
end
```
