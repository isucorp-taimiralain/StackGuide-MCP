# Ruby on Rails Design Patterns

## Service Objects

```ruby
# Basic service object
class ApplicationService
  def self.call(...)
    new(...).call
  end
end

class CreateUserService < ApplicationService
  def initialize(params:, invited_by: nil)
    @params = params
    @invited_by = invited_by
  end
  
  def call
    user = User.new(@params)
    
    ActiveRecord::Base.transaction do
      user.save!
      create_profile!(user)
      send_welcome_email(user)
      credit_referrer(user) if @invited_by
    end
    
    Result.success(user)
  rescue ActiveRecord::RecordInvalid => e
    Result.failure(e.record.errors.full_messages)
  end
  
  private
  
  def create_profile!(user)
    user.create_profile!(
      timezone: @params[:timezone] || 'UTC'
    )
  end
  
  def send_welcome_email(user)
    UserMailer.welcome(user).deliver_later
  end
  
  def credit_referrer(user)
    ReferralService.call(referrer: @invited_by, referred: user)
  end
end

# Result object
class Result
  attr_reader :value, :errors
  
  def initialize(success:, value: nil, errors: [])
    @success = success
    @value = value
    @errors = errors
  end
  
  def success?
    @success
  end
  
  def failure?
    !@success
  end
  
  def self.success(value = nil)
    new(success: true, value: value)
  end
  
  def self.failure(errors)
    new(success: false, errors: Array(errors))
  end
end
```

## Query Objects

```ruby
class ProductsQuery
  SORTABLE_COLUMNS = %w[name price created_at stock].freeze
  
  def initialize(relation = Product.all)
    @relation = relation
  end
  
  def call(params = {})
    @relation
      .then { |r| with_category(r, params[:category_id]) }
      .then { |r| with_price_range(r, params[:min_price], params[:max_price]) }
      .then { |r| with_availability(r, params[:in_stock]) }
      .then { |r| with_search(r, params[:query]) }
      .then { |r| with_sort(r, params[:sort_by], params[:sort_order]) }
      .then { |r| with_includes(r) }
  end
  
  private
  
  def with_category(relation, category_id)
    return relation unless category_id.present?
    relation.where(category_id: category_id)
  end
  
  def with_price_range(relation, min, max)
    relation = relation.where('price >= ?', min) if min.present?
    relation = relation.where('price <= ?', max) if max.present?
    relation
  end
  
  def with_availability(relation, in_stock)
    return relation unless in_stock.present?
    in_stock ? relation.where('stock > 0') : relation.where(stock: 0)
  end
  
  def with_search(relation, query)
    return relation unless query.present?
    relation.where('name ILIKE ? OR description ILIKE ?', 
                   "%#{query}%", "%#{query}%")
  end
  
  def with_sort(relation, column, order)
    column = SORTABLE_COLUMNS.include?(column) ? column : 'created_at'
    order = %w[asc desc].include?(order) ? order : 'desc'
    relation.order(column => order)
  end
  
  def with_includes(relation)
    relation.includes(:category, :variants)
  end
end

# Usage
products = ProductsQuery.new.call(
  category_id: params[:category],
  min_price: params[:min],
  max_price: params[:max],
  in_stock: true,
  query: params[:q],
  sort_by: 'price',
  sort_order: 'asc'
)
```

## Form Objects

```ruby
class RegistrationForm
  include ActiveModel::Model
  include ActiveModel::Validations::Callbacks
  
  attr_accessor :email, :password, :password_confirmation,
                :first_name, :last_name, :company_name,
                :terms_accepted
  
  validates :email, presence: true, 
            format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, presence: true, 
            length: { minimum: 8 },
            confirmation: true
  validates :first_name, :last_name, presence: true
  validates :terms_accepted, acceptance: true
  
  validate :email_uniqueness
  
  def save
    return false unless valid?
    
    ActiveRecord::Base.transaction do
      create_user!
      create_company!
      send_verification_email
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
  
  def create_user!
    @user = User.create!(
      email: email,
      password: password,
      first_name: first_name,
      last_name: last_name
    )
  end
  
  def create_company!
    @user.create_company!(name: company_name)
  end
  
  def send_verification_email
    UserMailer.verification(@user).deliver_later
  end
  
  def email_uniqueness
    if User.exists?(email: email)
      errors.add(:email, 'is already taken')
    end
  end
end

# Usage in controller
class RegistrationsController < ApplicationController
  def create
    @form = RegistrationForm.new(registration_params)
    
    if @form.save
      redirect_to dashboard_path, notice: 'Welcome!'
    else
      render :new
    end
  end
  
  private
  
  def registration_params
    params.require(:registration).permit(
      :email, :password, :password_confirmation,
      :first_name, :last_name, :company_name, :terms_accepted
    )
  end
end
```

