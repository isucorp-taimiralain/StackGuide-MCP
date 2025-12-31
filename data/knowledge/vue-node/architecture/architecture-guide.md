# Vue.js + Node.js Architecture Guide

## Frontend Architecture

### 1. Component-Based Architecture

```
src/
├── components/
│   ├── common/           # Reusable UI components
│   │   ├── BaseButton.vue
│   │   ├── BaseInput.vue
│   │   ├── BaseModal.vue
│   │   └── BaseTable.vue
│   ├── layout/           # Layout components
│   │   ├── TheHeader.vue
│   │   ├── TheSidebar.vue
│   │   └── TheFooter.vue
│   └── features/         # Feature-specific components
│       ├── users/
│       │   ├── UserList.vue
│       │   ├── UserCard.vue
│       │   └── UserForm.vue
│       └── products/
│           ├── ProductGrid.vue
│           └── ProductCard.vue
├── composables/          # Shared logic
├── pages/                # Route pages
├── stores/               # State management
├── services/             # API services
└── utils/                # Utilities
```

### Component Hierarchy
```vue
<!-- App.vue -->
<template>
  <RouterView v-slot="{ Component }">
    <Suspense>
      <component :is="Component" />
      <template #fallback>
        <LoadingSpinner />
      </template>
    </Suspense>
  </RouterView>
</template>

<!-- layouts/DefaultLayout.vue -->
<template>
  <div class="layout">
    <TheHeader />
    <main class="main-content">
      <TheSidebar v-if="showSidebar" />
      <div class="page-content">
        <slot />
      </div>
    </main>
    <TheFooter />
  </div>
</template>

<!-- pages/UsersPage.vue -->
<template>
  <div class="users-page">
    <PageHeader title="Users" />
    <UserFilters v-model="filters" />
    <UserList :users="filteredUsers" />
    <Pagination v-model:page="page" :total="total" />
  </div>
</template>
```

### 2. State Architecture with Pinia

```
stores/
├── modules/
│   ├── auth.js           # Authentication state
│   ├── user.js           # User management
│   ├── cart.js           # Shopping cart
│   └── notifications.js  # UI notifications
├── plugins/
│   ├── persistence.js    # LocalStorage sync
│   └── logger.js         # Action logging
└── index.js              # Store initialization
```

```javascript
// stores/index.js
import { createPinia } from 'pinia'
import { persistencePlugin } from './plugins/persistence'
import { loggerPlugin } from './plugins/logger'

export const pinia = createPinia()

pinia.use(persistencePlugin)
pinia.use(loggerPlugin)

export default pinia

// stores/plugins/persistence.js
export function persistencePlugin({ store }) {
  // Restore state from localStorage
  const savedState = localStorage.getItem(`store-${store.$id}`)
  if (savedState) {
    store.$patch(JSON.parse(savedState))
  }
  
  // Subscribe to changes
  store.$subscribe((mutation, state) => {
    localStorage.setItem(`store-${store.$id}`, JSON.stringify(state))
  })
}

// stores/modules/auth.js
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const isAuthenticated = computed(() => !!token.value)
  
  // Cross-store communication
  const userStore = useUserStore()
  
  const login = async (credentials) => {
    const response = await authService.login(credentials)
    token.value = response.token
    user.value = response.user
    
    // Notify other stores
    userStore.setCurrentUser(response.user)
  }
  
  return { user, token, isAuthenticated, login }
})
```

### 3. Composables Architecture

```javascript
// composables/useApi.js
// Base composable for API calls
export function useApi() {
  const data = ref(null)
  const error = ref(null)
  const isLoading = ref(false)

  const execute = async (apiCall) => {
    isLoading.value = true
    error.value = null
    
    try {
      data.value = await apiCall()
    } catch (e) {
      error.value = e
      throw e
    } finally {
      isLoading.value = false
    }
    
    return data.value
  }

  return { data, error, isLoading, execute }
}

// composables/useCrud.js
// CRUD operations composable
export function useCrud(service) {
  const items = ref([])
  const currentItem = ref(null)
  const { isLoading, error, execute } = useApi()
  
  const fetchAll = async (params) => {
    items.value = await execute(() => service.getAll(params))
  }
  
  const fetchOne = async (id) => {
    currentItem.value = await execute(() => service.getById(id))
  }
  
  const create = async (data) => {
    const newItem = await execute(() => service.create(data))
    items.value.push(newItem)
    return newItem
  }
  
  const update = async (id, data) => {
    const updated = await execute(() => service.update(id, data))
    const index = items.value.findIndex(i => i.id === id)
    if (index !== -1) items.value[index] = updated
    return updated
  }
  
  const remove = async (id) => {
    await execute(() => service.delete(id))
    items.value = items.value.filter(i => i.id !== id)
  }
  
  return {
    items,
    currentItem,
    isLoading,
    error,
    fetchAll,
    fetchOne,
    create,
    update,
    remove,
  }
}

// Usage in component
const { items: users, isLoading, fetchAll, create } = useCrud(userService)
onMounted(() => fetchAll())
```

## Backend Architecture

### 1. Layered Architecture

```
server/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── index.js
│   │   │   ├── auth.routes.js
│   │   │   └── users.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   └── users.controller.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── validate.js
│   │   │   └── error.js
│   │   └── validators/
│   │       ├── auth.validator.js
│   │       └── users.validator.js
│   ├── services/
│   │   ├── auth.service.js
│   │   └── users.service.js
│   ├── repositories/
│   │   ├── base.repository.js
│   │   └── users.repository.js
│   ├── models/
│   │   ├── index.js
│   │   └── user.model.js
│   ├── config/
│   │   ├── index.js
│   │   └── database.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── ApiError.js
│   ├── app.js
│   └── server.js
└── tests/
```

