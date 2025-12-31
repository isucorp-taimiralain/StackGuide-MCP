# Vue.js + Node.js Best Practices

## Vue 3 Composition API

### Use Script Setup
```vue
<!-- ✅ Preferred: script setup -->
<script setup>
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>

<!-- ❌ Avoid: Options API for new code -->
<script>
export default {
  data() {
    return { count: 0 }
  },
  computed: {
    doubled() { return this.count * 2 }
  }
}
</script>
```

### Composable Best Practices
```javascript
// ✅ Good: Focused, reusable composable
export function useCounter(initialValue = 0) {
  const count = ref(initialValue)
  
  const increment = () => count.value++
  const decrement = () => count.value--
  const reset = () => count.value = initialValue
  
  return { count, increment, decrement, reset }
}

// ✅ Good: Async composable with loading state
export function useAsyncData(fetcher, options = {}) {
  const data = ref(null)
  const error = ref(null)
  const isLoading = ref(false)
  
  const execute = async (...args) => {
    isLoading.value = true
    error.value = null
    
    try {
      data.value = await fetcher(...args)
    } catch (e) {
      error.value = e
      if (options.onError) options.onError(e)
    } finally {
      isLoading.value = false
    }
  }
  
  if (options.immediate) execute()
  
  return { data, error, isLoading, execute }
}

// Usage
const { data: users, isLoading, execute } = useAsyncData(
  () => api.get('/users'),
  { immediate: true }
)
```

## Props and Events

### Define Props Properly
```vue
<script setup>
// ✅ Good: Typed props with defaults
const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  items: {
    type: Array,
    default: () => [],
  },
  config: {
    type: Object,
    default: () => ({}),
    validator: (value) => {
      return 'theme' in value && 'size' in value
    },
  },
})

// ✅ With TypeScript
interface Props {
  title: string
  items?: string[]
  config?: { theme: string; size: number }
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  config: () => ({ theme: 'light', size: 16 }),
})
</script>
```

### Emit Events Correctly
```vue
<script setup>
// ✅ Good: Typed emits
const emit = defineEmits({
  // Validate payload
  update: (payload) => {
    return payload && typeof payload.id === 'string'
  },
  // No validation
  close: null,
})

// TypeScript
const emit = defineEmits<{
  update: [payload: { id: string; data: object }]
  close: []
}>()

// Usage
const handleSave = () => {
  emit('update', { id: '123', data: { name: 'Test' } })
}
</script>
```

## State Management with Pinia

### Store Organization
```javascript
// ✅ Good: Setup store syntax
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  // State
  const items = ref([])
  const coupon = ref(null)
  
  // Getters
  const itemCount = computed(() => items.value.length)
  
  const subtotal = computed(() => 
    items.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
  )
  
  const discount = computed(() => 
    coupon.value ? subtotal.value * (coupon.value.percent / 100) : 0
  )
  
  const total = computed(() => subtotal.value - discount.value)
  
  // Actions
  const addItem = (product, quantity = 1) => {
    const existing = items.value.find(i => i.productId === product.id)
    
    if (existing) {
      existing.quantity += quantity
    } else {
      items.value.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
      })
    }
  }
  
  const removeItem = (productId) => {
    items.value = items.value.filter(i => i.productId !== productId)
  }
  
  const applyCoupon = async (code) => {
    const response = await api.get(`/coupons/${code}`)
    coupon.value = response.data
  }
  
  const clear = () => {
    items.value = []
    coupon.value = null
  }
  
  return {
    items,
    coupon,
    itemCount,
    subtotal,
    discount,
    total,
    addItem,
    removeItem,
    applyCoupon,
    clear,
  }
})
```

### Store Subscriptions
```javascript
// Subscribe to state changes
const cartStore = useCartStore()

// Persist to localStorage
cartStore.$subscribe((mutation, state) => {
  localStorage.setItem('cart', JSON.stringify(state.items))
})

// Action subscription
cartStore.$onAction(({ name, args, after, onError }) => {
  const start = Date.now()
  
  after((result) => {
    console.log(`${name} completed in ${Date.now() - start}ms`)
  })
  
  onError((error) => {
    console.error(`${name} failed:`, error)
  })
})
```

## Performance Optimization

### Lazy Loading Components
```javascript
// router/index.js
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
  },
]

// Component level
import { defineAsyncComponent } from 'vue'

const HeavyChart = defineAsyncComponent({
  loader: () => import('@/components/HeavyChart.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorDisplay,
  delay: 200,
  timeout: 3000,
})
```

### Virtual Scrolling
```vue
<script setup>
import { useVirtualList } from '@vueuse/core'

const props = defineProps({
  items: { type: Array, required: true },
})

const { list, containerProps, wrapperProps } = useVirtualList(
  () => props.items,
  { itemHeight: 50 }
)
</script>

<template>
  <div v-bind="containerProps" class="list-container">
    <div v-bind="wrapperProps">
      <div
        v-for="{ data, index } in list"
        :key="index"
        class="list-item"
      >
        {{ data.name }}
      </div>
    </div>
  </div>
</template>
```

