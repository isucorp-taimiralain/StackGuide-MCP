# Vue.js + Node.js Coding Standards

## Vue 3 Project Structure

### Recommended Directory Layout
```
src/
├── assets/               # Static assets
│   ├── images/
│   └── styles/
├── components/           # Reusable components
│   ├── common/           # Generic components
│   │   ├── BaseButton.vue
│   │   └── BaseInput.vue
│   └── features/         # Feature-specific
│       └── UserCard.vue
├── composables/          # Composition API hooks
│   ├── useAuth.js
│   └── useFetch.js
├── layouts/              # Layout components
│   ├── DefaultLayout.vue
│   └── AuthLayout.vue
├── pages/                # Route pages
│   ├── HomePage.vue
│   └── UserPage.vue
├── router/               # Vue Router
│   └── index.js
├── stores/               # Pinia stores
│   ├── auth.js
│   └── user.js
├── services/             # API services
│   ├── api.js
│   └── auth.service.js
├── utils/                # Utilities
│   └── helpers.js
├── App.vue
└── main.js
```

## Component Standards

### Single File Component (SFC)
```vue
<!-- components/UserProfile.vue -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import BaseButton from '@/components/common/BaseButton.vue'

// Props with validation
const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
  showDetails: {
    type: Boolean,
    default: false,
  },
})

// Emits with validation
const emit = defineEmits({
  update: (payload) => typeof payload === 'object',
  delete: null,
})

// Reactive state
const isLoading = ref(false)
const user = ref(null)

// Store
const userStore = useUserStore()

// Computed
const fullName = computed(() => 
  user.value ? `${user.value.firstName} ${user.value.lastName}` : ''
)

// Methods
const loadUser = async () => {
  isLoading.value = true
  try {
    user.value = await userStore.fetchUser(props.userId)
  } finally {
    isLoading.value = false
  }
}

const handleUpdate = (data) => {
  emit('update', data)
}

// Lifecycle
onMounted(() => {
  loadUser()
})

// Expose to parent (if needed)
defineExpose({
  refresh: loadUser,
})
</script>

<template>
  <div class="user-profile">
    <div v-if="isLoading" class="loading">Loading...</div>
    
    <template v-else-if="user">
      <h2>{{ fullName }}</h2>
      <p>{{ user.email }}</p>
      
      <div v-if="showDetails" class="details">
        <p>Role: {{ user.role }}</p>
        <p>Joined: {{ user.createdAt }}</p>
      </div>
      
      <BaseButton @click="handleUpdate(user)">
        Edit Profile
      </BaseButton>
    </template>
  </div>
</template>

<style scoped>
.user-profile {
  padding: 1rem;
  border-radius: 8px;
  background: var(--bg-secondary);
}

.loading {
  text-align: center;
  color: var(--text-muted);
}

.details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}
</style>
```

### Base Components
```vue
<!-- components/common/BaseButton.vue -->
<script setup>
const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value),
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['click'])

const handleClick = (event) => {
  if (!props.loading && !props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    :class="['btn', `btn--${variant}`, `btn--${size}`]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="spinner" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Variants */
.btn--primary {
  background: var(--primary);
  color: white;
}

.btn--secondary {
  background: var(--secondary);
  color: var(--text);
}

.btn--danger {
  background: var(--danger);
  color: white;
}

/* Sizes */
.btn--small {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}

.btn--medium {
  padding: 0.5rem 1rem;
  font-size: 1rem;
}

.btn--large {
  padding: 0.75rem 1.5rem;
  font-size: 1.125rem;
}
</style>
```

## Composables