## Presenter/Decorator Pattern

```ruby
# Using Draper
class OrderDecorator < Draper::Decorator
  delegate_all
  
  def formatted_total
    h.number_to_currency(total)
  end
  
  def status_badge
    h.content_tag(:span, status.titleize, class: "badge badge-#{status_color}")
  end
  
  def created_date
    created_at.strftime('%B %d, %Y')
  end
  
  def shipping_address_html
    h.simple_format(shipping_address)
  end
  
  def items_summary
    "#{order_items.count} items"
  end
  
  private
  
  def status_color
    case status
    when 'pending' then 'warning'
    when 'processing' then 'info'
    when 'shipped' then 'primary'
    when 'delivered' then 'success'
    when 'cancelled' then 'danger'
    else 'secondary'
    end
  end
end

# Plain Ruby presenter
class OrderPresenter
  def initialize(order, view_context)
    @order = order
    @h = view_context
  end
  
  def formatted_total
    @h.number_to_currency(@order.total)
  end
  
  def as_json
    {
      id: @order.id,
      order_number: @order.order_number,
      formatted_total: formatted_total,
      status: @order.status,
      items: items_json
    }
  end
  
  private
  
  def items_json
    @order.order_items.map do |item|
      OrderItemPresenter.new(item, @h).as_json
    end
  end
end
```

## Strategy Pattern

```ruby
# Payment strategy
module PaymentStrategies
  class Base
    def charge(amount, details)
      raise NotImplementedError
    end
    
    def refund(transaction_id, amount)
      raise NotImplementedError
    end
  end
  
  class Stripe < Base
    def charge(amount, details)
      result = ::Stripe::Charge.create(
        amount: amount,
        currency: 'usd',
        source: details[:token]
      )
      
      PaymentResult.new(
        success: true,
        transaction_id: result.id
      )
    rescue ::Stripe::CardError => e
      PaymentResult.new(success: false, error: e.message)
    end
    
    def refund(transaction_id, amount)
      ::Stripe::Refund.create(charge: transaction_id, amount: amount)
      RefundResult.new(success: true)
    rescue ::Stripe::StripeError => e
      RefundResult.new(success: false, error: e.message)
    end
  end
  
  class PayPal < Base
    def charge(amount, details)
      # PayPal implementation
    end
    
    def refund(transaction_id, amount)
      # PayPal implementation
    end
  end
end

# Strategy factory
class PaymentStrategyFactory
  STRATEGIES = {
    'stripe' => PaymentStrategies::Stripe,
    'paypal' => PaymentStrategies::PayPal
  }.freeze
  
  def self.build(provider)
    strategy_class = STRATEGIES[provider.to_s]
    raise ArgumentError, "Unknown provider: #{provider}" unless strategy_class
    strategy_class.new
  end
end

# Usage
class PaymentService
  def process(order, provider, details)
    strategy = PaymentStrategyFactory.build(provider)
    strategy.charge(order.total_cents, details)
  end
end
```

## Repository Pattern

```ruby
class UserRepository
  def initialize(model = User)
    @model = model
  end
  
  def find(id)
    @model.find(id)
  rescue ActiveRecord::RecordNotFound
    nil
  end
  
  def find!(id)
    @model.find(id)
  end
  
  def find_by_email(email)
    @model.find_by(email: email.downcase)
  end
  
  def create(attributes)
    @model.create(attributes)
  end
  
  def update(user, attributes)
    user.update(attributes)
    user
  end
  
  def delete(user)
    user.destroy
  end
  
  def all
    @model.all
  end
  
  def active
    @model.where(active: true)
  end
  
  def with_orders
    @model.includes(:orders).where.not(orders: { id: nil })
  end
  
  def paginate(page:, per_page: 20)
    @model.page(page).per(per_page)
  end
end
```

