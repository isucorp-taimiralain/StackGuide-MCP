# Ruby on Rails Coding Standards

## Project Structure

```
app/
├── controllers/          # Handle HTTP requests
├── models/               # ActiveRecord models
├── views/                # ERB/Haml templates
├── helpers/              # View helpers
├── services/             # Business logic services
├── jobs/                 # Background jobs
├── mailers/              # Email handling
├── serializers/          # API serialization
├── policies/             # Authorization policies
├── validators/           # Custom validators
└── forms/                # Form objects
config/
├── routes.rb             # Route definitions
├── database.yml          # Database config
└── initializers/         # App initialization
db/
├── migrate/              # Database migrations
└── seeds.rb              # Seed data
spec/                     # RSpec tests
lib/                      # Library code
```

## Naming Conventions

```ruby
# Models - singular, CamelCase
class User < ApplicationRecord
end

class OrderItem < ApplicationRecord
end

# Controllers - plural, CamelCase with Controller suffix
class UsersController < ApplicationController
end

class Api::V1::OrdersController < ApplicationController
end

# Tables - plural, snake_case
# users, order_items, api_tokens

# Columns - snake_case
# first_name, created_at, is_active

# Foreign keys - singular_id
# user_id, order_item_id

# Methods - snake_case
def calculate_total
end

# Boolean methods - end with ?
def active?
end

# Dangerous methods - end with !
def destroy!
end
```

## Controllers

```ruby
# Good - Thin controllers
class OrdersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_order, only: [:show, :update, :destroy]
  
  def index
    @orders = policy_scope(Order)
                .includes(:items, :user)
                .order(created_at: :desc)
                .page(params[:page])
    
    respond_to do |format|
      format.html
      format.json { render json: OrderSerializer.new(@orders) }
    end
  end
  
  def create
    @order = CreateOrderService.call(
      user: current_user,
      params: order_params
    )
    
    if @order.persisted?
      redirect_to @order, notice: 'Order created successfully.'
    else
      render :new, status: :unprocessable_entity
    end
  end
  
  def update
    authorize @order
    
    if @order.update(order_params)
      redirect_to @order
    else
      render :edit, status: :unprocessable_entity
    end
  end
  
  private
  
  def set_order
    @order = Order.find(params[:id])
  end
  
  def order_params
    params.require(:order).permit(
      :shipping_address,
      :notes,
      items_attributes: [:product_id, :quantity, :_destroy]
    )
  end
end
```

## API Controllers

```ruby
module Api
  module V1
    class OrdersController < ApplicationController
      before_action :authenticate_api_user!
      
      def index
        orders = current_user.orders
                             .includes(:items)
                             .order(created_at: :desc)
                             .page(params[:page])
                             .per(params[:per_page] || 20)
        
        render json: {
          data: OrderSerializer.new(orders),
          meta: pagination_meta(orders)
        }
      end
      
      def create
        result = CreateOrderService.call(
          user: current_user,
          params: order_params
        )
        
        if result.success?
          render json: OrderSerializer.new(result.order), status: :created
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      end
      
      private
      
      def order_params
        params.require(:order).permit(
          :shipping_address,
          items: [:product_id, :quantity]
        )
      end
      
      def pagination_meta(collection)
        {
          current_page: collection.current_page,
          total_pages: collection.total_pages,
          total_count: collection.total_count,
          per_page: collection.limit_value
        }
      end
    end
  end
end
```

## Models

```ruby
class Order < ApplicationRecord
  # Associations first
  belongs_to :user
  belongs_to :coupon, optional: true
  has_many :order_items, dependent: :destroy
  has_many :products, through: :order_items
  has_one :payment
  
  # Nested attributes
  accepts_nested_attributes_for :order_items, 
    allow_destroy: true,
    reject_if: :all_blank
  
  # Enums
  enum status: {
    pending: 0,
    processing: 1,
    shipped: 2,
    delivered: 3,
    cancelled: 4
  }, _prefix: true
  
  # Validations
  validates :shipping_address, presence: true
  validates :total, numericality: { greater_than_or_equal_to: 0 }
  validates :status, inclusion: { in: statuses.keys }
  
  # Scopes
  scope :recent, -> { order(created_at: :desc) }
  scope :completed, -> { where(status: [:shipped, :delivered]) }
  scope :for_user, ->(user) { where(user: user) }
  scope :created_between, ->(start_date, end_date) {
    where(created_at: start_date..end_date)
  }
  
  # Callbacks (use sparingly)
  before_validation :calculate_totals
  after_create :send_confirmation_email
  after_commit :broadcast_update, on: [:create, :update]
  
  # Class methods
  def self.search(query)
    where('order_number ILIKE ?', "%#{query}%")
  end
  
  # Instance methods
  def can_be_cancelled?
    pending? || processing?
  end
  
  def cancel!
    raise OrderError, 'Cannot cancel this order' unless can_be_cancelled?
    
    transaction do
      update!(status: :cancelled)
      restore_inventory!
      refund_payment!
    end
  end
  
  private
  
  def calculate_totals
    self.subtotal = order_items.sum(&:line_total)
    self.tax = subtotal * tax_rate
    self.total = subtotal + tax - discount
  end
end
```

