/**
 * Circuit Breaker Pattern Implementation
 * Protects against cascading failures in external service calls
 * @version 3.8.2
 */

import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Name for logging/metrics */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (half-open) */
  resetTimeoutMs?: number;
  /** Number of successful calls in half-open to close circuit */
  successThreshold?: number;
  /** Time window in ms for counting failures */
  failureWindowMs?: number;
  /** Timeout for individual calls */
  callTimeoutMs?: number;
  /** Custom function to determine if error should count as failure */
  isFailure?: (error: Error) => boolean;
  /** Callback when circuit opens */
  onOpen?: (name: string, failures: number) => void;
  /** Callback when circuit closes */
  onClose?: (name: string) => void;
  /** Callback when circuit half-opens */
  onHalfOpen?: (name: string) => void;
}

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  rejectedCalls: number;
  lastFailure: string | null;
  lastSuccess: string | null;
  lastStateChange: string;
  consecutiveSuccesses: number;
  failureRate: number;
}

interface FailureRecord {
  timestamp: number;
  error: string;
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: FailureRecord[] = [];
  private successes: number = 0;
  private totalCalls: number = 0;
  private rejectedCalls: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private lastStateChange: Date = new Date();
  private openedAt: number | null = null;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly failureWindowMs: number;
  private readonly callTimeoutMs: number;
  private readonly isFailure: (error: Error) => boolean;
  private readonly onOpen?: (name: string, failures: number) => void;
  private readonly onClose?: (name: string) => void;
  private readonly onHalfOpen?: (name: string) => void;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000; // 30 seconds
    this.successThreshold = options.successThreshold ?? 2;
    this.failureWindowMs = options.failureWindowMs ?? 60000; // 1 minute
    this.callTimeoutMs = options.callTimeoutMs ?? 10000; // 10 seconds
    this.isFailure = options.isFailure ?? (() => true);
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onHalfOpen = options.onHalfOpen;

