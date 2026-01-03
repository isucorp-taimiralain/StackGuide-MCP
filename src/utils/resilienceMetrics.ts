/**
 * Resilience Metrics - Centralized metrics collection for service health
 * @version 3.8.2
 */

import { logger } from './logger.js';
import { circuitBreakerRegistry, type CircuitBreakerMetrics } from './circuitBreaker.js';

// ============================================================================
// Types
// ============================================================================

export interface ServiceMetrics {
  name: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeouts: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastRequestAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  successRate: number;
  requestsPerMinute: number;
}

export interface OverallHealthMetrics {
  timestamp: string;
  uptime: number;
  services: ServiceMetrics[];
  circuits: CircuitBreakerMetrics[];
  summary: {
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    unhealthyServices: number;
    overallHealthScore: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
  };
}

interface RequestRecord {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Service Metrics Collector
// ============================================================================

class ServiceMetricsCollector {
  private requests: RequestRecord[] = [];
  private readonly name: string;
  private readonly maxRecords: number;
  private readonly windowMs: number;

  constructor(name: string, maxRecords: number = 1000, windowMs: number = 300000) {
    this.name = name;
    this.maxRecords = maxRecords;
    this.windowMs = windowMs; // 5 minutes default
  }

  recordSuccess(latencyMs: number): void {
    this.addRecord({ timestamp: Date.now(), latencyMs, success: true });
  }

  recordFailure(latencyMs: number, error: string): void {
    this.addRecord({ timestamp: Date.now(), latencyMs, success: false, error });
  }

  recordTimeout(latencyMs: number): void {
    this.addRecord({ timestamp: Date.now(), latencyMs, success: false, error: 'timeout' });
  }

  private addRecord(record: RequestRecord): void {
    this.requests.push(record);
    this.pruneOldRecords();
  }

  private pruneOldRecords(): void {
    // Remove records older than window or over max count
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests
      .filter(r => r.timestamp >= cutoff)
      .slice(-this.maxRecords);
  }

