/**
 * @fileoverview Tests for resilience metrics collection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resilienceMetrics } from '../src/utils/resilienceMetrics.js';
import { circuitBreakerRegistry } from '../src/utils/circuitBreaker.js';

describe('resilienceMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset for clean state
    resilienceMetrics.reset();
    circuitBreakerRegistry.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recording requests', () => {
    it('should record successful requests', () => {
      resilienceMetrics.recordSuccess('test-success-svc', 100);
      resilienceMetrics.recordSuccess('test-success-svc', 150);
      
      const services = resilienceMetrics.getAllServiceMetrics();
      const svc = services.find(s => s.name === 'test-success-svc');
      
      expect(svc).toBeDefined();
      expect(svc!.totalRequests).toBe(2);
      expect(svc!.successfulRequests).toBe(2);
      expect(svc!.failedRequests).toBe(0);
    });

    it('should record failed requests', () => {
      resilienceMetrics.recordFailure('test-fail-svc', 50, 'connection error');
      resilienceMetrics.recordFailure('test-fail-svc', 75, 'timeout');
      
      const services = resilienceMetrics.getAllServiceMetrics();
      const svc = services.find(s => s.name === 'test-fail-svc');
      
      expect(svc).toBeDefined();
      expect(svc!.totalRequests).toBe(2);
      expect(svc!.failedRequests).toBe(2);
      expect(svc!.successfulRequests).toBe(0);
    });

    it('should record timeouts', () => {
      resilienceMetrics.recordTimeout('test-timeout-svc', 5000);
      
      const services = resilienceMetrics.getAllServiceMetrics();
      const svc = services.find(s => s.name === 'test-timeout-svc');
      
      expect(svc).toBeDefined();
      expect(svc!.totalRequests).toBe(1);
      expect(svc!.timeouts).toBe(1);
      expect(svc!.failedRequests).toBe(1);
    });
  });

  describe('latency calculations', () => {
    it('should calculate average latency', () => {
      resilienceMetrics.recordSuccess('latency-avg-svc', 100);
      resilienceMetrics.recordSuccess('latency-avg-svc', 200);
      resilienceMetrics.recordSuccess('latency-avg-svc', 300);
      
      const services = resilienceMetrics.getAllServiceMetrics();
      const svc = services.find(s => s.name === 'latency-avg-svc');
      
      expect(svc!.averageLatencyMs).toBe(200);
    });

    it('should calculate latency percentiles', () => {
      // Add samples with known distribution
      for (let i = 1; i <= 100; i++) {
        resilienceMetrics.recordSuccess('latency-pct-svc', i);
      }
      
      const services = resilienceMetrics.getAllServiceMetrics();
      const svc = services.find(s => s.name === 'latency-pct-svc');
      
      expect(svc!.p95LatencyMs).toBeCloseTo(95, 0);
      expect(svc!.p99LatencyMs).toBeCloseTo(99, 0);
    });
  });

  describe('success rate', () => {
    it('should calculate success rate', () => {
      resilienceMetrics.recordSuccess('rate-calc-svc', 100);
      resilienceMetrics.recordSuccess('rate-calc-svc', 100);
      resilienceMetrics.recordSuccess('rate-calc-svc', 100);
      resilienceMetrics.recordFailure('rate-calc-svc', 100, 'error');
      
      const services = resilienceMetrics.getAllServiceMetrics();
      const svc = services.find(s => s.name === 'rate-calc-svc');
      
      expect(svc!.successRate).toBe(75); // 75%
    });

    it('should return 100 when no requests', () => {
      const collector = resilienceMetrics.getOrCreate('empty-rate-svc');
      const metrics = collector.getMetrics();
      expect(metrics.successRate).toBe(100);
    });
  });

  describe('getOverallHealth', () => {
    it('should return health metrics structure', () => {
      resilienceMetrics.recordSuccess('health-svc-a', 100);
      resilienceMetrics.recordSuccess('health-svc-b', 100);
      
      const health = resilienceMetrics.getOverallHealth();
      
      expect(health.services).toBeDefined();
      expect(health.circuits).toBeDefined();
      expect(health.summary).toBeDefined();
    });

    it('should include uptime', () => {
      const health = resilienceMetrics.getOverallHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return timestamp', () => {
      const health = resilienceMetrics.getOverallHealth();
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('integration with circuit breakers', () => {
    it('should include circuit breaker metrics in overall health', async () => {
      // Create a circuit breaker and trip it
      const circuit = circuitBreakerRegistry.getOrCreate({
        name: 'cb-integration-test',
        failureThreshold: 1
      });
      
      await expect(circuit.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      
      const health = resilienceMetrics.getOverallHealth();
      
      expect(health.circuits.length).toBeGreaterThan(0);
      const testCircuit = health.circuits.find(c => c.name === 'cb-integration-test');
      expect(testCircuit).toBeDefined();
      expect(testCircuit!.state).toBe('OPEN');
    });
  });
});
