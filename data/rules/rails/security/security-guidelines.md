# Ruby on Rails Security Guidelines

## Authentication

### Devise Configuration
```ruby
# config/initializers/devise.rb
Devise.setup do |config|
  config.password_length = 8..128
  config.stretches = Rails.env.test? ? 1 : 12
  config.pepper = Rails.application.credentials.devise_pepper
  config.send_password_change_notification = true
  config.reconfirmable = true
  config.expire_all_remember_me_on_sign_out = true
  config.paranoid = true # Don't reveal if email exists
  
  # Lockable
  config.lock_strategy = :failed_attempts
  config.unlock_keys = [:email]
  config.unlock_strategy = :both
  config.maximum_attempts = 5
  config.unlock_in = 1.hour
  
  # Timeout
  config.timeout_in = 30.minutes
end
```

### API Token Authentication
```ruby
class ApiToken < ApplicationRecord
  belongs_to :user
  
  has_secure_token :token
  
  scope :active, -> { where('expires_at > ?', Time.current) }
  
  def expired?
    expires_at < Time.current
  end
  
  def refresh!
    update!(
      token: SecureRandom.hex(32),
      expires_at: 7.days.from_now
    )
  end
end

module Api
  class ApplicationController < ActionController::API
    before_action :authenticate_api_user!
    
    private
    
    def authenticate_api_user!
      token = extract_token
      return unauthorized unless token
      
      api_token = ApiToken.active.find_by(token: token)
      return unauthorized unless api_token
      
      @current_user = api_token.user
    end
    
    def extract_token
      request.headers['Authorization']&.gsub(/^Bearer /, '')
    end
    
    def unauthorized
      render json: { error: 'Unauthorized' }, status: :unauthorized
    end
    
    def current_user
      @current_user
    end
  end
end
```

### JWT Authentication
```ruby
class JsonWebToken
  SECRET_KEY = Rails.application.credentials.jwt_secret_key!
  
  def self.encode(payload, exp = 24.hours.from_now)
    payload[:exp] = exp.to_i
    JWT.encode(payload, SECRET_KEY, 'HS256')
  end
  
  def self.decode(token)
    decoded = JWT.decode(token, SECRET_KEY, true, { algorithm: 'HS256' })
    HashWithIndifferentAccess.new(decoded.first)
  rescue JWT::ExpiredSignature
    raise AuthenticationError, 'Token has expired'
  rescue JWT::DecodeError
    raise AuthenticationError, 'Invalid token'
  end
end

class AuthenticationError < StandardError; end
```

## Authorization

### Pundit Policies
```ruby
class ApplicationPolicy
  attr_reader :user, :record
  
  def initialize(user, record)
    raise Pundit::NotAuthorizedError, 'must be logged in' unless user
    @user = user
    @record = record
  end
  
  def index?
    false
  end
  
  def show?
    false
  end
  
  def create?
    false
  end
  
  def update?
    false
  end
  
  def destroy?
    false
  end
  
  class Scope
    attr_reader :user, :scope
    
    def initialize(user, scope)
      raise Pundit::NotAuthorizedError, 'must be logged in' unless user
      @user = user
      @scope = scope
    end
    
    def resolve
      raise NotImplementedError, "You must define #resolve in #{self.class}"
    end
  end
end

class OrderPolicy < ApplicationPolicy
  def show?
    owner? || admin?
  end
  
  def update?
    owner? && record.editable?
  end
  
  def destroy?
    admin?
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
  
  private
  
  def owner?
    record.user_id == user.id
  end
  
  def admin?
    user.admin?
  end
end

# Controller usage
class OrdersController < ApplicationController
  def show
    @order = Order.find(params[:id])
    authorize @order
  end
  
  def index
    @orders = policy_scope(Order)
  end
end
```

## SQL Injection Prevention