## Services

```ruby
# app/services/application_service.rb
class ApplicationService
  def self.call(...)
    new(...).call
  end
end

# app/services/create_order_service.rb
class CreateOrderService < ApplicationService
  def initialize(user:, params:)
    @user = user
    @params = params
    @errors = []
  end
  
  def call
    validate_stock!
    
    return failure if @errors.any?
    
    order = build_order
    
    if order.save
      process_order(order)
      success(order)
    else
      @errors.concat(order.errors.full_messages)
      failure
    end
  rescue StandardError => e
    Rails.logger.error("CreateOrderService error: #{e.message}")
    @errors << 'An unexpected error occurred'
    failure
  end
  
  private
  
  attr_reader :user, :params, :errors
  
  def validate_stock!
    params[:items]&.each do |item|
      product = Product.find(item[:product_id])
      if product.stock < item[:quantity].to_i
        @errors << "#{product.name} has insufficient stock"
      end
    end
  end
  
  def build_order
    Order.new(
      user: user,
      shipping_address: params[:shipping_address],
      order_items_attributes: params[:items]
    )
  end
  
  def process_order(order)
    ReserveInventoryJob.perform_later(order.id)
    OrderMailer.confirmation(order).deliver_later
  end
  
  def success(order)
    OpenStruct.new(success?: true, order: order, errors: [])
  end
  
  def failure
    OpenStruct.new(success?: false, order: nil, errors: errors)
  end
end
```

## Routes

```ruby
Rails.application.routes.draw do
  # Root
  root 'pages#home'
  
  # Resourceful routes
  resources :orders do
    member do
      post :cancel
      get :invoice
    end
    
    collection do
      get :search
    end
    
    resources :items, controller: 'order_items', only: [:create, :destroy]
  end
  
  # Nested resources
  resources :users do
    resources :orders, only: [:index], controller: 'user_orders'
  end
  
  # API namespace
  namespace :api do
    namespace :v1 do
      resources :orders, only: [:index, :show, :create, :update]
      resources :products, only: [:index, :show]
      
      resource :profile, only: [:show, :update]
    end
  end
  
  # Authentication
  devise_for :users, controllers: {
    sessions: 'users/sessions',
    registrations: 'users/registrations'
  }
  
  # Constraints
  constraints(AdminConstraint.new) do
    namespace :admin do
      resources :orders
      resources :users
    end
  end
end
```

## Migrations

```ruby
class CreateOrders < ActiveRecord::Migration[7.1]
  def change
    create_table :orders do |t|
      t.references :user, null: false, foreign_key: true
      t.references :coupon, foreign_key: true
      t.string :order_number, null: false
      t.integer :status, default: 0, null: false
      t.decimal :subtotal, precision: 10, scale: 2, default: 0
      t.decimal :tax, precision: 10, scale: 2, default: 0
      t.decimal :discount, precision: 10, scale: 2, default: 0
      t.decimal :total, precision: 10, scale: 2, default: 0
      t.text :shipping_address, null: false
      t.text :notes
      
      t.timestamps
    end
    
    add_index :orders, :order_number, unique: true
    add_index :orders, [:user_id, :status]
    add_index :orders, :created_at
  end
end
```

## Serializers (using jsonapi-serializer)

```ruby
class OrderSerializer
  include JSONAPI::Serializer
  
  attributes :order_number, :status, :total, :created_at
  
  attribute :formatted_total do |order|
    ActionController::Base.helpers.number_to_currency(order.total)
  end
  
  belongs_to :user, serializer: UserSerializer
  has_many :order_items, serializer: OrderItemSerializer
  
  link :self do |order|
    Rails.application.routes.url_helpers.order_url(order)
  end
end
```
