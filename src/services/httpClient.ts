/**
 * HttpClient - Centralized HTTP Client with Caching, Retries, Rate Limiting, and Circuit Breakers
 * @version 3.8.2
 */

import { getStorage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { createServiceCircuitBreaker, CircuitOpenError, type CircuitBreaker } from '../utils/circuitBreaker.js';
import { resilienceMetrics } from '../utils/resilienceMetrics.js';

// ============================================================================
// Types
// ============================================================================

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  fromCache: boolean;
  cached_at?: string;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  cacheTtlMs?: number;
  skipCache?: boolean;
  skipRateLimit?: boolean;
  /** Skip circuit breaker protection */
  skipCircuitBreaker?: boolean;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

interface PendingRequest {
  resolve: (value: HttpResponse) => void;
  reject: (error: Error) => void;
  execute: () => Promise<HttpResponse>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second
const DEFAULT_CACHE_TTL = 3600000; // 1 hour
const MAX_CACHE_TTL = 86400000; // 24 hours

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'api.github.com': { requestsPerSecond: 5, burstSize: 10 },
  'cursor.directory': { requestsPerSecond: 2, burstSize: 5 },
  'raw.githubusercontent.com': { requestsPerSecond: 10, burstSize: 20 },
  'default': { requestsPerSecond: 10, burstSize: 20 }
};

// ============================================================================
// Rate Limiter
// ============================================================================

class TokenBucketRateLimiter {
  private buckets: Map<string, RateLimitState> = new Map();
  private queues: Map<string, PendingRequest[]> = new Map();
  private processing: Set<string> = new Set();
  
  constructor(private configs: Record<string, RateLimitConfig>) {}
  
  private getConfig(host: string): RateLimitConfig {
    return this.configs[host] || this.configs['default'];
  }
  
  private getBucket(host: string): RateLimitState {
    if (!this.buckets.has(host)) {
      const config = this.getConfig(host);
      this.buckets.set(host, {
        tokens: config.burstSize,
        lastRefill: Date.now()
      });
    }
    return this.buckets.get(host)!;
  }
  
  private refillTokens(host: string): void {
    const bucket = this.getBucket(host);
    const config = this.getConfig(host);
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * config.requestsPerSecond;
    
    bucket.tokens = Math.min(config.burstSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
  
  private tryConsume(host: string): boolean {
    this.refillTokens(host);
    const bucket = this.getBucket(host);
    
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }
  
  private getWaitTime(host: string): number {
    const bucket = this.getBucket(host);
    const config = this.getConfig(host);
    const tokensNeeded = 1 - bucket.tokens;
    return Math.ceil(tokensNeeded / config.requestsPerSecond * 1000);
  }
  
  async acquire<T>(host: string, execute: () => Promise<T>): Promise<T> {
    // Try immediate consumption
    if (this.tryConsume(host)) {
      return execute();
    }
    
    // Queue the request
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(host) || [];
      queue.push({
        resolve: resolve as (value: HttpResponse) => void,
        reject,
        execute: execute as () => Promise<HttpResponse>
      });
      this.queues.set(host, queue);
      
      // Start processing if not already
      if (!this.processing.has(host)) {
        this.processQueue(host);
      }
    });
  }
  
  private async processQueue(host: string): Promise<void> {
    this.processing.add(host);
    
    while (true) {
      const queue = this.queues.get(host) || [];
      if (queue.length === 0) {
        this.processing.delete(host);
        break;
      }
      
      // Wait for token availability
      if (!this.tryConsume(host)) {
        const waitTime = this.getWaitTime(host);
        await this.sleep(waitTime);
        continue;
      }
      
      // Process next request
      const request = queue.shift()!;
      this.queues.set(host, queue);
      
      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// HTTP Client Implementation
// ============================================================================

class HttpClient {
  private rateLimiter: TokenBucketRateLimiter;
  private requestId: number = 0;
  private circuits: Map<string, CircuitBreaker> = new Map();
  
  constructor() {
    this.rateLimiter = new TokenBucketRateLimiter(DEFAULT_RATE_LIMITS);
  }
  
  private getCircuitBreaker(host: string): CircuitBreaker {
    if (!this.circuits.has(host)) {
      this.circuits.set(host, createServiceCircuitBreaker(`http:${host}`, {
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        callTimeoutMs: 30000,
        isFailure: (error) => {
          // Don't count 4xx client errors as failures for circuit breaker
          const message = error.message.toLowerCase();
          if (message.includes('404') || message.includes('400') || message.includes('401') || message.includes('403')) {
            return false;
          }
          return true;
        }
      }));
    }
    return this.circuits.get(host)!;
  }
  
  async request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_TIMEOUT,
      retries = DEFAULT_RETRIES,
      retryDelay = DEFAULT_RETRY_DELAY,
      cacheTtlMs = DEFAULT_CACHE_TTL,
      skipCache = false,
      skipRateLimit = false,
      skipCircuitBreaker = false
    } = options;
    
    const reqId = ++this.requestId;
    const host = new URL(url).hostname;
    const startTime = Date.now();
    
    // Check cache for GET requests
    if (method === 'GET' && !skipCache) {
      const cached = await this.getFromCache<T>(url);
      if (cached) {
        logger.debug(`[HTTP#${reqId}] Cache hit for ${url}`);
        return cached;
      }
    }
    
    logger.debug(`[HTTP#${reqId}] ${method} ${url}`);
    
    const executeWithMetrics = async (): Promise<HttpResponse<T>> => {
      try {
        const response = await this.executeWithRetry<T>(url, {
          method,
          headers,
          body,
          timeout,
          retries,
          retryDelay,
          reqId
        });
        
        // Record success metrics
        resilienceMetrics.recordSuccess(host, Date.now() - startTime);
        return response;
      } catch (error) {
        // Record failure metrics
        const latency = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMessage.includes('timeout')) {
          resilienceMetrics.recordTimeout(host, latency);
        } else {
          resilienceMetrics.recordFailure(host, latency, errorMessage);
        }
        throw error;
      }
    };
    
    const executeWithRateLimit = async (): Promise<HttpResponse<T>> => {
      return skipRateLimit
        ? await executeWithMetrics()
        : await this.rateLimiter.acquire<HttpResponse<T>>(host, executeWithMetrics);
    };
    
    // Apply circuit breaker
    let response: HttpResponse<T>;
    if (skipCircuitBreaker) {
      response = await executeWithRateLimit();
    } else {
      const circuit = this.getCircuitBreaker(host);
      try {
        response = await circuit.execute(executeWithRateLimit);
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          logger.warn(`[HTTP#${reqId}] Circuit breaker open for ${host}`, {
            remainingMs: error.remainingMs
          });
        }
        throw error;
      }
    }
    
    // Cache successful GET responses
    if (method === 'GET' && response.status >= 200 && response.status < 300 && !skipCache) {
      await this.saveToCache(url, response, cacheTtlMs);
    }
    
    return response;
  }
  
  private async executeWithRetry<T>(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: unknown;
      timeout: number;
      retries: number;
      retryDelay: number;
      reqId: number;
    }
  ): Promise<HttpResponse<T>> {
    const { method, headers, body, timeout, retries, retryDelay, reqId } = options;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.debug(`[HTTP#${reqId}] Retry ${attempt}/${retries} after ${delay}ms`);
          await this.sleep(delay);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'StackGuide-MCP/3.4.0',
            ...headers
          },
          signal: controller.signal
        };
        
        if (body && method !== 'GET') {
          fetchOptions.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        // Extract response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        
        // Handle rate limit headers
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter && attempt < retries) {
            const waitTime = parseInt(retryAfter, 10) * 1000 || retryDelay;
            logger.debug(`[HTTP#${reqId}] Rate limited, waiting ${waitTime}ms`);
            await this.sleep(waitTime);
            continue;
          }
        }
        
        // Parse response
        let data: T;
        const contentType = response.headers.get('Content-Type') || '';
        
        if (contentType.includes('application/json')) {
          data = await response.json() as T;
        } else {
          data = await response.text() as unknown as T;
        }
        
        logger.debug(`[HTTP#${reqId}] ${response.status} ${response.statusText}`);
        
        return {
          data,
          status: response.status,
          headers: responseHeaders,
          fromCache: false
        };
        
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on abort/timeout if it's the last attempt
        if (lastError.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${timeout}ms`);
        }
        
        // Don't retry certain errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }
        
        logger.debug(`[HTTP#${reqId}] Error: ${lastError.message}`);
      }
    }
    
    throw lastError || new Error('Request failed');
  }
  
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid url') ||
      message.includes('unsupported protocol') ||
      message.includes('certificate')
    );
  }
  
  private async getFromCache<T>(url: string): Promise<HttpResponse<T> | null> {
    try {
      const storage = getStorage();
      const cacheKey = `http:${url}`;
      const entry = await storage.cache.get<{ data: T; status: number; headers: Record<string, string> }>(cacheKey);
      
      if (entry) {
        return {
          data: entry.value.data,
          status: entry.value.status,
          headers: entry.value.headers,
          fromCache: true,
          cached_at: entry.createdAt
        };
      }
    } catch (error) {
      logger.debug(`Cache read error: ${(error as Error).message}`);
    }
    
    return null;
  }
  
  private async saveToCache<T>(
    url: string,
    response: HttpResponse<T>,
    ttlMs: number
  ): Promise<void> {
    try {
      const storage = getStorage();
      const cacheKey = `http:${url}`;
      const effectiveTtl = Math.min(ttlMs, MAX_CACHE_TTL);
      
      await storage.cache.set(cacheKey, {
        data: response.data,
        status: response.status,
        headers: response.headers
      }, { ttl: effectiveTtl });
      
      logger.debug(`Cached response for ${url} (TTL: ${effectiveTtl}ms)`);
    } catch (error) {
      logger.debug(`Cache write error: ${(error as Error).message}`);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Convenience methods
  async get<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'method'>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }
  
  async post<T = unknown>(url: string, data?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'POST', body: data });
  }
  
  async put<T = unknown>(url: string, data?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PUT', body: data });
  }
  
  async delete<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'method'>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
  
  /**
   * Get health metrics for all HTTP services
   */
  getHealthMetrics() {
    return resilienceMetrics.getOverallHealth();
  }
  
  /**
   * Quick health check
   */
  healthCheck() {
    return resilienceMetrics.quickHealthCheck();
  }
  
  /**
   * Get circuit breaker states
   */
  getCircuitStates(): Record<string, { state: string; failures: number }> {
    const states: Record<string, { state: string; failures: number }> = {};
    this.circuits.forEach((circuit, host) => {
      const metrics = circuit.getMetrics();
      states[host] = { state: metrics.state, failures: metrics.failures };
    });
    return states;
  }
  
  /**
   * Reset a specific circuit breaker
   */
  resetCircuit(host: string): boolean {
    const circuit = this.circuits.get(host);
    if (circuit) {
      circuit.reset();
      return true;
    }
    return false;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuits.forEach(circuit => circuit.reset());
    logger.info('All HTTP circuit breakers reset');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let clientInstance: HttpClient | null = null;

export function getHttpClient(): HttpClient {
  if (!clientInstance) {
    clientInstance = new HttpClient();
  }
  return clientInstance;
}

export function resetHttpClient(): void {
  clientInstance = null;
}

// Export types and client
export { HttpClient };