### Reusable Composition Functions
```javascript
// composables/useFetch.js
import { ref, watchEffect, toValue } from 'vue'

export function useFetch(url, options = {}) {
  const data = ref(null)
  const error = ref(null)
  const isLoading = ref(false)

  const execute = async () => {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch(toValue(url), options)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      data.value = await response.json()
    } catch (e) {
      error.value = e
    } finally {
      isLoading.value = false
    }
  }

  // Auto-fetch if immediate option
  if (options.immediate !== false) {
    watchEffect(() => {
      execute()
    })
  }

  return {
    data,
    error,
    isLoading,
    execute,
  }
}

// composables/useAuth.js
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const router = useRouter()
  const authStore = useAuthStore()
  
  const isLoading = ref(false)
  const error = ref(null)

  const isAuthenticated = computed(() => authStore.isAuthenticated)
  const user = computed(() => authStore.user)

  const login = async (credentials) => {
    isLoading.value = true
    error.value = null
    
    try {
      await authStore.login(credentials)
      router.push('/')
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  const logout = async () => {
    await authStore.logout()
    router.push('/login')
  }

  return {
    isAuthenticated,
    user,
    isLoading,
    error,
    login,
    logout,
  }
}

// composables/useForm.js
import { ref, reactive, computed } from 'vue'

export function useForm(initialValues, validationRules = {}) {
  const values = reactive({ ...initialValues })
  const errors = reactive({})
  const touched = reactive({})
  const isSubmitting = ref(false)

  const isValid = computed(() => 
    Object.keys(errors).every(key => !errors[key])
  )

  const validate = (field) => {
    const rule = validationRules[field]
    if (!rule) return true

    const error = rule(values[field], values)
    errors[field] = error || null
    return !error
  }

  const validateAll = () => {
    let valid = true
    for (const field of Object.keys(validationRules)) {
      if (!validate(field)) {
        valid = false
      }
      touched[field] = true
    }
    return valid
  }

  const handleChange = (field, value) => {
    values[field] = value
    if (touched[field]) {
      validate(field)
    }
  }

  const handleBlur = (field) => {
    touched[field] = true
    validate(field)
  }

  const reset = () => {
    Object.assign(values, initialValues)
    Object.keys(errors).forEach(key => errors[key] = null)
    Object.keys(touched).forEach(key => touched[key] = false)
  }

  const handleSubmit = (onSubmit) => async (event) => {
    event?.preventDefault()
    
    if (!validateAll()) return
    
    isSubmitting.value = true
    try {
      await onSubmit(values)
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    values,
    errors,
    touched,
    isValid,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    validate,
    validateAll,
    reset,
  }
}
```

## Pinia Stores

### Store Definition
```javascript
// stores/user.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userService } from '@/services/user.service'

export const useUserStore = defineStore('user', () => {
  // State
  const users = ref([])
  const currentUser = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  // Getters
  const activeUsers = computed(() => 
    users.value.filter(u => u.isActive)
  )
  
  const userById = computed(() => (id) => 
    users.value.find(u => u.id === id)
  )

  // Actions
  const fetchUsers = async () => {
    isLoading.value = true
    error.value = null
    
    try {
      users.value = await userService.getAll()
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  const fetchUser = async (id) => {
    const response = await userService.getById(id)
    currentUser.value = response
    return response
  }

  const createUser = async (userData) => {
    const newUser = await userService.create(userData)
    users.value.push(newUser)
    return newUser
  }

  const updateUser = async (id, userData) => {
    const updated = await userService.update(id, userData)
    const index = users.value.findIndex(u => u.id === id)
    if (index !== -1) {
      users.value[index] = updated
    }
    return updated
  }

  const deleteUser = async (id) => {
    await userService.delete(id)
    users.value = users.value.filter(u => u.id !== id)
  }

  const $reset = () => {
    users.value = []
    currentUser.value = null
    isLoading.value = false
    error.value = null
  }

  return {
    // State
    users,
    currentUser,
    isLoading,
    error,
    // Getters
    activeUsers,
    userById,
    // Actions
    fetchUsers,
    fetchUser,
    createUser,
    updateUser,
    deleteUser,
    $reset,
  }
})
```

## Vue Router

### Router Configuration
```javascript
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/pages/UsersPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'users/:id',
        name: 'user-detail',
        component: () => import('@/pages/UserDetailPage.vue'),
        meta: { requiresAuth: true },
        props: true,
      },
    ],
  },
  {
    path: '/auth',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      {
        path: 'login',
        name: 'login',
        component: () => import('@/pages/LoginPage.vue'),
        meta: { guest: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
})

// Navigation guards
router.beforeEach(async (to, from) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guest && authStore.isAuthenticated) {
    return { name: 'home' }
  }
})

export default router
```

## API Services

### HTTP Client Setup
```javascript
// services/api.js
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.logout()
      router.push('/auth/login')
    }
    return Promise.reject(error)
  }
)

export default api

// services/user.service.js
import api from './api'

export const userService = {
  async getAll(params = {}) {
    const { data } = await api.get('/users', { params })
    return data
  },

  async getById(id) {
    const { data } = await api.get(`/users/${id}`)
    return data
  },

  async create(userData) {
    const { data } = await api.post('/users', userData)
    return data
  },

  async update(id, userData) {
    const { data } = await api.put(`/users/${id}`, userData)
    return data
  },

  async delete(id) {
    await api.delete(`/users/${id}`)
  },
}
```

## Node.js Backend Standards

### Express Server Structure
```javascript
// server/src/app.js
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const routes = require('./routes')
const errorHandler = require('./middleware/error')

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())

app.use('/api', routes)
app.use(errorHandler)

module.exports = app
```

## TypeScript Support

### Vue with TypeScript
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
}

interface Props {
  userId: string
  showDetails?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDetails: false,
})

const emit = defineEmits<{
  update: [user: User]
  delete: [id: string]
}>()

const user = ref<User | null>(null)
const isLoading = ref(false)

const fullName = computed(() => user.value?.name ?? '')
</script>
```
