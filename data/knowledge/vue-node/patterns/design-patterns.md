# Vue.js + Node.js Design Patterns

## Vue.js Patterns

### Renderless Components
```vue
<!-- components/RenderlessDataFetcher.vue -->
<script>
export default {
  props: {
    url: { type: String, required: true },
    immediate: { type: Boolean, default: true },
  },
  
  data: () => ({
    data: null,
    error: null,
    isLoading: false,
  }),
  
  methods: {
    async fetch() {
      this.isLoading = true
      this.error = null
      
      try {
        const response = await fetch(this.url)
        this.data = await response.json()
      } catch (e) {
        this.error = e
      } finally {
        this.isLoading = false
      }
    },
  },
  
  mounted() {
    if (this.immediate) this.fetch()
  },
  
  render() {
    return this.$slots.default?.({
      data: this.data,
      error: this.error,
      isLoading: this.isLoading,
      fetch: this.fetch,
    })
  },
}
</script>

<!-- Usage -->
<template>
  <RenderlessDataFetcher url="/api/users" v-slot="{ data, isLoading, error }">
    <div v-if="isLoading">Loading...</div>
    <div v-else-if="error">{{ error.message }}</div>
    <ul v-else>
      <li v-for="user in data" :key="user.id">{{ user.name }}</li>
    </ul>
  </RenderlessDataFetcher>
</template>
```

### Compound Components
```vue
<!-- components/Tabs/Tabs.vue -->
<script setup>
import { provide, ref } from 'vue'

const activeTab = ref(0)

provide('tabs', {
  activeTab,
  setActiveTab: (index) => activeTab.value = index,
})
</script>

<template>
  <div class="tabs">
    <slot />
  </div>
</template>

<!-- components/Tabs/TabList.vue -->
<script setup>
import { inject } from 'vue'
const { activeTab, setActiveTab } = inject('tabs')
</script>

<template>
  <div class="tab-list" role="tablist">
    <slot :activeTab="activeTab" :setActiveTab="setActiveTab" />
  </div>
</template>

<!-- components/Tabs/Tab.vue -->
<script setup>
import { inject } from 'vue'

const props = defineProps({
  index: { type: Number, required: true },
})

const { activeTab, setActiveTab } = inject('tabs')
</script>

<template>
  <button
    :class="['tab', { active: activeTab === index }]"
    @click="setActiveTab(index)"
  >
    <slot />
  </button>
</template>

<!-- components/Tabs/TabPanel.vue -->
<script setup>
import { inject } from 'vue'

const props = defineProps({
  index: { type: Number, required: true },
})

const { activeTab } = inject('tabs')
</script>

<template>
  <div v-if="activeTab === index" class="tab-panel">
    <slot />
  </div>
</template>

<!-- Usage -->
<template>
  <Tabs>
    <TabList v-slot="{ setActiveTab, activeTab }">
      <Tab :index="0">Users</Tab>
      <Tab :index="1">Settings</Tab>
    </TabList>
    
    <TabPanel :index="0">
      <UserList />
    </TabPanel>
    <TabPanel :index="1">
      <SettingsForm />
    </TabPanel>
  </Tabs>
</template>
```

### Provider Pattern
```vue
<!-- providers/ThemeProvider.vue -->
<script setup>
import { provide, reactive, readonly } from 'vue'

const state = reactive({
  theme: 'light',
  colors: {
    primary: '#3b82f6',
    secondary: '#64748b',
  },
})

const setTheme = (theme) => {
  state.theme = theme
}

const setColor = (key, value) => {
  state.colors[key] = value
}

provide('theme', {
  state: readonly(state),
  setTheme,
  setColor,
})
</script>

<template>
  <div :class="`theme-${state.theme}`">
    <slot />
  </div>
</template>

<!-- composables/useTheme.js -->
import { inject } from 'vue'

export function useTheme() {
  const theme = inject('theme')
  
  if (!theme) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  
  return theme
}

<!-- Usage -->
<script setup>
import { useTheme } from '@/composables/useTheme'

const { state, setTheme } = useTheme()
</script>
```

### State Machine Pattern
```javascript
// composables/useStateMachine.js
import { ref, computed } from 'vue'

export function useStateMachine(config) {
  const currentState = ref(config.initial)
  
  const can = (event) => {
    const state = config.states[currentState.value]
    return state?.on?.[event] !== undefined
  }
  
  const send = (event, payload) => {
    const state = config.states[currentState.value]
    const transition = state?.on?.[event]
    
    if (!transition) {
      console.warn(`No transition for ${event} from ${currentState.value}`)
      return
    }
    
    // Run exit action
    state.onExit?.()
    
    // Update state
    currentState.value = transition.target
    
    // Run transition action
    transition.action?.(payload)
    
    // Run entry action
    config.states[currentState.value].onEntry?.()
  }
  
  const matches = (state) => currentState.value === state
  
  return { currentState, can, send, matches }
}

// Usage: Form state machine
const formMachine = useStateMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        SUBMIT: { target: 'submitting' },
        EDIT: { target: 'editing' },
      },
    },
    editing: {
      on: {
        CANCEL: { target: 'idle' },
        SUBMIT: { target: 'submitting' },
      },
    },
    submitting: {
      onEntry: () => submitForm(),
      on: {
        SUCCESS: { target: 'success' },
        ERROR: { target: 'error' },
      },
    },
    success: {
      on: {
        RESET: { target: 'idle' },
      },
    },
    error: {
      on: {
        RETRY: { target: 'submitting' },
        CANCEL: { target: 'idle' },
      },
    },
  },
})
```