### Computed Caching
```vue
<script setup>
import { computed, shallowRef } from 'vue'

// ✅ Good: Heavy computation is cached
const expensiveResult = computed(() => {
  return items.value.filter(/* complex logic */).map(/* transformation */)
})

// ✅ Use shallowRef for large objects
const largeDataset = shallowRef([])

// ✅ Memoize with computed getter
const userMap = computed(() => {
  const map = new Map()
  users.value.forEach(user => map.set(user.id, user))
  return map
})

const getUserById = (id) => userMap.value.get(id)
</script>
```

## Error Handling

### Global Error Handler
```javascript
// main.js
const app = createApp(App)

app.config.errorHandler = (err, vm, info) => {
  console.error('Global error:', err)
  console.error('Component:', vm)
  console.error('Info:', info)
  
  // Report to error tracking service
  errorTracker.captureException(err, { extra: { info } })
}

app.config.warnHandler = (msg, vm, trace) => {
  console.warn('Vue warning:', msg)
}
```

### Error Boundary Component
```vue
<!-- components/ErrorBoundary.vue -->
<script setup>
import { ref, onErrorCaptured } from 'vue'

const error = ref(null)
const errorInfo = ref(null)

onErrorCaptured((err, instance, info) => {
  error.value = err
  errorInfo.value = info
  return false // Prevent propagation
})

const reset = () => {
  error.value = null
  errorInfo.value = null
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <h2>Something went wrong</h2>
    <p>{{ error.message }}</p>
    <button @click="reset">Try again</button>
  </div>
  <slot v-else />
</template>
```

## Testing

### Component Testing
```javascript
// tests/components/UserCard.spec.js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import UserCard from '@/components/UserCard.vue'

describe('UserCard', () => {
  it('renders user name', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: { id: '1', name: 'John Doe', email: 'john@example.com' },
      },
    })
    
    expect(wrapper.text()).toContain('John Doe')
  })
  
  it('emits edit event on button click', async () => {
    const wrapper = mount(UserCard, {
      props: {
        user: { id: '1', name: 'John Doe', email: 'john@example.com' },
      },
    })
    
    await wrapper.find('[data-testid="edit-button"]').trigger('click')
    
    expect(wrapper.emitted('edit')).toBeTruthy()
    expect(wrapper.emitted('edit')[0]).toEqual([{ id: '1' }])
  })
  
  it('uses store correctly', async () => {
    const wrapper = mount(UserCard, {
      global: {
        plugins: [
          createTestingPinia({
            initialState: {
              user: { users: [{ id: '1', name: 'Test' }] },
            },
          }),
        ],
      },
      props: { userId: '1' },
    })
    
    expect(wrapper.text()).toContain('Test')
  })
})
```

### Composable Testing
```javascript
// tests/composables/useCounter.spec.js
import { describe, it, expect } from 'vitest'
import { useCounter } from '@/composables/useCounter'

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { count } = useCounter()
    expect(count.value).toBe(0)
  })
  
  it('initializes with provided value', () => {
    const { count } = useCounter(10)
    expect(count.value).toBe(10)
  })
  
  it('increments count', () => {
    const { count, increment } = useCounter()
    increment()
    expect(count.value).toBe(1)
  })
  
  it('resets to initial value', () => {
    const { count, increment, reset } = useCounter(5)
    increment()
    increment()
    reset()
    expect(count.value).toBe(5)
  })
})
```

## Security Best Practices

### XSS Prevention
```vue
<template>
  <!-- ✅ Safe: Automatically escaped -->
  <p>{{ userInput }}</p>
  
  <!-- ❌ Dangerous: Use with caution -->
  <div v-html="sanitizedHtml" />
</template>

<script setup>
import DOMPurify from 'dompurify'

const props = defineProps({ rawHtml: String })

// Sanitize before using v-html
const sanitizedHtml = computed(() => 
  DOMPurify.sanitize(props.rawHtml)
)
</script>
```

### API Security
```javascript
// services/api.js
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Send cookies
})

// Add CSRF token
api.interceptors.request.use((config) => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})
```

## Environment Configuration

```javascript
// vite.config.js
export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  envPrefix: 'VITE_', // Only expose VITE_ prefixed vars
})

// .env.development
VITE_API_URL=http://localhost:3000/api
VITE_APP_TITLE=My App (Dev)

// .env.production
VITE_API_URL=https://api.myapp.com
VITE_APP_TITLE=My App

// Usage
const apiUrl = import.meta.env.VITE_API_URL
const isDev = import.meta.env.DEV
const isProd = import.meta.env.PROD
```
