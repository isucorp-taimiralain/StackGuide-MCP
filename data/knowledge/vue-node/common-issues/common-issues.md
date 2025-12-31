# Vue.js + Node.js Common Issues and Solutions

## Vue.js Issues

### Reactivity Issues

#### Object Property Not Reactive
```javascript
// ❌ Problem: Adding new property to reactive object
const state = reactive({ name: 'John' })
state.age = 25 // Not reactive in Vue 2, works in Vue 3 but avoid

// ✅ Solution: Define all properties upfront
const state = reactive({ 
  name: 'John',
  age: null,
})

// Or use Vue.set in Vue 2
Vue.set(state, 'age', 25)
```

#### Array Methods Not Triggering Updates
```javascript
// ❌ Problem: Direct index assignment
const items = ref(['a', 'b', 'c'])
items.value[1] = 'x' // May not trigger in some cases

// ✅ Solution: Use array methods
items.value.splice(1, 1, 'x')
// Or reassign entirely
items.value = items.value.map((item, i) => i === 1 ? 'x' : item)
```

#### Losing Reactivity with Destructuring
```javascript
// ❌ Problem: Destructuring loses reactivity
const { count } = useCounter() // count is not reactive

// ✅ Solution: Use toRefs or keep the object
const counter = useCounter()
const { count } = toRefs(counter) // Now count is a ref

// Or access through the object
counter.count // Reactive
```

### Component Issues

#### Props Not Updating
```vue
<script setup>
// ❌ Problem: Mutating prop directly
const props = defineProps(['user'])
props.user.name = 'New Name' // Antipattern!

// ✅ Solution: Emit event to parent
const emit = defineEmits(['update:user'])
const updateName = (name) => {
  emit('update:user', { ...props.user, name })
}

// Or use v-model with modelValue
const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue'])
</script>
```

#### Watch Not Triggering
```javascript
// ❌ Problem: Watching wrong target
const user = ref({ name: 'John' })
watch(user.value, (newVal) => { /* Never called */ })

// ✅ Solution: Watch the ref, use deep option for objects
watch(user, (newVal) => { /* Called on change */ }, { deep: true })

// Or watch specific property
watch(() => user.value.name, (newName) => { /* Called when name changes */ })
```

### Router Issues

#### Navigation Not Working
```javascript
// ❌ Problem: Using router outside setup
export default {
  methods: {
    navigate() {
      this.$router.push('/') // Works in Options API
    }
  }
}

// ✅ Solution in Composition API
import { useRouter } from 'vue-router'

const router = useRouter()
const navigate = () => router.push('/')
```

#### Route Params Not Reactive
```vue
<script setup>
import { useRoute, watch } from 'vue-router'

const route = useRoute()

// ❌ Problem: Not reacting to param changes
const userId = route.params.id // Static value

// ✅ Solution: Watch route changes
watch(
  () => route.params.id,
  (newId) => fetchUser(newId),
  { immediate: true }
)

// Or use computed
const userId = computed(() => route.params.id)
</script>
```

### Store Issues

#### Store Not Available
```javascript
// ❌ Problem: Using store before Pinia is installed
import { useUserStore } from '@/stores/user'
const userStore = useUserStore() // Error!

// ✅ Solution: Use inside setup or after app mount
// main.js
const app = createApp(App)
app.use(pinia)
app.mount('#app')

// Component - use inside setup
<script setup>
import { useUserStore } from '@/stores/user'
const userStore = useUserStore() // Works
</script>
```

#### State Reset Issues
```javascript
// ❌ Problem: Can't reset store state
const store = useUserStore()
store.$reset() // Error if using Setup Stores

// ✅ Solution: Implement $reset manually in Setup Stores
export const useUserStore = defineStore('user', () => {
  const initialState = { name: '', email: '' }
  const state = reactive({ ...initialState })
  
  const $reset = () => {
    Object.assign(state, initialState)
  }
  
  return { ...toRefs(state), $reset }
})
```

## Node.js Issues

### Async/Await Issues

#### Unhandled Promise Rejection
```javascript
// ❌ Problem: Async error not caught
app.get('/users', async (req, res) => {
  const users = await User.find() // If throws, crashes server
  res.json(users)
})

// ✅ Solution: Use error wrapper
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

app.get('/users', catchAsync(async (req, res) => {
  const users = await User.find()
  res.json(users)
}))
```

#### Parallel vs Sequential
```javascript
// ❌ Problem: Sequential when parallel is possible
const user = await getUser(id)
const posts = await getPosts(id)
const comments = await getComments(id)
// Takes sum of all request times

// ✅ Solution: Run in parallel
const [user, posts, comments] = await Promise.all([
  getUser(id),
  getPosts(id),
  getComments(id),
])
// Takes time of longest request
```

### Database Issues

#### Connection Not Ready
```javascript
// ❌ Problem: Queries before connection
const mongoose = require('mongoose')
mongoose.connect(uri) // Async!

app.get('/users', async (req, res) => {
  const users = await User.find() // May fail
  res.json(users)
})

// ✅ Solution: Wait for connection
const startServer = async () => {
  await mongoose.connect(uri)
  console.log('DB connected')
  
  app.listen(3000, () => {
    console.log('Server running')
  })
}

startServer()
```

#### N+1 Query Problem
```javascript
// ❌ Problem: N+1 queries
const posts = await Post.find()
for (const post of posts) {
  post.author = await User.findById(post.authorId)
}

// ✅ Solution: Use populate or batch query
const posts = await Post.find().populate('author')

// Or batch fetch
const posts = await Post.find().lean()
const authorIds = [...new Set(posts.map(p => p.authorId))]
const authors = await User.find({ _id: { $in: authorIds } })
const authorMap = new Map(authors.map(a => [a._id.toString(), a]))
posts.forEach(p => p.author = authorMap.get(p.authorId.toString()))
```