## Node.js Patterns

### Repository Pattern
```javascript
// repositories/BaseRepository.js
class BaseRepository {
  constructor(model) {
    this.model = model
  }

  async findAll(filter = {}, options = {}) {
    const { sort, limit, skip, populate } = options
    let query = this.model.find(filter)
    
    if (sort) query = query.sort(sort)
    if (limit) query = query.limit(limit)
    if (skip) query = query.skip(skip)
    if (populate) query = query.populate(populate)
    
    return query.lean()
  }

  async findById(id, options = {}) {
    let query = this.model.findById(id)
    if (options.populate) query = query.populate(options.populate)
    return query.lean()
  }

  async create(data) {
    return this.model.create(data)
  }

  async updateById(id, data) {
    return this.model.findByIdAndUpdate(id, data, { new: true }).lean()
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id)
  }

  async exists(filter) {
    return this.model.exists(filter)
  }

  async count(filter = {}) {
    return this.model.countDocuments(filter)
  }
}

// repositories/UserRepository.js
class UserRepository extends BaseRepository {
  constructor() {
    super(User)
  }

  async findByEmail(email) {
    return this.model.findOne({ email }).lean()
  }

  async findByEmailWithPassword(email) {
    return this.model.findOne({ email }).select('+password')
  }

  async updatePassword(id, hashedPassword) {
    return this.model.findByIdAndUpdate(id, { password: hashedPassword })
  }
}
```

### Service Layer Pattern
```javascript
// services/UserService.js
class UserService {
  constructor(userRepository, emailService, eventBus) {
    this.userRepository = userRepository
    this.emailService = emailService
    this.eventBus = eventBus
  }

  async create(data) {
    // Business validation
    if (await this.userRepository.findByEmail(data.email)) {
      throw new ApiError(400, 'Email already registered')
    }

    // Create user
    const user = await this.userRepository.create(data)

    // Side effects
    await this.eventBus.emit('user.created', user)

    return this.sanitize(user)
  }

  async update(id, data, requesterId) {
    const user = await this.userRepository.findById(id)
    
    if (!user) {
      throw new ApiError(404, 'User not found')
    }

    // Authorization
    if (user.id !== requesterId) {
      throw new ApiError(403, 'Not authorized')
    }

    const updated = await this.userRepository.updateById(id, data)
    await this.eventBus.emit('user.updated', updated)

    return this.sanitize(updated)
  }

  sanitize(user) {
    const { password, ...safe } = user
    return safe
  }
}
```

### Factory Pattern
```javascript
// factories/controllerFactory.js
const createCrudController = (service, options = {}) => {
  const { 
    createValidator,
    updateValidator,
    idParam = 'id',
  } = options

  return {
    getAll: catchAsync(async (req, res) => {
      const { page = 1, limit = 10, ...filters } = req.query
      const result = await service.findAll(filters, { page, limit })
      res.json({ success: true, data: result })
    }),

    getOne: catchAsync(async (req, res) => {
      const item = await service.findById(req.params[idParam])
      res.json({ success: true, data: item })
    }),

    create: [
      createValidator,
      catchAsync(async (req, res) => {
        const item = await service.create(req.body, req.user?.id)
        res.status(201).json({ success: true, data: item })
      }),
    ],

    update: [
      updateValidator,
      catchAsync(async (req, res) => {
        const item = await service.update(
          req.params[idParam],
          req.body,
          req.user?.id
        )
        res.json({ success: true, data: item })
      }),
    ],

    delete: catchAsync(async (req, res) => {
      await service.delete(req.params[idParam], req.user?.id)
      res.status(204).send()
    }),
  }
}

// Usage
const userController = createCrudController(userService, {
  createValidator: validate(createUserSchema),
  updateValidator: validate(updateUserSchema),
})
```

