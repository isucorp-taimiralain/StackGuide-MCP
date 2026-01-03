/**
 * @fileoverview Tests for circuit breaker pattern implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitOpenError,
  circuitBreakerRegistry
} from '../src/utils/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let circuit: CircuitBreaker;
  const defaultOptions: CircuitBreakerOptions = {
    name: 'test-service',
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    successThreshold: 2,
    failureWindowMs: 10000,
    callTimeoutMs: 5000
  };

  beforeEach(() => {
    vi.useFakeTimers();
    circuit = new CircuitBreaker(defaultOptions);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuit.getState()).toBe('CLOSED');
    });

    it('should return correct initial metrics', () => {
      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe('CLOSED');
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
      expect(metrics.totalCalls).toBe(0);
    });
  });

  describe('successful operations', () => {
    it('should allow operations in CLOSED state', async () => {
      const result = await circuit.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track successful requests', async () => {
      await circuit.execute(async () => 'ok');
      await circuit.execute(async () => 'ok');
      
      const metrics = circuit.getMetrics();
      expect(metrics.totalCalls).toBe(2);
      expect(metrics.successes).toBe(2);
      expect(metrics.failures).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should track failures', async () => {
      const failingFn = async () => { throw new Error('fail'); };
      
      await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      
      const metrics = circuit.getMetrics();
      expect(metrics.failures).toBe(1);
      expect(metrics.state).toBe('CLOSED');
    });

    it('should open after reaching failure threshold', async () => {
      const failingFn = async () => { throw new Error('fail'); };
      
      // Trigger failures up to threshold
      for (let i = 0; i < defaultOptions.failureThreshold!; i++) {
        await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      }
      
      expect(circuit.getState()).toBe('OPEN');
    });

    it('should not count excluded errors based on isFailure', async () => {
      const customCircuit = new CircuitBreaker({
        ...defaultOptions,
        name: 'custom-test',
        isFailure: (error) => !error.message.includes('excluded')
      });
      
      const excludedError = async () => { throw new Error('excluded error'); };
      const countedError = async () => { throw new Error('counted error'); };
      
      // These should not count (isFailure returns false)
      for (let i = 0; i < 5; i++) {
        await expect(customCircuit.execute(excludedError)).rejects.toThrow('excluded');
      }
      
      expect(customCircuit.getState()).toBe('CLOSED');
      
      // These should count (isFailure returns true)
      for (let i = 0; i < defaultOptions.failureThreshold!; i++) {
        await expect(customCircuit.execute(countedError)).rejects.toThrow('counted');
      }
      
      expect(customCircuit.getState()).toBe('OPEN');
    });
  });

  describe('OPEN state behavior', () => {
    beforeEach(async () => {
      // Get circuit to OPEN state
      const failingFn = async () => { throw new Error('fail'); };
      for (let i = 0; i < defaultOptions.failureThreshold!; i++) {
        await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      }
    });

    it('should reject calls when open', async () => {
      await expect(circuit.execute(async () => 'test')).rejects.toThrow(CircuitOpenError);
    });

    it('should provide retry time in error', async () => {
      try {
        await circuit.execute(async () => 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const circuitError = error as CircuitOpenError;
        // The error has remainingMs property
        expect(circuitError.remainingMs).toBeGreaterThan(0);
        expect(circuitError.remainingMs).toBeLessThanOrEqual(defaultOptions.resetTimeoutMs!);
      }
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      expect(circuit.getState()).toBe('OPEN');
      
      // Advance time past reset timeout
      vi.advanceTimersByTime(defaultOptions.resetTimeoutMs! + 100);
      
      // Check state - should now be HALF_OPEN
      expect(circuit.getState()).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state behavior', () => {
    beforeEach(async () => {
      const failingFn = async () => { throw new Error('fail'); };
      for (let i = 0; i < defaultOptions.failureThreshold!; i++) {
        await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      }
      vi.advanceTimersByTime(defaultOptions.resetTimeoutMs! + 100);
    });

    it('should close after success threshold in HALF_OPEN', async () => {
      expect(circuit.getState()).toBe('HALF_OPEN');
      
      for (let i = 0; i < defaultOptions.successThreshold!; i++) {
        await circuit.execute(async () => 'success');
      }
      
      expect(circuit.getState()).toBe('CLOSED');
    });

    it('should reopen on failure in HALF_OPEN', async () => {
      expect(circuit.getState()).toBe('HALF_OPEN');
      
      // Fail in half-open
      await expect(circuit.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      
      expect(circuit.getState()).toBe('OPEN');
    });
  });

  describe('timeout handling', () => {
    it('should timeout slow operations', async () => {
      const slowCircuit = new CircuitBreaker({ 
        name: 'slow',
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
        callTimeoutMs: 100 
      });
      
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'done';
      };
      
      const promise = slowCircuit.execute(slowFn);
      vi.advanceTimersByTime(150);
      
      await expect(promise).rejects.toThrow('timeout');
    });
  });

  describe('reset', () => {
    it('should reset to CLOSED state', async () => {
      const failingFn = async () => { throw new Error('fail'); };
      for (let i = 0; i < defaultOptions.failureThreshold!; i++) {
        await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      }
      
      expect(circuit.getState()).toBe('OPEN');
      
      circuit.reset();
      
      expect(circuit.getState()).toBe('CLOSED');
    });
  });

  describe('failure window', () => {
    it('should clear old failures outside window', async () => {
      const failingFn = async () => { throw new Error('fail'); };
      
      // Two failures
      await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      
      expect(circuit.getMetrics().failures).toBe(2);
      
      // Wait for window to pass
      vi.advanceTimersByTime(defaultOptions.failureWindowMs! + 100);
      
      // One more failure - should not trip since old ones expired
      await expect(circuit.execute(failingFn)).rejects.toThrow('fail');
      
      // Still closed because old failures expired
      expect(circuit.getState()).toBe('CLOSED');
    });
  });

  describe('forceOpen', () => {
    it('should force circuit open', () => {
      expect(circuit.getState()).toBe('CLOSED');
      circuit.forceOpen();
      expect(circuit.getState()).toBe('OPEN');
    });
  });
});

describe('circuitBreakerRegistry', () => {
  beforeEach(() => {
    // Clear and reset all circuits in the global registry before each test
    circuitBreakerRegistry.clear();
  });

  it('should get or create circuit breakers', () => {
    const circuit = circuitBreakerRegistry.getOrCreate({ name: 'test-registry-service' });
    expect(circuit).toBeInstanceOf(CircuitBreaker);
    expect(circuit.getState()).toBe('CLOSED');
  });

  it('should return same circuit for same name', () => {
    const circuit1 = circuitBreakerRegistry.getOrCreate({ name: 'same-service' });
    const circuit2 = circuitBreakerRegistry.getOrCreate({ name: 'same-service' });
    expect(circuit1).toBe(circuit2);
  });

  it('should return different circuits for different names', () => {
    const circuitA = circuitBreakerRegistry.getOrCreate({ name: 'service-a' });
    const circuitB = circuitBreakerRegistry.getOrCreate({ name: 'service-b' });
    expect(circuitA).not.toBe(circuitB);
  });

  it('should list all registered circuits', () => {
    circuitBreakerRegistry.getOrCreate({ name: 'svc-1' });
    circuitBreakerRegistry.getOrCreate({ name: 'svc-2' });
    
    const metrics = circuitBreakerRegistry.getAllMetrics();
    const names = metrics.map(m => m.name);
    
    expect(names).toContain('svc-1');
    expect(names).toContain('svc-2');
  });

  it('should reset all circuits', async () => {
    vi.useFakeTimers();
    
    const circuitA = circuitBreakerRegistry.getOrCreate({ name: 'reset-all-a', failureThreshold: 1 });
    const circuitB = circuitBreakerRegistry.getOrCreate({ name: 'reset-all-b', failureThreshold: 1 });
    
    await expect(circuitA.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(circuitB.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    
    expect(circuitA.getState()).toBe('OPEN');
    expect(circuitB.getState()).toBe('OPEN');
    
    circuitBreakerRegistry.resetAll();
    
    expect(circuitA.getState()).toBe('CLOSED');
    expect(circuitB.getState()).toBe('CLOSED');
    
    vi.useRealTimers();
  });

  it('should return health summary', async () => {
    vi.useFakeTimers();
    
    circuitBreakerRegistry.getOrCreate({ name: 'healthy' });
    const unhealthy = circuitBreakerRegistry.getOrCreate({ name: 'unhealthy', failureThreshold: 1 });
    
    await expect(unhealthy.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    
    const health = circuitBreakerRegistry.getHealthSummary();
    
    expect(health.total).toBe(2);
    expect(health.open).toBe(1);
    expect(health.closed).toBe(1);
    
    vi.useRealTimers();
  });
});
