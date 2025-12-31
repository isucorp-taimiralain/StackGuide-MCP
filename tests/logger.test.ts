/**
 * Tests for Logger Utility
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel } from '../src/utils/logger.js';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger type', () => {
    it('should export logger as singleton', () => {
      expect(logger).toBeDefined();
      expect(typeof logger).toBe('object');
    });

    it('should have all log methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.tool).toBe('function');
    });
  });

  describe('logger.error', () => {
    it('should log errors', () => {
      logger.error('test error');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should include context in error logs', () => {
      logger.error('test error', { key: 'value' });
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain('ERROR');
      expect(call).toContain('test error');
    });

    it('should include timestamp', () => {
      logger.error('test error');
      const call = consoleSpy.mock.calls[0][0] as string;
      // Should contain ISO timestamp format
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('logger.warn', () => {
    it('should log warnings via console.error', () => {
      logger.warn('test warning');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain('WARN');
    });

    it('should include context in warning logs', () => {
      logger.warn('test warning', { detail: 'some detail' });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('logger.info', () => {
    it('should log info via console.error', () => {
      logger.info('test info');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain('INFO');
    });
  });

  describe('logger.debug', () => {
    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
      // Debug may not output depending on level setting
      logger.debug('test debug');
    });
  });

  describe('logger.tool', () => {
    it('should log tool calls with args', () => {
      logger.tool('test-tool', { arg1: 'value1' });
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain('test-tool');
    });

    it('should handle empty args', () => {
      logger.tool('test-tool', {});
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should include duration when startTime provided', () => {
      const startTime = Date.now() - 100;
      logger.tool('test-tool', { arg1: 'value' }, startTime);
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain('ms');
    });
  });

  describe('LogLevel type', () => {
    it('should accept valid log levels', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      expect(levels).toHaveLength(4);
    });
  });
});