```ruby
# ❌ Vulnerable to SQL injection
User.where("email = '#{params[:email]}'")
User.where("name LIKE '%#{params[:query]}%'")

# ✅ Safe - Parameterized queries
User.where(email: params[:email])
User.where('email = ?', params[:email])
User.where('name LIKE ?', "%#{params[:query]}%")
User.where('name ILIKE :query', query: "%#{sanitize_sql_like(params[:query])}%")

# ✅ Safe - Named bindings
Order.where('created_at BETWEEN :start AND :end', 
            start: params[:start_date], 
            end: params[:end_date])

# ✅ Safe column ordering
ALLOWED_COLUMNS = %w[name email created_at].freeze
ALLOWED_DIRECTIONS = %w[asc desc].freeze

def sort_column
  ALLOWED_COLUMNS.include?(params[:sort]) ? params[:sort] : 'created_at'
end

def sort_direction
  ALLOWED_DIRECTIONS.include?(params[:direction]) ? params[:direction] : 'desc'
end

User.order("#{sort_column} #{sort_direction}")
```

## XSS Prevention

```ruby
# ERB escapes by default
<%= @user.name %> # Safe - escapes HTML

# Raw output (dangerous - avoid when possible)
<%== @content %> # Dangerous
<%= raw @content %> # Dangerous
<%= @content.html_safe %> # Dangerous

# Sanitize user content
<%= sanitize @user.bio, tags: %w[p br strong em], attributes: %w[class id] %>

# Content Security Policy
# config/initializers/content_security_policy.rb
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.font_src    :self, 'https://fonts.googleapis.com'
    policy.img_src     :self, :https, :data
    policy.object_src  :none
    policy.script_src  :self, :https
    policy.style_src   :self, :https, :unsafe_inline
    policy.frame_ancestors :none
    policy.base_uri    :self
    policy.form_action :self
    
    # Report violations
    policy.report_uri '/csp-violation-report'
  end
  
  config.content_security_policy_nonce_generator = ->(request) { 
    SecureRandom.base64(16) 
  }
  config.content_security_policy_nonce_directives = %w[script-src]
end
```

## CSRF Protection

```ruby
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
  
  # For APIs that use tokens instead of sessions
  skip_before_action :verify_authenticity_token, if: :api_request?
  
  private
  
  def api_request?
    request.format.json? && request.headers['Authorization'].present?
  end
end

# Views - include CSRF token
<%= form_with model: @order do |form| %>
  <!-- CSRF token automatically included -->
<% end %>

# JavaScript - include token in AJAX requests
# application.js
const token = document.querySelector('meta[name="csrf-token"]').content;
fetch('/orders', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
```

## Mass Assignment Protection

```ruby
class UsersController < ApplicationController
  def update
    @user = User.find(params[:id])
    
    # ❌ Dangerous - allows all attributes
    @user.update(params[:user])
    
    # ✅ Safe - only permit allowed attributes
    @user.update(user_params)
  end
  
  private
  
  def user_params
    permitted = [:name, :email, :avatar]
    permitted += [:role, :is_admin] if current_user.admin?
    
    params.require(:user).permit(*permitted)
  end
end

# Model-level protection
class User < ApplicationRecord
  # Define explicitly what can be mass-assigned
  attr_readonly :email # Cannot be changed after creation
end
```

## File Upload Security

```ruby
class AvatarUploader < CarrierWave::Uploader::Base
  include CarrierWave::MiniMagick
  
  # Whitelist extensions
  def extension_allowlist
    %w[jpg jpeg gif png webp]
  end
  
  # Validate content type
  def content_type_allowlist
    /image\//
  end
  
  # Limit file size
  def size_range
    0..5.megabytes
  end
  
  # Store files outside public directory
  def store_dir
    "uploads/#{model.class.to_s.underscore}/#{mounted_as}/#{model.id}"
  end
  
  # Process images
  process resize_to_limit: [800, 800]
  process :strip_exif
  
  def strip_exif
    manipulate! do |img|
      img.strip
      img
    end
  end
end

# Active Storage validation
class User < ApplicationRecord
  has_one_attached :avatar
  
  validates :avatar, 
    content_type: ['image/png', 'image/jpg', 'image/jpeg'],
    size: { less_than: 5.megabytes }
end
```

## Rate Limiting

