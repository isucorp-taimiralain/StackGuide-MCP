/**
 * Storage Layer Types
 * Defines interfaces for persistent storage (SQLite/JSON)
 * @version 3.5.0
 */

import type { UserConfiguration, ProjectType } from '../config/types.js';

// ============================================================================
// Storage Provider Types (for future database adapters)
// ============================================================================

/**
 * Supported storage backends
 * - 'sqlite': Local SQLite database (default, good for development/single-node)
 * - 'postgres': PostgreSQL (recommended for production, supports horizontal scaling)
 * - 'memory': In-memory storage (for testing only)
 */
export type StorageProviderType = 'sqlite' | 'postgres' | 'memory';

/**
 * Provider-specific connection options
 */
export interface PostgresConnectionOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
}

// ============================================================================
// Config Store Interface
// ============================================================================

export interface SavedConfig {
  id: string;
  name: string;
  projectType: ProjectType;
  createdAt: string;
  updatedAt: string;
  data: UserConfiguration;
}

export interface ConfigStore {
  /** Initialize storage (create tables/files if needed) */
  init(): Promise<void>;
  
  /** Get active configuration */
  getActive(): Promise<SavedConfig | null>;
  
  /** Set active configuration */
  setActive(config: UserConfiguration): Promise<void>;
  
  /** Save configuration with name */
  save(name: string, config: UserConfiguration): Promise<SavedConfig>;
  
  /** Load configuration by ID */
  load(id: string): Promise<SavedConfig | null>;
  
  /** List all saved configurations */
  list(): Promise<SavedConfig[]>;
  
  /** Delete configuration by ID */
  delete(id: string): Promise<boolean>;
  
  /** Export configuration as JSON string */
  export(id: string): Promise<string | null>;
  
  /** Import configuration from JSON string */
  import(json: string): Promise<SavedConfig>;
  
  /** Close storage connection */
  close(): Promise<void>;
}

// ============================================================================
// Rule Store Interface
// ============================================================================

export interface StoredRule {
  id: string;
  projectType: ProjectType;
  category: string;
  name: string;
  content: string;
  enabled: boolean;
  source: 'user' | 'project' | 'cursor';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface RuleStore {
  /** Initialize storage */
  init(): Promise<void>;
  
  /** Create a new rule */
  create(rule: Omit<StoredRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredRule>;
  
  /** Get rule by ID */
  get(id: string): Promise<StoredRule | null>;
  
  /** List rules with optional filters */
  list(filters?: {
    projectType?: ProjectType;
    category?: string;
    source?: StoredRule['source'];
    enabled?: boolean;
  }): Promise<StoredRule[]>;
  
  /** Update rule by ID */
  update(id: string, updates: Partial<Omit<StoredRule, 'id' | 'createdAt'>>): Promise<StoredRule | null>;
  
  /** Delete rule by ID */
  delete(id: string): Promise<boolean>;
  
  /** Enable/disable rule */
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  
  /** Import multiple rules */
  importBatch(rules: Omit<StoredRule, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<StoredRule[]>;
  
  /** Export rules as JSON */
  exportAll(filters?: { projectType?: ProjectType }): Promise<string>;
  
  /** Close storage */
  close(): Promise<void>;
}

// ============================================================================
// Cache Store Interface (for HTTP cache, analysis cache)
// ============================================================================

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: string;
  expiresAt: string | null;
  etag?: string;
  lastModified?: string;
  metadata?: Record<string, unknown>;
}

export interface CacheStore {
  /** Initialize cache storage */
  init(): Promise<void>;
  
  /** Get cached value */
  get<T = unknown>(key: string): Promise<CacheEntry<T> | null>;
  
  /** Set cached value with optional TTL (seconds) */
  set<T = unknown>(key: string, value: T, options?: {
    ttl?: number;
    etag?: string;
    lastModified?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  
  /** Check if key exists and is not expired */
  has(key: string): Promise<boolean>;
  
  /** Delete cached value */
  delete(key: string): Promise<boolean>;
  
  /** Delete expired entries */
  prune(): Promise<number>;
  
  /** Clear all cache */
  clear(): Promise<void>;
  
  /** Get cache stats */
  stats(): Promise<{
    totalEntries: number;
    totalSize: number;
    expiredEntries: number;
  }>;
  
  /** Close storage */
  close(): Promise<void>;
}

// ============================================================================
// Storage Manager (unified access)
// ============================================================================

export interface StorageManager {
  config: ConfigStore;
  rules: RuleStore;
  cache: CacheStore;
  
  /** Initialize all stores */
  init(): Promise<void>;
  
  /** Close all stores */
  close(): Promise<void>;
  
  /** Run migrations if needed */
  migrate(): Promise<void>;
  
  /** Get storage stats */
  stats(): Promise<{
    configs: number;
    rules: number;
    cacheEntries: number;
    dbSize: number;
  }>;
}

// ============================================================================
// Storage Options
// ============================================================================

export interface StorageOptions {
  /** Storage provider type (default: 'sqlite') */
  provider?: StorageProviderType;
  
  /** Base directory for storage (default: ~/.stackguide) */
  baseDir?: string;
  
  /** Database filename (default: stackguide.db) */
  dbName?: string;
  
  /** Enable WAL mode for SQLite (default: true) */
  walMode?: boolean;
  
  /** Cache TTL in seconds (default: 604800 = 7 days) */
  defaultCacheTTL?: number;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** PostgreSQL connection options (required when provider='postgres') */
  postgres?: PostgresConnectionOptions;
}

export const DEFAULT_STORAGE_OPTIONS: Required<Omit<StorageOptions, 'postgres'>> & { postgres?: PostgresConnectionOptions } = {
  provider: 'sqlite',
  baseDir: '',  // Will be set to ~/.stackguide at runtime
  dbName: 'stackguide.db',
  walMode: true,
  defaultCacheTTL: 604800, // 7 days
  debug: false,
  postgres: undefined
};

// ============================================================================
// Storage Factory (for future provider implementations)
// ============================================================================

/**
 * Factory function type for creating storage managers
 * Implement this for each provider (SQLite, Postgres, etc.)
 */
export type StorageFactory = (options: StorageOptions) => Promise<StorageManager>;
