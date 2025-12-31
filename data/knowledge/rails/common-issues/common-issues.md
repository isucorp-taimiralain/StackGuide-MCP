# Ruby on Rails Common Issues and Solutions

## N+1 Query Problems

```ruby
# ❌ Problem: N+1 queries
@posts = Post.all
@posts.each do |post|
  puts post.author.name      # Query for each post
  post.comments.each do |c|  # Query for each post
    puts c.user.name         # Query for each comment
  end
end

# ✅ Solution: Eager loading with includes
@posts = Post.includes(:author, comments: :user)

# ✅ Preload (separate queries)
@posts = Post.preload(:author, :comments)

# ✅ Eager load (LEFT OUTER JOIN)
@posts = Post.eager_load(:author).where(authors: { active: true })

# ✅ Use Bullet gem to detect N+1
# Gemfile
gem 'bullet', group: :development

# config/environments/development.rb
config.after_initialize do
  Bullet.enable = true
  Bullet.alert = true
  Bullet.rails_logger = true
end
```

## Mass Assignment Vulnerabilities

```ruby
# ❌ Problem: Allowing all parameters
User.create(params[:user])

# ✅ Solution: Strong parameters
def user_params
  params.require(:user).permit(:name, :email, :password)
end

User.create(user_params)

# ❌ Problem: Permitting sensitive fields
params.require(:user).permit(:name, :email, :role, :is_admin)

# ✅ Solution: Conditional permissions
def user_params
  permitted = [:name, :email, :password]
  permitted += [:role, :is_admin] if current_user.admin?
  params.require(:user).permit(*permitted)
end
```

## Memory Bloat with Large Queries

```ruby
# ❌ Problem: Loading all records into memory
User.all.each do |user|
  # Process millions of records
end

# ✅ Solution: Use find_each or find_in_batches
User.find_each(batch_size: 1000) do |user|
  # Loads 1000 at a time
end

User.find_in_batches(batch_size: 1000) do |users|
  users.each { |user| process(user) }
end

# ✅ Use cursor for streaming (with activerecord-cursor)
User.cursor.each do |user|
  # One record at a time, doesn't load into AR
end

# ✅ Use pluck for simple values
emails = User.where(active: true).pluck(:email)

# ✅ Use select to limit columns
User.select(:id, :email).find_each { |user| ... }
```

## Slow Database Queries

```ruby
# ❌ Problem: Missing indexes
User.where(email: 'test@example.com') # Full table scan

# ✅ Solution: Add indexes in migrations
class AddIndexToUsersEmail < ActiveRecord::Migration[7.1]
  def change
    add_index :users, :email, unique: true
    add_index :orders, [:user_id, :status] # Composite index
    add_index :products, :name, using: :gin, opclass: :gin_trgm_ops # For LIKE
  end
end

# ✅ Use EXPLAIN to analyze queries
User.where(email: 'test@example.com').explain
# Or in console
ActiveRecord::Base.connection.execute("EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test'")
```

## Callback Hell

```ruby
# ❌ Problem: Too many callbacks
class Order < ApplicationRecord
  after_create :send_email
  after_create :update_inventory
  after_create :notify_warehouse
  after_create :calculate_loyalty_points
  after_create :update_analytics
  after_create :sync_to_erp
  # Hard to test, hard to understand, hidden side effects
end

# ✅ Solution: Use service objects
class CreateOrderService
  def call(params)
    order = Order.create!(params)
    
    OrderMailer.confirmation(order).deliver_later
    UpdateInventoryJob.perform_later(order.id)
    NotifyWarehouseJob.perform_later(order.id)
    CalculateLoyaltyPointsJob.perform_later(order.id)
    AnalyticsService.track('order_created', order.id)
    ErpSyncJob.perform_later(order.id)
    
    order
  end
end
```

## Transaction Issues

```ruby
# ❌ Problem: Operations outside transaction
def transfer_funds(from, to, amount)
  from.balance -= amount
  from.save!
  # If this fails, from is already debited
  to.balance += amount
  to.save!
end

# ✅ Solution: Wrap in transaction
def transfer_funds(from, to, amount)
  ActiveRecord::Base.transaction do
    from.lock!
    to.lock!
    
    from.update!(balance: from.balance - amount)
    to.update!(balance: to.balance + amount)
  end
rescue ActiveRecord::RecordInvalid => e
  # Both operations rolled back
  raise TransferError, e.message
end

# ❌ Problem: Side effects in transaction
ActiveRecord::Base.transaction do
  order.save!
  OrderMailer.confirmation(order).deliver_now # Email sent even if rollback
end

# ✅ Solution: Use after_commit or deliver_later
ActiveRecord::Base.transaction do
  order.save!
end
OrderMailer.confirmation(order).deliver_later

# Or use after_commit callback
class Order < ApplicationRecord
  after_commit :send_confirmation, on: :create
end
```

## Serialization Issues

```ruby
# ❌ Problem: Circular references in JSON
render json: @user # User -> posts -> user -> posts...

# ✅ Solution: Use serializers
class UserSerializer < ActiveModel::Serializer
  attributes :id, :name, :email
  has_many :posts, serializer: PostSummarySerializer
end

# ✅ Or use as_json with options
render json: @user.as_json(
  only: [:id, :name, :email],
  include: { posts: { only: [:id, :title] } }
)
```