### Memory Issues

#### Event Listener Leak
```javascript
// ❌ Problem: Listeners accumulating
app.get('/events', (req, res) => {
  eventEmitter.on('update', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  })
  // Never removed!
})

// ✅ Solution: Clean up on close
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  
  const handler = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  
  eventEmitter.on('update', handler)
  
  req.on('close', () => {
    eventEmitter.off('update', handler)
  })
})
```

#### Large Data in Memory
```javascript
// ❌ Problem: Loading all data to memory
const allData = await Model.find() // Millions of records
res.json(allData) // Out of memory!

// ✅ Solution: Stream or paginate
// Streaming
res.setHeader('Content-Type', 'application/json')
res.write('[')

const cursor = Model.find().cursor()
let first = true

for await (const doc of cursor) {
  if (!first) res.write(',')
  res.write(JSON.stringify(doc))
  first = false
}

res.write(']')
res.end()

// Pagination
const page = parseInt(req.query.page) || 1
const limit = parseInt(req.query.limit) || 20
const skip = (page - 1) * limit

const [data, total] = await Promise.all([
  Model.find().skip(skip).limit(limit),
  Model.countDocuments(),
])

res.json({ data, total, page, pages: Math.ceil(total / limit) })
```

### API Issues

#### CORS Errors
```javascript
// ❌ Problem: CORS not configured properly
// Frontend gets: "Access-Control-Allow-Origin" header error

// ✅ Solution: Configure CORS before routes
const cors = require('cors')

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true, // If using cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}))

// Handle preflight
app.options('*', cors())
```

#### Headers Already Sent
```javascript
// ❌ Problem: Multiple responses
app.get('/user/:id', async (req, res) => {
  if (!req.params.id) {
    res.status(400).json({ error: 'Missing ID' })
  }
  // Continues execution!
  const user = await User.findById(req.params.id)
  res.json(user) // Error: headers already sent
})

// ✅ Solution: Return after response
app.get('/user/:id', async (req, res) => {
  if (!req.params.id) {
    return res.status(400).json({ error: 'Missing ID' })
  }
  const user = await User.findById(req.params.id)
  return res.json(user)
})
```

### Authentication Issues

#### Token Expiration
```javascript
// ❌ Problem: No token refresh mechanism
// User gets logged out unexpectedly

// ✅ Solution: Implement refresh token flow
// See security guidelines for full implementation

// Axios interceptor for auto-refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      await authStore.refreshToken()
      return api(error.config)
    }
    throw error
  }
)
```

### Environment Issues

#### Missing Environment Variables
```javascript
// ❌ Problem: App crashes with undefined config
const apiUrl = process.env.API_URL // undefined
fetch(`${apiUrl}/users`) // "undefined/users"

// ✅ Solution: Validate env vars at startup
const required = ['API_URL', 'JWT_SECRET', 'DATABASE_URL']
const missing = required.filter(key => !process.env[key])

if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(', ')}`)
  process.exit(1)
}
```

### Testing Issues

#### Mocking Issues
```javascript
// ❌ Problem: Module not mocked properly
jest.mock('@/services/api')
import api from '@/services/api'
api.get.mockResolvedValue({ data: [] }) // api.get is undefined

// ✅ Solution: Mock implementation
jest.mock('@/services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
}))

// Or use jest.spyOn
import * as api from '@/services/api'
jest.spyOn(api, 'get').mockResolvedValue({ data: [] })
```

#### Async Test Timeout
```javascript
// ❌ Problem: Test times out
it('should complete task', async () => {
  const result = await longOperation() // Takes 10s
  expect(result).toBeDefined()
})

// ✅ Solution: Increase timeout
it('should complete task', async () => {
  const result = await longOperation()
  expect(result).toBeDefined()
}, 15000) // 15 second timeout

// Or configure globally
jest.setTimeout(15000)
```

### Build/Deploy Issues

#### Environment Not Building
```javascript
// ❌ Problem: Vite env vars not available
console.log(process.env.API_URL) // undefined in browser

// ✅ Solution: Use VITE_ prefix and import.meta.env
// .env
VITE_API_URL=https://api.example.com

// Usage
console.log(import.meta.env.VITE_API_URL)
```

#### Production Build Errors
```javascript
// ❌ Problem: Works in dev, fails in prod
// Often caused by missing type checks or undefined access

// ✅ Solution: Enable strict mode and check for undefined
// vite.config.js
export default defineConfig({
  build: {
    sourcemap: true, // For debugging
  },
})

// Always check for undefined
const value = obj?.nested?.property ?? defaultValue
```

### WebSocket Issues

#### Connection Not Established
```javascript
// ❌ Problem: Socket doesn't connect
const socket = io('http://localhost:3000')
// No connection, no errors

// ✅ Solution: Check CORS and error events
const socket = io('http://localhost:3000', {
  withCredentials: true,
})

socket.on('connect_error', (error) => {
  console.error('Connection error:', error)
})

// Server-side: Configure CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
```

### Performance Issues

#### Slow Initial Load
```javascript
// ❌ Problem: Large bundle, slow initial load

// ✅ Solution: Code splitting and lazy loading
// Routes
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
  },
]

// Components
const HeavyComponent = defineAsyncComponent(() =>
  import('@/components/HeavyComponent.vue')
)
```

#### Re-renders
```vue
<script setup>
// ❌ Problem: Expensive computation on every render
const filteredItems = items.value.filter(/* expensive */)

// ✅ Solution: Use computed
const filteredItems = computed(() =>
  items.value.filter(/* expensive */)
)
</script>
```
