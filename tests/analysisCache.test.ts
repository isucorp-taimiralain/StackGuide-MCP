/**
 * Tests for Analysis Cache Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeFileHash,
  loadCache,
  saveCache,
  createEmptyCache,
  getCachedResult,
  setCachedResult,
  cleanExpiredEntries,
  getCacheStats,
  AnalysisCacheManager
} from '../src/services/analysisCache.js';
import { AnalysisResult } from '../src/services/codeAnalyzer.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    chmodSync: vi.fn(),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('Analysis Cache Service', () => {
  const mockFs = fs as any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.lstatSync.mockReturnValue({
      isSymbolicLink: () => false,
    });
    mockFs.statSync.mockReturnValue({
      isFile: () => true,
      size: 1024,
    });
  });

  describe('computeFileHash', () => {
    it('should compute consistent hash for same content', () => {
      const content = 'const x = 1;';
      const hash1 = computeFileHash(content);
      const hash2 = computeFileHash(content);
      expect(hash1).toBe(hash2);
    });

    it('should compute different hash for different content', () => {
      const hash1 = computeFileHash('const x = 1;');
      const hash2 = computeFileHash('const x = 2;');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 16 character hash', () => {
      const hash = computeFileHash('test content');
      expect(hash).toHaveLength(16);
    });
  });

  describe('createEmptyCache', () => {
    it('should create cache with version and empty entries', () => {
      const cache = createEmptyCache();
      expect(cache.version).toBe('1.0.0');
      expect(cache.entries).toEqual({});
    });
  });

  describe('loadCache', () => {
    it('should return empty cache when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const cache = loadCache('/test/project');
      expect(cache.entries).toEqual({});
    });

    it('should load existing cache from disk', () => {
      const existingCache = {
        version: '1.0.0',
        entries: {
          'test.ts': {
            hash: 'aaaaaaaaaaaaaaaa',
            result: {} as AnalysisResult,
            timestamp: Date.now(),
            version: '1.0.0'
          }
        }
      };
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingCache));
      
      const cache = loadCache('/test/project');
      expect(Object.keys(cache.entries)).toHaveLength(1);
    });

    it('should return empty cache on version mismatch', () => {
      const oldCache = {
        version: '0.9.0',
        entries: { 'test.ts': {} }
      };
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(oldCache));
      
      const cache = loadCache('/test/project');
      expect(cache.entries).toEqual({});
    });

    it('should return empty cache on checksum mismatch', () => {
      const tamperedCache = {
        version: '1.0.0',
        entries: {
          'test.ts': {
            hash: 'aaaaaaaaaaaaaaaa',
            result: {} as AnalysisResult,
            timestamp: Date.now(),
            version: '1.0.0'
          }
        },
        checksum: 'invalid-checksum'
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(tamperedCache));

      const cache = loadCache('/test/project');
      expect(cache.entries).toEqual({});
    });
  });

  describe('getCachedResult', () => {
    it('should return null for uncached file', () => {
      const cache = createEmptyCache();
      const result = getCachedResult(cache, 'test.ts', 'content');
      expect(result).toBeNull();
    });

    it('should return cached result for matching hash', () => {
      const content = 'const x = 1;';
      const mockResult: AnalysisResult = {
        file: 'test.ts',
        language: 'typescript',
        issues: [],
        score: 100,
        summary: { errors: 0, warnings: 0, info: 0, suggestions: 0 }
      };
      
      const cache = createEmptyCache();
      setCachedResult(cache, 'test.ts', content, mockResult);
      
      const result = getCachedResult(cache, 'test.ts', content);
      expect(result).toEqual(mockResult);
    });

    it('should return null for changed content (hash mismatch)', () => {
      const cache = createEmptyCache();
      const mockResult: AnalysisResult = {
        file: 'test.ts',
        language: 'typescript',
        issues: [],
        score: 100,
        summary: { errors: 0, warnings: 0, info: 0, suggestions: 0 }
      };
      
      setCachedResult(cache, 'test.ts', 'old content', mockResult);
      const result = getCachedResult(cache, 'test.ts', 'new content');
      expect(result).toBeNull();
    });
  });

  describe('cleanExpiredEntries', () => {
    it('should remove expired entries', () => {
      const cache = createEmptyCache();
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      
      cache.entries['old.ts'] = {
        hash: 'abc',
        result: {} as AnalysisResult,
        timestamp: oldTimestamp,
        version: '1.0.0'
      };
      cache.entries['new.ts'] = {
        hash: 'xyz',
        result: {} as AnalysisResult,
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      const cleaned = cleanExpiredEntries(cache);
      expect(Object.keys(cleaned.entries)).toHaveLength(1);
      expect(cleaned.entries['new.ts']).toBeDefined();
      expect(cleaned.entries['old.ts']).toBeUndefined();
    });
  });

  describe('getCacheStats', () => {
    it('should return correct statistics', () => {
      const cache = createEmptyCache();
      const now = Date.now();
      
      cache.entries['valid.ts'] = {
        hash: 'abc',
        result: {} as AnalysisResult,
        timestamp: now,
        version: '1.0.0'
      };
      cache.entries['expired.ts'] = {
        hash: 'xyz',
        result: {} as AnalysisResult,
        timestamp: now - (25 * 60 * 60 * 1000),
        version: '1.0.0'
      };
      
      const stats = getCacheStats(cache);
      expect(stats.totalEntries).toBe(2);
      expect(stats.validEntries).toBe(1);
      expect(stats.expiredEntries).toBe(1);
    });
  });

  describe('AnalysisCacheManager', () => {
    it('should provide high-level cache API', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const manager = new AnalysisCacheManager('/test/project');
      
      const content = 'const x = 1;';
      const mockResult: AnalysisResult = {
        file: 'test.ts',
        language: 'typescript',
        issues: [],
        score: 100,
        summary: { errors: 0, warnings: 0, info: 0, suggestions: 0 }
      };
      
      // Initially no cached result
      expect(manager.get('test.ts', content)).toBeNull();
      
      // Set and get
      manager.set('test.ts', content, mockResult);
      expect(manager.get('test.ts', content)).toEqual(mockResult);
      
      // Invalidate
      manager.invalidate('test.ts');
      expect(manager.get('test.ts', content)).toBeNull();
    });
  });

  describe('saveCache', () => {
    it('should write cache atomically and set secure permissions', () => {
      mockFs.existsSync.mockImplementation((target: string) => target.includes('.tmp'));

      const cache = createEmptyCache();
      setCachedResult(cache, 'test.ts', 'const x = 1;', {
        file: 'test.ts',
        language: 'typescript',
        issues: [],
        score: 100,
        summary: { errors: 0, warnings: 0, info: 0, suggestions: 0 }
      } as AnalysisResult);

      saveCache('/test/project', cache);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockFs.renameSync).toHaveBeenCalled();
      expect(mockFs.chmodSync).toHaveBeenCalled();
    });
  });
});