### Strategy Pattern
```javascript
// strategies/PaymentStrategy.js
class PaymentStrategy {
  async charge(amount, paymentDetails) {
    throw new Error('Not implemented')
  }

  async refund(transactionId, amount) {
    throw new Error('Not implemented')
  }
}

class StripeStrategy extends PaymentStrategy {
  constructor(stripeClient) {
    super()
    this.stripe = stripeClient
  }

  async charge(amount, paymentDetails) {
    const charge = await this.stripe.charges.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      source: paymentDetails.token,
    })
    return { transactionId: charge.id, status: charge.status }
  }
}

class PayPalStrategy extends PaymentStrategy {
  async charge(amount, paymentDetails) {
    // PayPal implementation
  }
}

// Payment service using strategy
class PaymentService {
  constructor() {
    this.strategies = {
      stripe: new StripeStrategy(stripeClient),
      paypal: new PayPalStrategy(paypalClient),
    }
  }

  async processPayment(provider, amount, details) {
    const strategy = this.strategies[provider]
    if (!strategy) {
      throw new ApiError(400, 'Invalid payment provider')
    }
    return strategy.charge(amount, details)
  }
}
```

### Observer Pattern
```javascript
// events/EventBus.js
class EventBus {
  constructor() {
    this.handlers = new Map()
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    this.handlers.get(event).push(handler)
    
    return () => this.off(event, handler)
  }

  off(event, handler) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) handlers.splice(index, 1)
    }
  }

  async emit(event, data) {
    const handlers = this.handlers.get(event) || []
    await Promise.all(handlers.map(h => h(data)))
  }
}

// events/handlers.js
const eventBus = require('./EventBus')

// Register handlers
eventBus.on('user.created', async (user) => {
  await emailService.sendWelcome(user.email)
})

eventBus.on('user.created', async (user) => {
  await analyticsService.track('signup', { userId: user.id })
})

eventBus.on('order.placed', async (order) => {
  await inventoryService.reserve(order.items)
  await emailService.sendOrderConfirmation(order)
})
```

### Decorator Pattern
```javascript
// decorators/withLogging.js
const withLogging = (fn, name) => {
  return async (...args) => {
    console.log(`[${name}] Started`)
    const start = Date.now()
    
    try {
      const result = await fn(...args)
      console.log(`[${name}] Completed in ${Date.now() - start}ms`)
      return result
    } catch (error) {
      console.error(`[${name}] Failed:`, error.message)
      throw error
    }
  }
}

// decorators/withCache.js
const withCache = (fn, keyFn, ttl = 300) => {
  return async (...args) => {
    const key = keyFn(...args)
    const cached = await cache.get(key)
    
    if (cached !== null) {
      return cached
    }
    
    const result = await fn(...args)
    await cache.set(key, result, ttl)
    return result
  }
}

// decorators/withRetry.js
const withRetry = (fn, maxAttempts = 3, delay = 1000) => {
  return async (...args) => {
    let lastError
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(...args)
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, delay * attempt))
        }
      }
    }
    
    throw lastError
  }
}

// Usage
class ProductService {
  constructor() {
    this.getProduct = withCache(
      withLogging(this._getProduct.bind(this), 'getProduct'),
      (id) => `product:${id}`,
      600
    )
  }

  async _getProduct(id) {
    return productRepository.findById(id)
  }
}
```

### Command Pattern
```javascript
// commands/Command.js
class Command {
  async execute() {
    throw new Error('Not implemented')
  }

  async undo() {
    throw new Error('Not implemented')
  }
}

class CreateOrderCommand extends Command {
  constructor(orderData, orderService, inventoryService) {
    super()
    this.orderData = orderData
    this.orderService = orderService
    this.inventoryService = inventoryService
    this.order = null
  }

  async execute() {
    // Reserve inventory
    await this.inventoryService.reserve(this.orderData.items)
    
    // Create order
    this.order = await this.orderService.create(this.orderData)
    
    return this.order
  }

  async undo() {
    if (this.order) {
      // Release inventory
      await this.inventoryService.release(this.order.items)
      
      // Cancel order
      await this.orderService.cancel(this.order.id)
    }
  }
}

// Command invoker with transaction support
class CommandInvoker {
  constructor() {
    this.history = []
  }

  async execute(command) {
    try {
      const result = await command.execute()
      this.history.push(command)
      return result
    } catch (error) {
      // Rollback previous commands
      await this.rollback()
      throw error
    }
  }

  async rollback() {
    while (this.history.length > 0) {
      const command = this.history.pop()
      await command.undo()
    }
  }
}
```

### Middleware Pattern
```javascript
// middleware/compose.js
const compose = (...middlewares) => {
  return (req, res, next) => {
    const dispatch = (i) => {
      if (i === middlewares.length) return next()
      
      const middleware = middlewares[i]
      
      try {
        middleware(req, res, () => dispatch(i + 1))
      } catch (error) {
        next(error)
      }
    }
    
    dispatch(0)
  }
}

// Usage
const apiMiddleware = compose(
  helmet(),
  cors(),
  express.json(),
  authenticate,
  rateLimit()
)

app.use('/api', apiMiddleware)
```