## Time Zone Issues

```ruby
# ❌ Problem: Using Date.today or Time.now
orders = Order.where('created_at > ?', Date.today)

# ✅ Solution: Use Time.current and Date.current
orders = Order.where('created_at > ?', Date.current.beginning_of_day)

# ✅ Configure time zone
# config/application.rb
config.time_zone = 'Eastern Time (US & Canada)'

# ❌ Problem: Comparing times without zone
if event.starts_at > Time.now # May be different zones

# ✅ Solution: Always use zone-aware methods
if event.starts_at > Time.current
if event.starts_at.to_date == Date.current
```

## Asset Pipeline Issues

```ruby
# ❌ Problem: Assets not compiling in production
# Missing precompilation

# ✅ Solution: Add to manifest
# app/assets/config/manifest.js
//= link_tree ../images
//= link_tree ../builds

# ✅ Precompile in deployment
# config/environments/production.rb
config.assets.compile = false # Don't compile on-the-fly

# Precompile command
$ RAILS_ENV=production rails assets:precompile
```

## Caching Issues

```ruby
# ❌ Problem: Stale cache
Rails.cache.fetch('user_count') do
  User.count
end

# ✅ Solution: Use versioned keys
Rails.cache.fetch(['user_count', User.maximum(:updated_at)]) do
  User.count
end

# ✅ Or use touch to invalidate
class Comment < ApplicationRecord
  belongs_to :post, touch: true
end

# View caching with version
<% cache @post do %>
  <%= @post.title %>
<% end %>

# ❌ Problem: Cache not clearing
Rails.cache.delete('key') # Might not clear all related keys

# ✅ Solution: Use cache tags (with redis-cache-tags)
Rails.cache.fetch('posts', tags: ['posts']) { Post.all }
Rails.cache.delete_matched('posts*')
```

## Background Job Failures

```ruby
# ❌ Problem: Jobs failing silently
class ProcessOrderJob < ApplicationJob
  def perform(order_id)
    order = Order.find(order_id) # Raises if not found
    process(order)
  end
end

# ✅ Solution: Handle failures gracefully
class ProcessOrderJob < ApplicationJob
  retry_on StandardError, wait: :exponentially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound
  
  def perform(order_id)
    order = Order.find(order_id)
    process(order)
  rescue PaymentError => e
    order.update!(status: :payment_failed, error: e.message)
    raise # Re-raise for retry
  end
  
  private
  
  def process(order)
    # Processing logic
  end
end
```

## Testing Issues

```ruby
# ❌ Problem: Tests using database when mocking would work
it 'sends email' do
  user = User.create!(name: 'Test', email: 'test@test.com') # Slow
  expect { UserMailer.welcome(user).deliver_now }
    .to change { ActionMailer::Base.deliveries.count }
end

# ✅ Solution: Use factories and mocks appropriately
it 'sends email' do
  user = build_stubbed(:user) # No database
  expect { UserMailer.welcome(user).deliver_now }
    .to change { ActionMailer::Base.deliveries.count }
end

# ✅ Use let! for setup, let for lazy loading
RSpec.describe Order do
  let(:user) { create(:user) }
  let!(:order) { create(:order, user: user) } # Created immediately
  
  it 'belongs to user' do
    expect(order.user).to eq(user)
  end
end

# ❌ Problem: Tests dependent on order
it 'first test' do
  @shared_state = create(:user)
end

it 'second test' do
  expect(@shared_state).to be_present # Fails if run alone
end

# ✅ Solution: Each test is independent
let(:user) { create(:user) }

it 'first test' do
  expect(user).to be_valid
end

it 'second test' do
  expect(user).to be_valid
end
```

## Deployment Issues

```bash
# Problem: Missing environment variables
# Rails fails to boot with KeyError

# Solution: Use credentials or check for required vars
# config/initializers/01_check_env.rb
%w[DATABASE_URL REDIS_URL SECRET_KEY_BASE].each do |key|
  raise "Missing #{key}" unless ENV[key].present?
end

# Problem: Migrations not running
# Solution: Run as part of deploy
$ bundle exec rails db:migrate

# Or check for pending migrations
# config/initializers/check_migrations.rb
if Rails.env.production?
  needs_migration = ActiveRecord::Base.connection.migration_context.needs_migration?
  raise 'Pending migrations!' if needs_migration
end
```

## Security Vulnerabilities

```ruby
# ❌ Problem: SQL injection
User.where("name LIKE '%#{params[:name]}%'")

# ✅ Solution: Use parameterized queries
User.where("name LIKE ?", "%#{params[:name]}%")

# ❌ Problem: Open redirect
redirect_to params[:return_url]

# ✅ Solution: Validate URLs
def safe_redirect(url)
  uri = URI.parse(url)
  if uri.host.nil? || uri.host == request.host
    redirect_to url
  else
    redirect_to root_path
  end
rescue URI::InvalidURIError
  redirect_to root_path
end

# ❌ Problem: Exposing sensitive data
render json: @user

# ✅ Solution: Control serialization
render json: @user.as_json(only: [:id, :name, :email])
```
