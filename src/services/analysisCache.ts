/**
 * Analysis Cache Service
 * Caches code analysis results by file hash to avoid re-analyzing unchanged files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AnalysisResult } from './codeAnalyzer.js';
import { logger } from '../utils/logger.js';

interface CacheEntry {
  hash: string;
  result: AnalysisResult;
  timestamp: number;
  version: string;
}

interface CacheStore {
  version: string;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = '1.0.0';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR = '.stackguide';
const CACHE_FILE = 'analysis-cache.json';

/**
 * Compute SHA256 hash of file content
 */
export function computeFileHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Get cache directory path for a project
 */
export function getCacheDir(projectPath: string): string {
  return path.join(projectPath, CACHE_DIR);
}

/**
 * Get cache file path for a project
 */
export function getCacheFilePath(projectPath: string): string {
  return path.join(getCacheDir(projectPath), CACHE_FILE);
}

/**
 * Load cache from disk
 */
export function loadCache(projectPath: string): CacheStore {
  const cachePath = getCacheFilePath(projectPath);
  
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(data) as CacheStore;
      
      // Invalidate cache if version mismatch
      if (cache.version !== CACHE_VERSION) {
        logger.debug('Cache version mismatch, starting fresh');
        return createEmptyCache();
      }
      
      return cache;
    }
  } catch (error) {
    logger.debug('Failed to load cache, starting fresh', { error });
  }
  
  return createEmptyCache();
}

/**
 * Save cache to disk
 */
export function saveCache(projectPath: string, cache: CacheStore): void {
  const cacheDir = getCacheDir(projectPath);
  const cachePath = getCacheFilePath(projectPath);
  
  try {
    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    // Clean expired entries before saving
    const cleanedCache = cleanExpiredEntries(cache);
    
    fs.writeFileSync(cachePath, JSON.stringify(cleanedCache, null, 2));
    logger.debug('Cache saved', { entries: Object.keys(cleanedCache.entries).length });
  } catch (error) {
    logger.debug('Failed to save cache', { error });
  }
}

/**
 * Create empty cache store
 */
export function createEmptyCache(): CacheStore {
  return {
    version: CACHE_VERSION,
    entries: {}
  };
}

/**
 * Clean expired entries from cache
 */
export function cleanExpiredEntries(cache: CacheStore): CacheStore {
  const now = Date.now();
  const cleanedEntries: Record<string, CacheEntry> = {};
  
  for (const [filePath, entry] of Object.entries(cache.entries)) {
    if (now - entry.timestamp < CACHE_TTL) {
      cleanedEntries[filePath] = entry;
    }
  }
  
  return {
    version: cache.version,
    entries: cleanedEntries
  };
}

/**
 * Get cached analysis result if valid
 */
export function getCachedResult(
  cache: CacheStore,
  filePath: string,
  content: string
): AnalysisResult | null {
  const entry = cache.entries[filePath];
  
  if (!entry) {
    return null;
  }
  
  const currentHash = computeFileHash(content);
  
  // Check if hash matches and entry is not expired
  if (entry.hash === currentHash && Date.now() - entry.timestamp < CACHE_TTL) {
    logger.debug('Cache hit', { filePath });
    return entry.result;
  }
  
  logger.debug('Cache miss', { filePath, reason: entry.hash !== currentHash ? 'hash mismatch' : 'expired' });
  return null;
}

/**
 * Store analysis result in cache
 */
export function setCachedResult(
  cache: CacheStore,
  filePath: string,
  content: string,
  result: AnalysisResult
): void {
  cache.entries[filePath] = {
    hash: computeFileHash(content),
    result,
    timestamp: Date.now(),
    version: CACHE_VERSION
  };
}

/**
 * Invalidate cache entry for a file
 */
export function invalidateCacheEntry(cache: CacheStore, filePath: string): void {
  delete cache.entries[filePath];
}

/**
 * Clear all cache entries
 */
export function clearCache(projectPath: string): void {
  const cachePath = getCacheFilePath(projectPath);
  
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      logger.debug('Cache cleared');
    }
  } catch (error) {
    logger.debug('Failed to clear cache', { error });
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache: CacheStore): {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  let oldestEntry: number | null = null;
  let newestEntry: number | null = null;
  
  for (const entry of Object.values(cache.entries)) {
    if (now - entry.timestamp < CACHE_TTL) {
      validEntries++;
    } else {
      expiredEntries++;
    }
    
    if (oldestEntry === null || entry.timestamp < oldestEntry) {
      oldestEntry = entry.timestamp;
    }
    if (newestEntry === null || entry.timestamp > newestEntry) {
      newestEntry = entry.timestamp;
    }
  }
  
  return {
    totalEntries: Object.keys(cache.entries).length,
    validEntries,
    expiredEntries,
    oldestEntry,
    newestEntry
  };
}

/**
 * AnalysisCacheManager - High-level API for managing analysis cache
 */
export class AnalysisCacheManager {
  private projectPath: string;
  private cache: CacheStore;
  private dirty: boolean = false;
  
  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.cache = loadCache(projectPath);
  }
  
  /**
   * Get cached result or null if not found/invalid
   */
  get(filePath: string, content: string): AnalysisResult | null {
    return getCachedResult(this.cache, filePath, content);
  }
  
  /**
   * Store result in cache
   */
  set(filePath: string, content: string, result: AnalysisResult): void {
    setCachedResult(this.cache, filePath, content, result);
    this.dirty = true;
  }
  
  /**
   * Invalidate a specific file
   */
  invalidate(filePath: string): void {
    invalidateCacheEntry(this.cache, filePath);
    this.dirty = true;
  }
  
  /**
   * Save cache to disk if modified
   */
  save(): void {
    if (this.dirty) {
      saveCache(this.projectPath, this.cache);
      this.dirty = false;
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    return getCacheStats(this.cache);
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    clearCache(this.projectPath);
    this.cache = createEmptyCache();
    this.dirty = false;
  }
}