```ruby
# Rack::Attack configuration
# config/initializers/rack_attack.rb
class Rack::Attack
  # Throttle all requests
  throttle('req/ip', limit: 300, period: 5.minutes) do |req|
    req.ip unless req.path.start_with?('/assets')
  end
  
  # Throttle login attempts
  throttle('logins/ip', limit: 5, period: 20.seconds) do |req|
    if req.path == '/users/sign_in' && req.post?
      req.ip
    end
  end
  
  throttle('logins/email', limit: 5, period: 20.seconds) do |req|
    if req.path == '/users/sign_in' && req.post?
      req.params.dig('user', 'email')&.downcase
    end
  end
  
  # Throttle API requests per token
  throttle('api/token', limit: 100, period: 1.minute) do |req|
    if req.path.start_with?('/api/')
      req.env['HTTP_AUTHORIZATION']
    end
  end
  
  # Block suspicious requests
  blocklist('block bad IPs') do |req|
    Blocklist.blocked?(req.ip)
  end
  
  # Custom response
  self.throttled_responder = lambda do |req|
    retry_after = (req.env['rack.attack.match_data'] || {})[:period]
    [
      429,
      { 'Content-Type' => 'application/json', 'Retry-After' => retry_after.to_s },
      [{ error: 'Rate limit exceeded' }.to_json]
    ]
  end
end
```

## Session Security

```ruby
# config/initializers/session_store.rb
Rails.application.config.session_store :cookie_store,
  key: '_myapp_session',
  secure: Rails.env.production?,
  httponly: true,
  same_site: :lax,
  expire_after: 2.hours

# Redis session store (recommended for production)
Rails.application.config.session_store :redis_session_store,
  key: '_myapp_session',
  redis: {
    expire_after: 2.hours,
    key_prefix: 'myapp:session:',
    url: ENV.fetch('REDIS_URL')
  },
  secure: Rails.env.production?,
  httponly: true,
  same_site: :lax
```

## Encryption

```ruby
# Encrypt sensitive attributes
class User < ApplicationRecord
  encrypts :ssn, deterministic: true
  encrypts :medical_notes
end

# Manual encryption
class EncryptionService
  def self.encrypt(value)
    encryptor.encrypt_and_sign(value)
  end
  
  def self.decrypt(encrypted_value)
    encryptor.decrypt_and_verify(encrypted_value)
  end
  
  private
  
  def self.encryptor
    key = Rails.application.credentials.encryption_key!
    ActiveSupport::MessageEncryptor.new(key)
  end
end
```

## Security Headers

```ruby
# config/initializers/secure_headers.rb
SecureHeaders::Configuration.default do |config|
  config.x_frame_options = "DENY"
  config.x_content_type_options = "nosniff"
  config.x_xss_protection = "1; mode=block"
  config.x_download_options = "noopen"
  config.x_permitted_cross_domain_policies = "none"
  config.referrer_policy = %w[origin-when-cross-origin strict-origin-when-cross-origin]
  
  config.hsts = "max-age=631138519; includeSubDomains"
  
  config.csp = {
    default_src: %w['self'],
    script_src: %w['self' 'unsafe-inline'],
    style_src: %w['self' 'unsafe-inline'],
    img_src: %w['self' data: https:],
    font_src: %w['self' https://fonts.gstatic.com],
    connect_src: %w['self'],
    frame_ancestors: %w['none'],
    form_action: %w['self'],
    base_uri: %w['self']
  }
end
```

## Audit Logging

```ruby
class AuditLog < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :auditable, polymorphic: true, optional: true
  
  validates :action, presence: true
  validates :ip_address, presence: true
end

module Auditable
  extend ActiveSupport::Concern
  
  included do
    after_create { log_audit('create') }
    after_update { log_audit('update') }
    after_destroy { log_audit('destroy') }
  end
  
  private
  
  def log_audit(action)
    return unless Current.user
    
    AuditLog.create!(
      user: Current.user,
      auditable: self,
      action: action,
      ip_address: Current.request&.remote_ip || 'unknown',
      user_agent: Current.request&.user_agent,
      changes_made: saved_changes.except(:updated_at).to_json
    )
  end
end

# Current attributes
class Current < ActiveSupport::CurrentAttributes
  attribute :user
  attribute :request
end

# Set in controller
class ApplicationController < ActionController::Base
  before_action :set_current_attributes
  
  private
  
  def set_current_attributes
    Current.user = current_user
    Current.request = request
  end
end
```
