# Vue.js + Node.js Security Guidelines

## Vue.js Frontend Security

### XSS Prevention

```vue
<template>
  <!-- ✅ Safe: Vue automatically escapes -->
  <p>{{ userInput }}</p>
  <p :title="userInput">Hover me</p>
  
  <!-- ❌ Dangerous: Raw HTML -->
  <div v-html="unsafeHtml" />
</template>

<script setup>
import DOMPurify from 'dompurify'

const props = defineProps({
  htmlContent: String,
})

// ✅ Sanitize HTML before rendering
const safeHtml = computed(() => 
  DOMPurify.sanitize(props.htmlContent, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'title'],
  })
)
</script>
```

### Content Security Policy
```javascript
// vite.config.js
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>
            <meta http-equiv="Content-Security-Policy" 
                  content="default-src 'self'; 
                           script-src 'self' 'unsafe-inline'; 
                           style-src 'self' 'unsafe-inline'; 
                           img-src 'self' data: https:; 
                           connect-src 'self' https://api.example.com;">
          `
        )
      },
    },
  ],
})
```

### Secure URL Handling
```vue
<script setup>
// ✅ Validate URLs before use
const isValidUrl = (url) => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

// ❌ Never use javascript: URLs
const handleLink = (url) => {
  if (url.startsWith('javascript:')) {
    console.error('Invalid URL')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <!-- ✅ Safe external links -->
  <a 
    :href="externalUrl" 
    target="_blank" 
    rel="noopener noreferrer"
  >
    External Link
  </a>
</template>
```

## Authentication

### JWT Token Management
```javascript
// stores/auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useAuthStore = defineStore('auth', () => {
  // Don't store sensitive tokens in localStorage
  const accessToken = ref(null)
  const user = ref(null)
  
  const isAuthenticated = computed(() => !!accessToken.value)
  
  const login = async (credentials) => {
    const response = await api.post('/auth/login', credentials)
    
    // Store access token in memory only
    accessToken.value = response.data.accessToken
    user.value = response.data.user
    
    // Refresh token should be HTTP-only cookie (set by server)
  }
  
  const refreshToken = async () => {
    try {
      // Refresh token sent automatically via cookie
      const response = await api.post('/auth/refresh')
      accessToken.value = response.data.accessToken
      return true
    } catch {
      logout()
      return false
    }
  }
  
  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      accessToken.value = null
      user.value = null
    }
  }
  
  return {
    accessToken,
    user,
    isAuthenticated,
    login,
    logout,
    refreshToken,
  }
})
```

### API Interceptor with Token Refresh
```javascript
// services/api.js
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Send cookies
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }
      
      originalRequest._retry = true
      isRefreshing = true
      
      const authStore = useAuthStore()
      const success = await authStore.refreshToken()
      
      isRefreshing = false
      
      if (success) {
        processQueue(null, authStore.accessToken)
        originalRequest.headers.Authorization = `Bearer ${authStore.accessToken}`
        return api(originalRequest)
      } else {
        processQueue(error, null)
        router.push('/auth/login')
        return Promise.reject(error)
      }
    }
    
    return Promise.reject(error)
  }
)

export default api
```

## Route Guards

### Protected Routes
```javascript
// router/index.js
import { useAuthStore } from '@/stores/auth'

router.beforeEach(async (to, from) => {
  const authStore = useAuthStore()
  
  // Routes requiring authentication
  if (to.meta.requiresAuth) {
    if (!authStore.isAuthenticated) {
      // Try to refresh token
      const refreshed = await authStore.refreshToken()
      
      if (!refreshed) {
        return { 
          name: 'login', 
          query: { redirect: to.fullPath } 
        }
      }
    }
    
    // Check role-based access
    if (to.meta.roles && !to.meta.roles.includes(authStore.user?.role)) {
      return { name: 'forbidden' }
    }
  }
  
  // Guest only routes (login, register)
  if (to.meta.guest && authStore.isAuthenticated) {
    return { name: 'home' }
  }
})
```

## Input Validation

### Form Validation
```vue
<script setup>
import { useForm } from '@/composables/useForm'

