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
  checksum?: string;
}

const CACHE_VERSION = '1.0.0';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR = '.stackguide';
const CACHE_FILE = 'analysis-cache.json';
const MAX_CACHE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CACHE_ENTRIES = 2000;
const CACHE_DIR_MODE = 0o700;
const CACHE_FILE_MODE = 0o600;
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const INTEGRITY_ENV_KEY = 'STACKGUIDE_INTEGRITY_KEY';

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

function isPathInside(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

function isSymbolicLink(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${parts.join(',')}}`;
}

function computeCacheChecksum(entries: Record<string, CacheEntry>): string {
  const payload = stableStringify(entries);
  const secret = process.env[INTEGRITY_ENV_KEY];
  if (secret) {
    return `hmac:${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  }
  return `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyCacheChecksum(checksum: string, entries: Record<string, CacheEntry>): boolean {
  if (checksum.startsWith('hmac:')) {
    const secret = process.env[INTEGRITY_ENV_KEY];
    if (!secret) {
      logger.warn('HMAC cache checksum found but STACKGUIDE_INTEGRITY_KEY is missing');
      return false;
    }
    const payload = stableStringify(entries);
    const expected = `hmac:${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    return timingSafeEqualString(checksum, expected);
  }

  if (checksum.startsWith('sha256:')) {
    const payload = stableStringify(entries);
    const expected = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
    return timingSafeEqualString(checksum, expected);
  }

  // Backward compatibility with old plain SHA256 hex.
  const legacyExpected = crypto.createHash('sha256').update(stableStringify(entries)).digest('hex');
  return timingSafeEqualString(checksum, legacyExpected);
}

function sanitizeCacheStore(raw: unknown): CacheStore | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const input = raw as { version?: unknown; entries?: unknown; checksum?: unknown };
  if (typeof input.version !== 'string' || !input.entries || typeof input.entries !== 'object') {
    return null;
  }

  const sanitizedEntries: Record<string, CacheEntry> = {};
  const rawEntries = input.entries as Record<string, unknown>;

  for (const [filePath, value] of Object.entries(rawEntries)) {
    if (
      !filePath ||
      filePath.length > 2048 ||
      RESERVED_KEYS.has(filePath)
    ) {
      continue;
    }

    if (!value || typeof value !== 'object') {
      continue;
    }

    const entry = value as {
      hash?: unknown;
      result?: unknown;
      timestamp?: unknown;
      version?: unknown;
    };

    if (
      typeof entry.hash !== 'string' ||
      !/^[a-f0-9]{16}$/i.test(entry.hash) ||
      typeof entry.timestamp !== 'number' ||
      !Number.isFinite(entry.timestamp) ||
      entry.timestamp <= 0 ||
      typeof entry.version !== 'string' ||
      !entry.result
    ) {
      continue;
    }

    sanitizedEntries[filePath] = {
      hash: entry.hash,
      result: entry.result as AnalysisResult,
      timestamp: entry.timestamp,
      version: entry.version,
    };
  }

  return {
    version: input.version,
    entries: sanitizedEntries,
    checksum: typeof input.checksum === 'string' ? input.checksum : undefined,
  };
}

function enforceEntryLimit(cache: CacheStore): CacheStore {
  const entries = Object.entries(cache.entries);
  if (entries.length <= MAX_CACHE_ENTRIES) {
    return cache;
  }

  const limitedEntries = entries
    .sort((a, b) => b[1].timestamp - a[1].timestamp)
    .slice(0, MAX_CACHE_ENTRIES);

  logger.warn('Cache entry limit exceeded, trimming old entries', {
    limit: MAX_CACHE_ENTRIES,
    previousCount: entries.length,
  });

  return {
    version: cache.version,
    entries: Object.fromEntries(limitedEntries),
  };
}

/**
 * Load cache from disk
 */
export function loadCache(projectPath: string): CacheStore {
  const cachePath = getCacheFilePath(projectPath);
  const cacheDir = getCacheDir(projectPath);
  
  try {
    if (!isPathInside(projectPath, cachePath)) {
      logger.warn('Cache path escapes project boundary, ignoring cache', { projectPath, cachePath });
      return createEmptyCache();
    }

    if (isSymbolicLink(cacheDir) || isSymbolicLink(cachePath)) {
      logger.warn('Symlink detected in cache path, ignoring cache', { cachePath });
      return createEmptyCache();
    }

    if (fs.existsSync(cachePath)) {
      const stats = fs.statSync(cachePath);
      if (!stats.isFile()) {
        logger.warn('Cache path is not a file, ignoring cache', { cachePath });
        return createEmptyCache();
      }
      if (stats.size > MAX_CACHE_FILE_SIZE_BYTES) {
        logger.warn('Cache file too large, ignoring cache', {
          cachePath,
          size: stats.size,
          maxSize: MAX_CACHE_FILE_SIZE_BYTES,
        });
        return createEmptyCache();
      }

      const data = fs.readFileSync(cachePath, 'utf-8');
      const parsed = JSON.parse(data) as unknown;
      const cache = sanitizeCacheStore(parsed);
      if (!cache) {
        logger.warn('Invalid cache structure, starting fresh');
        return createEmptyCache();
      }
      
      // Invalidate cache if version mismatch
      if (cache.version !== CACHE_VERSION) {
        logger.debug('Cache version mismatch, starting fresh');
        return createEmptyCache();
      }

      if (cache.checksum) {
        if (!verifyCacheChecksum(cache.checksum, cache.entries)) {
          logger.warn('Cache checksum mismatch, possible tampering detected. Resetting cache.', { cachePath });
          return createEmptyCache();
        }
      }
      
      return enforceEntryLimit(cleanExpiredEntries(cache));
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
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  
  try {
    if (!isPathInside(projectPath, cachePath)) {
      throw new Error('Cache path escapes project boundary');
    }
    if (isSymbolicLink(cacheDir) || isSymbolicLink(cachePath)) {
      throw new Error('Refusing to write cache through symbolic link');
    }

    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true, mode: CACHE_DIR_MODE });
    }
    
    // Clean expired entries before saving
    const cleanedCache = enforceEntryLimit(cleanExpiredEntries(cache));
    const signedCache: CacheStore = {
      version: CACHE_VERSION,
      entries: cleanedCache.entries,
      checksum: computeCacheChecksum(cleanedCache.entries),
    };

    fs.writeFileSync(tempPath, JSON.stringify(signedCache, null, 2), { mode: CACHE_FILE_MODE });
    fs.renameSync(tempPath, cachePath);
    fs.chmodSync(cachePath, CACHE_FILE_MODE);
    logger.debug('Cache saved', { entries: Object.keys(signedCache.entries).length });
  } catch (error) {
    logger.debug('Failed to save cache', { error });
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Create empty cache store
 */
export function createEmptyCache(): CacheStore {
  return {
    version: CACHE_VERSION,
    entries: {},
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
    entries: cleanedEntries,
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
      if (isSymbolicLink(cachePath)) {
        logger.warn('Refusing to clear cache through symbolic link', { cachePath });
        return;
      }
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