## Builder Pattern

```ruby
class ReportBuilder
  def initialize
    @title = 'Report'
    @sections = []
    @footer = nil
    @format = :pdf
  end
  
  def title(title)
    @title = title
    self
  end
  
  def add_section(name, &block)
    section = Section.new(name)
    block.call(section) if block_given?
    @sections << section
    self
  end
  
  def footer(text)
    @footer = text
    self
  end
  
  def format(format)
    @format = format
    self
  end
  
  def build
    Report.new(
      title: @title,
      sections: @sections,
      footer: @footer,
      format: @format
    )
  end
  
  class Section
    attr_reader :name, :content
    
    def initialize(name)
      @name = name
      @content = []
    end
    
    def add_text(text)
      @content << { type: :text, value: text }
    end
    
    def add_table(data, headers:)
      @content << { type: :table, headers: headers, data: data }
    end
    
    def add_chart(type:, data:)
      @content << { type: :chart, chart_type: type, data: data }
    end
  end
end

# Usage
report = ReportBuilder.new
  .title('Monthly Sales Report')
  .add_section('Overview') do |s|
    s.add_text('Summary of sales for the month')
    s.add_chart(type: :bar, data: sales_data)
  end
  .add_section('Details') do |s|
    s.add_table(orders, headers: ['Order', 'Amount', 'Date'])
  end
  .footer('Generated on #{Date.today}')
  .format(:pdf)
  .build
```

## Observer Pattern (Using Wisper)

```ruby
# Publisher
class OrderCreator
  include Wisper::Publisher
  
  def call(params)
    order = Order.new(params)
    
    if order.save
      broadcast(:order_created, order)
      Result.success(order)
    else
      broadcast(:order_creation_failed, order.errors)
      Result.failure(order.errors)
    end
  end
end

# Subscribers
class OrderNotifier
  def order_created(order)
    OrderMailer.confirmation(order).deliver_later
  end
end

class InventoryManager
  def order_created(order)
    order.items.each do |item|
      item.product.decrement!(:stock, item.quantity)
    end
  end
end

class AnalyticsTracker
  def order_created(order)
    Analytics.track('order_created', {
      order_id: order.id,
      total: order.total,
      items_count: order.items.count
    })
  end
end

# Configuration
Wisper.subscribe(OrderNotifier.new)
Wisper.subscribe(InventoryManager.new)
Wisper.subscribe(AnalyticsTracker.new)

# Usage
OrderCreator.new.call(order_params)
```

## Command Pattern

```ruby
class Command
  def execute
    raise NotImplementedError
  end
  
  def undo
    raise NotImplementedError
  end
end

class UpdateProductPriceCommand < Command
  def initialize(product, new_price)
    @product = product
    @new_price = new_price
    @old_price = product.price
  end
  
  def execute
    @product.update!(price: @new_price)
  end
  
  def undo
    @product.update!(price: @old_price)
  end
end

class CommandInvoker
  def initialize
    @history = []
  end
  
  def execute(command)
    command.execute
    @history << command
  end
  
  def undo_last
    return if @history.empty?
    command = @history.pop
    command.undo
  end
  
  def undo_all
    @history.reverse_each(&:undo)
    @history.clear
  end
end
```

## Null Object Pattern

```ruby
class GuestUser
  def name
    'Guest'
  end
  
  def email
    nil
  end
  
  def admin?
    false
  end
  
  def can?(action, resource)
    action == :read && resource.public?
  end
  
  def orders
    Order.none
  end
end

class ApplicationController < ActionController::Base
  def current_user
    @current_user ||= begin
      if session[:user_id]
        User.find_by(id: session[:user_id]) || GuestUser.new
      else
        GuestUser.new
      end
    end
  end
end

# No more nil checks needed
current_user.name # Works for both User and GuestUser
```