    logger.debug('Circuit breaker initialized', { name: this.name, state: this.state });
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('HALF_OPEN');
      } else {
        this.rejectedCalls++;
        throw new CircuitOpenError(this.name, this.getRemainingResetTime());
      }
    }

    // Apply timeout wrapper
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Circuit breaker timeout (${this.callTimeoutMs}ms)`));
      }, this.callTimeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check for automatic half-open transition
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const recentFailures = this.getRecentFailures();
    return {
      name: this.name,
      state: this.getState(),
      failures: recentFailures.length,
      successes: this.successes,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
      lastFailure: this.lastFailure?.toISOString() ?? null,
      lastSuccess: this.lastSuccess?.toISOString() ?? null,
      lastStateChange: this.lastStateChange.toISOString(),
      consecutiveSuccesses: this.consecutiveSuccesses,
      failureRate: this.totalCalls > 0 
        ? Math.round((recentFailures.length / Math.min(this.totalCalls, 100)) * 100) 
        : 0
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.failures = [];
    this.consecutiveSuccesses = 0;
    this.transitionTo('CLOSED');
    logger.info('Circuit breaker manually reset', { name: this.name });
  }

  /**
   * Force the circuit open (for testing or emergency)
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
    this.openedAt = Date.now();
    logger.warn('Circuit breaker forced open', { name: this.name });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.lastSuccess = new Date();

    if (this.state === 'HALF_OPEN') {
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }

    // Clear old failures on success
    this.pruneOldFailures();
  }

  private onError(error: Error): void {
    this.lastFailure = new Date();
    this.consecutiveSuccesses = 0;

    // Check if this error counts as a failure
    if (!this.isFailure(error)) {
      return;
    }

    this.failures.push({
      timestamp: Date.now(),
      error: error.message
    });

    this.pruneOldFailures();

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open state opens the circuit
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED') {
      // Check if we've exceeded failure threshold
      if (this.getRecentFailures().length >= this.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    logger.info('Circuit breaker state transition', {
      name: this.name,
      from: oldState,
      to: newState
    });

    switch (newState) {
      case 'OPEN':
        this.openedAt = Date.now();
        this.consecutiveSuccesses = 0;
        this.onOpen?.(this.name, this.getRecentFailures().length);
        break;
      case 'HALF_OPEN':
        this.consecutiveSuccesses = 0;
        this.onHalfOpen?.(this.name);
        break;
      case 'CLOSED':
        this.failures = [];
        this.openedAt = null;
        this.onClose?.(this.name);
        break;
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.openedAt === null) return false;
    return Date.now() - this.openedAt >= this.resetTimeoutMs;
  }

  private getRemainingResetTime(): number {
    if (this.openedAt === null) return 0;
    const elapsed = Date.now() - this.openedAt;
    return Math.max(0, this.resetTimeoutMs - elapsed);
  }

  private getRecentFailures(): FailureRecord[] {
    const cutoff = Date.now() - this.failureWindowMs;
    return this.failures.filter(f => f.timestamp >= cutoff);
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.failureWindowMs;
    this.failures = this.failures.filter(f => f.timestamp >= cutoff);
  }
}

// ============================================================================
// Circuit Breaker Error
// ============================================================================

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly remainingMs: number;

  constructor(circuitName: string, remainingMs: number) {
    super(`Circuit breaker '${circuitName}' is OPEN. Retry after ${Math.ceil(remainingMs / 1000)}s`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.remainingMs = remainingMs;
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

class CircuitBreakerRegistry {
  private circuits: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker by name
   */
  getOrCreate(options: CircuitBreakerOptions): CircuitBreaker {
    const existing = this.circuits.get(options.name);
    if (existing) {
      return existing;
    }

    const circuit = new CircuitBreaker(options);
    this.circuits.set(options.name, circuit);
    return circuit;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.circuits.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): CircuitBreaker[] {
    return Array.from(this.circuits.values());
  }

  /**
   * Get metrics for all circuits
   */
  getAllMetrics(): CircuitBreakerMetrics[] {
    return this.getAll().map(c => c.getMetrics());
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    healthy: boolean;
  } {
    const metrics = this.getAllMetrics();
    const closed = metrics.filter(m => m.state === 'CLOSED').length;
    const open = metrics.filter(m => m.state === 'OPEN').length;
    const halfOpen = metrics.filter(m => m.state === 'HALF_OPEN').length;

    return {
      total: metrics.length,
      closed,
      open,
      halfOpen,
      healthy: open === 0
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuits.forEach(circuit => circuit.reset());
    logger.info('All circuit breakers reset', { count: this.circuits.size });
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.circuits.clear();
  }
}

// ============================================================================
// Singleton Registry Export
// ============================================================================

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Create a circuit breaker with default options for external services
 */
export function createServiceCircuitBreaker(
  serviceName: string,
  options: Partial<CircuitBreakerOptions> = {}
): CircuitBreaker {
  return circuitBreakerRegistry.getOrCreate({
    name: serviceName,
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
    failureWindowMs: 60000,
    callTimeoutMs: 10000,
    ...options,
    onOpen: (name, failures) => {
      logger.error('Circuit breaker opened', { service: name, failures });
      options.onOpen?.(name, failures);
    },
    onClose: (name) => {
      logger.info('Circuit breaker closed', { service: name });
      options.onClose?.(name);
    },
    onHalfOpen: (name) => {
      logger.info('Circuit breaker half-open', { service: name });
      options.onHalfOpen?.(name);
    }
  });
}

// ============================================================================
// Decorator/Wrapper Helper
// ============================================================================

/**
 * Wrap an async function with circuit breaker protection
 */
export function withCircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  circuitName: string,
  options: Partial<CircuitBreakerOptions> = {}
): T {
  const circuit = createServiceCircuitBreaker(circuitName, options);

  return (async (...args: Parameters<T>) => {
    return circuit.execute(() => fn(...args));
  }) as T;
}