### Layer Separation
```javascript
// api/controllers/users.controller.js
// Only handles HTTP concerns
class UsersController {
  constructor(usersService) {
    this.usersService = usersService
  }
  
  getAll = catchAsync(async (req, res) => {
    const { page, limit, ...filters } = req.query
    const result = await this.usersService.findAll(filters, { page, limit })
    res.json({ success: true, data: result })
  })
  
  create = catchAsync(async (req, res) => {
    const user = await this.usersService.create(req.body)
    res.status(201).json({ success: true, data: user })
  })
}

// services/users.service.js
// Business logic layer
class UsersService {
  constructor(usersRepository, emailService) {
    this.usersRepository = usersRepository
    this.emailService = emailService
  }
  
  async create(data) {
    // Business validation
    if (await this.usersRepository.existsByEmail(data.email)) {
      throw new ApiError(400, 'Email already exists')
    }
    
    const user = await this.usersRepository.create(data)
    
    // Side effects
    await this.emailService.sendWelcome(user.email)
    
    return user
  }
}

// repositories/users.repository.js
// Data access layer
class UsersRepository {
  constructor(model) {
    this.model = model
  }
  
  async create(data) {
    return this.model.create(data)
  }
  
  async existsByEmail(email) {
    return this.model.exists({ email })
  }
}
```

### 2. Dependency Injection

```javascript
// di/container.js
const awilix = require('awilix')

const container = awilix.createContainer()

container.register({
  // Config
  config: awilix.asValue(require('../config')),
  
  // Models
  userModel: awilix.asValue(require('../models/user.model')),
  
  // Repositories
  usersRepository: awilix.asClass(UsersRepository).singleton(),
  
  // Services
  emailService: awilix.asClass(EmailService).singleton(),
  usersService: awilix.asClass(UsersService).singleton(),
  authService: awilix.asClass(AuthService).singleton(),
  
  // Controllers
  usersController: awilix.asClass(UsersController).scoped(),
  authController: awilix.asClass(AuthController).scoped(),
})

module.exports = container

// Usage in routes
const container = require('../di/container')

router.get('/users', (req, res, next) => {
  const controller = container.resolve('usersController')
  return controller.getAll(req, res, next)
})
```

### 3. Event-Driven Communication

```javascript
// events/eventBus.js
const EventEmitter = require('events')

class EventBus extends EventEmitter {
  async emit(event, data) {
    super.emit(event, data)
  }
}

module.exports = new EventBus()

// events/handlers/user.handlers.js
const eventBus = require('../eventBus')
const emailService = require('../../services/email.service')
const analyticsService = require('../../services/analytics.service')

eventBus.on('user.created', async (user) => {
  await emailService.sendWelcomeEmail(user.email)
})

eventBus.on('user.created', async (user) => {
  await analyticsService.trackEvent('user_signup', { userId: user.id })
})

eventBus.on('order.placed', async (order) => {
  await emailService.sendOrderConfirmation(order)
  await inventoryService.updateStock(order.items)
})

// Usage in service
class UsersService {
  async create(data) {
    const user = await this.repository.create(data)
    await eventBus.emit('user.created', user)
    return user
  }
}
```

## Full-Stack Communication

### API Contract
```javascript
// shared/types.js (shared between frontend and backend)
export const UserSchema = {
  id: 'string',
  email: 'string',
  name: 'string',
  role: 'admin | user',
  createdAt: 'string (ISO date)',
}

export const ApiResponse = {
  success: 'boolean',
  data: 'T | null',
  error: 'string | null',
  meta: '{ page, limit, total } | null',
}
```

### Real-time Communication with Socket.io
```javascript
// server/src/socket/index.js
const { Server } = require('socket.io')

const setupSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
  })
  
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    try {
      const user = verifyToken(token)
      socket.user = user
      next()
    } catch {
      next(new Error('Authentication error'))
    }
  })
  
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id}`)
    
    // Join user's room
    socket.join(`user:${socket.user.id}`)
    
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.id}`)
    })
  })
  
  return io
}

// Emit events from services
const emitToUser = (userId, event, data) => {
  io.to(`user:${userId}`).emit(event, data)
}

// client/src/composables/useSocket.js
import { io } from 'socket.io-client'
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function useSocket() {
  const socket = ref(null)
  const isConnected = ref(false)
  
  const connect = () => {
    const authStore = useAuthStore()
    
    socket.value = io(import.meta.env.VITE_WS_URL, {
      auth: { token: authStore.token },
    })
    
    socket.value.on('connect', () => {
      isConnected.value = true
    })
    
    socket.value.on('disconnect', () => {
      isConnected.value = false
    })
  }
  
  const on = (event, handler) => {
    socket.value?.on(event, handler)
  }
  
  const emit = (event, data) => {
    socket.value?.emit(event, data)
  }
  
  onMounted(connect)
  onUnmounted(() => socket.value?.disconnect())
  
  return { socket, isConnected, on, emit }
}
```

## Deployment Architecture

### Docker Configuration
```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: ./client
    ports:
      - "80:80"
    depends_on:
      - api
    environment:
      - VITE_API_URL=http://api:3000
  
  api:
    build: ./server
    ports:
      - "3000:3000"
    depends_on:
      - mongodb
      - redis
    environment:
      - NODE_ENV=production
      - MONGODB_URL=mongodb://mongodb:27017/app
      - REDIS_URL=redis://redis:6379
  
  mongodb:
    image: mongo:6
    volumes:
      - mongodb_data:/data/db
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  mongodb_data:
  redis_data:
```

```dockerfile
# client/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80

# server/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```