const validationRules = {
  email: (value) => {
    if (!value) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Invalid email format'
    }
    return null
  },
  password: (value) => {
    if (!value) return 'Password is required'
    if (value.length < 8) return 'Password must be at least 8 characters'
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
      return 'Password must contain uppercase, lowercase, and number'
    }
    return null
  },
}

const { values, errors, handleSubmit, handleBlur } = useForm(
  { email: '', password: '' },
  validationRules
)

const onSubmit = handleSubmit(async (data) => {
  await authStore.login(data)
})
</script>

<template>
  <form @submit="onSubmit">
    <input 
      v-model="values.email"
      type="email"
      @blur="handleBlur('email')"
    />
    <span v-if="errors.email" class="error">{{ errors.email }}</span>
    
    <input 
      v-model="values.password"
      type="password"
      @blur="handleBlur('password')"
    />
    <span v-if="errors.password" class="error">{{ errors.password }}</span>
    
    <button type="submit">Login</button>
  </form>
</template>
```

## Node.js Backend Security

### Helmet Configuration
```javascript
// server/src/app.js
const express = require('express')
const helmet = require('helmet')

const app = express()

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}))
```

### CORS Configuration
```javascript
const cors = require('cors')

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:5173',
    ]
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit')
const RedisStore = require('rate-limit-redis')
const Redis = require('ioredis')

const redis = new Redis(process.env.REDIS_URL)

// General API limit
const apiLimiter = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Strict auth limit
const authLimiter = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts' },
})

app.use('/api', apiLimiter)
app.use('/api/auth', authLimiter)
```

### JWT with HTTP-Only Cookies
```javascript
// server/src/controllers/auth.controller.js
const jwt = require('jsonwebtoken')

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )
  
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  )
  
  return { accessToken, refreshToken }
}

const login = async (req, res) => {
  const { email, password } = req.body
  
  const user = await User.findOne({ email })
  if (!user || !await user.comparePassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  
  const { accessToken, refreshToken } = generateTokens(user.id)
  
  // Set refresh token as HTTP-only cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  })
  
  res.json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name },
  })
}

const refresh = async (req, res) => {
  const { refreshToken } = req.cookies
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' })
  }
  
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    
    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklist.exists({ token: refreshToken })
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token revoked' })
    }
    
    const tokens = generateTokens(payload.sub)
    
    // Rotate refresh token
    await TokenBlacklist.create({ token: refreshToken })
    
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    
    res.json({ accessToken: tokens.accessToken })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
}

const logout = async (req, res) => {
  const { refreshToken } = req.cookies
  
  if (refreshToken) {
    await TokenBlacklist.create({ token: refreshToken })
  }
  
  res.clearCookie('refreshToken', { path: '/api/auth' })
  res.json({ message: 'Logged out' })
}
```

### Input Sanitization
```javascript
const mongoSanitize = require('express-mongo-sanitize')
const xss = require('xss-clean')
const hpp = require('hpp')

// Prevent NoSQL injection
app.use(mongoSanitize())

// Prevent XSS attacks
app.use(xss())

// Prevent HTTP Parameter Pollution
app.use(hpp({
  whitelist: ['sort', 'fields', 'page', 'limit'],
}))
```

### Password Hashing
```javascript
const bcrypt = require('bcryptjs')

// In user model
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}
```

## Environment Security

```javascript
// ✅ Validate required env vars at startup
const requiredEnvVars = [
  'NODE_ENV',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_URL',
  'CLIENT_URL',
]

const missing = requiredEnvVars.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(', ')}`)
  process.exit(1)
}

// ✅ Use strong secrets
// Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## File Upload Security
```javascript
const multer = require('multer')
const path = require('path')
const crypto = require('crypto')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const randomName = crypto.randomBytes(16).toString('hex')
    cb(null, `${randomName}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false)
    }
    cb(null, true)
  },
})
```