  getMetrics(): ServiceMetrics {
    this.pruneOldRecords();
    const records = this.requests;

    const totalRequests = records.length;
    const successfulRequests = records.filter(r => r.success).length;
    const failedRequests = records.filter(r => !r.success).length;
    const timeouts = records.filter(r => r.error === 'timeout').length;

    // Calculate latencies
    const latencies = records.map(r => r.latencyMs).sort((a, b) => a - b);
    const averageLatencyMs = latencies.length > 0
      ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
      : 0;
    const p95LatencyMs = this.percentile(latencies, 95);
    const p99LatencyMs = this.percentile(latencies, 99);

    // Find last request and error
    const lastRequest = records.length > 0 ? records[records.length - 1] : null;
    const lastError = [...records].reverse().find(r => !r.success);

    // Calculate requests per minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = records.filter(r => r.timestamp >= oneMinuteAgo).length;

    return {
      name: this.name,
      totalRequests,
      successfulRequests,
      failedRequests,
      timeouts,
      averageLatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      lastRequestAt: lastRequest ? new Date(lastRequest.timestamp).toISOString() : null,
      lastErrorAt: lastError ? new Date(lastError.timestamp).toISOString() : null,
      lastError: lastError?.error ?? null,
      successRate: totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 100,
      requestsPerMinute: recentRequests
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  reset(): void {
    this.requests = [];
  }
}

// ============================================================================
// Resilience Metrics Registry
// ============================================================================

class ResilienceMetricsRegistry {
  private collectors: Map<string, ServiceMetricsCollector> = new Map();
  private startTime: number = Date.now();

  /**
   * Get or create a metrics collector for a service
   */
  getOrCreate(serviceName: string): ServiceMetricsCollector {
    const existing = this.collectors.get(serviceName);
    if (existing) return existing;

    const collector = new ServiceMetricsCollector(serviceName);
    this.collectors.set(serviceName, collector);
    return collector;
  }

  /**
   * Record a successful request
   */
  recordSuccess(serviceName: string, latencyMs: number): void {
    this.getOrCreate(serviceName).recordSuccess(latencyMs);
  }

  /**
   * Record a failed request
   */
  recordFailure(serviceName: string, latencyMs: number, error: string): void {
    this.getOrCreate(serviceName).recordFailure(latencyMs, error);
  }

  /**
   * Record a timeout
   */
  recordTimeout(serviceName: string, latencyMs: number): void {
    this.getOrCreate(serviceName).recordTimeout(latencyMs);
  }

  /**
   * Get metrics for all services
   */
  getAllServiceMetrics(): ServiceMetrics[] {
    return Array.from(this.collectors.values()).map(c => c.getMetrics());
  }

  /**
   * Get overall health metrics
   */
  getOverallHealth(): OverallHealthMetrics {
    const services = this.getAllServiceMetrics();
    const circuits = circuitBreakerRegistry.getAllMetrics();

    // Classify services
    const healthyServices = services.filter(s => s.successRate >= 95);
    const degradedServices = services.filter(s => s.successRate >= 80 && s.successRate < 95);
    const unhealthyServices = services.filter(s => s.successRate < 80);

    // Calculate overall health score (0-100)
    let overallHealthScore = 100;
    
    // Deduct points for service issues
    services.forEach(s => {
      overallHealthScore -= (100 - s.successRate) * 0.5;
    });

    // Deduct points for open circuits
    circuits.forEach(c => {
      if (c.state === 'OPEN') overallHealthScore -= 10;
      if (c.state === 'HALF_OPEN') overallHealthScore -= 5;
    });

    overallHealthScore = Math.max(0, Math.min(100, Math.round(overallHealthScore)));

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (overallHealthScore >= 90) {
      status = 'healthy';
    } else if (overallHealthScore >= 70) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      services,
      circuits,
      summary: {
        totalServices: services.length,
        healthyServices: healthyServices.length,
        degradedServices: degradedServices.length,
        unhealthyServices: unhealthyServices.length,
        overallHealthScore,
        status
      }
    };
  }

  /**
   * Get a quick health check
   */
  quickHealthCheck(): { healthy: boolean; score: number; issues: string[] } {
    const health = this.getOverallHealth();
    const issues: string[] = [];

    // Check for unhealthy services
    health.services.forEach(s => {
      if (s.successRate < 80) {
        issues.push(`Service '${s.name}' has ${s.successRate}% success rate`);
      }
    });

    // Check for open circuits
    health.circuits.forEach(c => {
      if (c.state === 'OPEN') {
        issues.push(`Circuit '${c.name}' is OPEN (${c.failures} failures)`);
      }
    });

    // Check for high latency
    health.services.forEach(s => {
      if (s.p95LatencyMs > 5000) {
        issues.push(`Service '${s.name}' has high latency (p95: ${s.p95LatencyMs}ms)`);
      }
    });

    return {
      healthy: health.summary.status === 'healthy',
      score: health.summary.overallHealthScore,
      issues
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.collectors.forEach(c => c.reset());
    this.startTime = Date.now();
    logger.info('Resilience metrics reset');
  }

  /**
   * Clear all collectors
   */
  clear(): void {
    this.collectors.clear();
    this.startTime = Date.now();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const resilienceMetrics = new ResilienceMetricsRegistry();

// ============================================================================
// Timing Helper
// ============================================================================

/**
 * Time an async operation and record metrics
 */
export async function withMetrics<T>(
  serviceName: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    resilienceMetrics.recordSuccess(serviceName, Date.now() - startTime);
    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('timeout')) {
      resilienceMetrics.recordTimeout(serviceName, latency);
    } else {
      resilienceMetrics.recordFailure(serviceName, latency, errorMessage);
    }
    throw error;
  }
}

/**
 * Combine circuit breaker and metrics for a service call
 */
export async function withResilience<T>(
  serviceName: string,
  fn: () => Promise<T>,
  circuitOptions?: Parameters<typeof import('./circuitBreaker.js').createServiceCircuitBreaker>[1]
): Promise<T> {
  const { createServiceCircuitBreaker } = await import('./circuitBreaker.js');
  const circuit = createServiceCircuitBreaker(serviceName, circuitOptions);

  return circuit.execute(() => withMetrics(serviceName, fn));
}
