/**
 * SQLite Storage Implementation
 * Persistent storage using better-sqlite3
 * @version 3.4.0
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import type {
  ConfigStore,
  RuleStore,
  CacheStore,
  StorageManager,
  StorageOptions,
  SavedConfig,
  StoredRule,
  CacheEntry,
  DEFAULT_STORAGE_OPTIONS
} from './types.js';
import type { UserConfiguration, ProjectType } from '../config/types.js';

// ============================================================================
// Security Constants and Validation
// ============================================================================

// Maximum lengths for user-provided strings
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 100;
const MAX_KEY_LENGTH = 500;
const MAX_CONTENT_LENGTH = 500000; // 500KB
const MAX_JSON_DEPTH = 10;

// Allowed characters for IDs (alphanumeric, dash, underscore, dot)
const SAFE_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

// Dangerous path patterns
const PATH_TRAVERSAL_PATTERNS = [
  '..',
  '~',
  '$',
  '%',
  '\\',
  '\0',
];

/**
 * Validate and sanitize a storage path to prevent path traversal
 */
function validateStoragePath(basePath: string, allowedBase: string): string {
  // Resolve to absolute path
  const resolved = path.resolve(basePath);
  const resolvedBase = path.resolve(allowedBase);
  
  // Check for path traversal attempts
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (basePath.includes(pattern)) {
      logger.warn('Path traversal attempt detected', { path: basePath, pattern });
      throw new Error(`Invalid storage path: contains forbidden pattern`);
    }
  }
  
  // Ensure path is within allowed base
  if (!resolved.startsWith(resolvedBase)) {
    logger.warn('Path escape attempt detected', { path: basePath, resolved, allowedBase });
    throw new Error(`Invalid storage path: must be within ${allowedBase}`);
  }
  
  return resolved;
}

/**
 * Validate ID format to prevent injection
 */
function validateId(id: string, fieldName: string = 'id'): string {
  if (!id || typeof id !== 'string') {
    throw new Error(`${fieldName} is required`);
  }
  
  if (id.length > MAX_ID_LENGTH) {
    throw new Error(`${fieldName} exceeds maximum length (${MAX_ID_LENGTH})`);
  }
  
  // IDs can contain alphanumeric, dash, underscore, dot
  if (!SAFE_ID_REGEX.test(id)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  
  return id;
}

/**
 * Validate and sanitize a name field
 */
function validateName(name: string, fieldName: string = 'name'): string {
  if (!name || typeof name !== 'string') {
    throw new Error(`${fieldName} is required`);
  }
  
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`${fieldName} exceeds maximum length (${MAX_NAME_LENGTH})`);
  }
  
  // Strip control characters but allow most printable
  return name.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

/**
 * Validate cache key format
 */
function validateCacheKey(key: string): string {
  if (!key || typeof key !== 'string') {
    throw new Error('Cache key is required');
  }
  
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Cache key exceeds maximum length (${MAX_KEY_LENGTH})`);
  }
  
  // Strip null bytes and control chars
  return key.replace(/[\x00-\x1f\x7f]/g, '');
}

/**
 * Validate content length
 */
function validateContent(content: string): string {
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }
  
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Content exceeds maximum length (${MAX_CONTENT_LENGTH})`);
  }
  
  return content;
}

/**
 * Safe JSON parse with depth limit
 */
function safeJsonParse<T>(json: string, maxDepth: number = MAX_JSON_DEPTH): T {
  const parsed = JSON.parse(json);
  
  function checkDepth(obj: unknown, depth: number): void {
    if (depth > maxDepth) {
      throw new Error(`JSON nesting exceeds maximum depth (${maxDepth})`);
    }
    if (obj && typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        checkDepth(value, depth + 1);
      }
    }
  }
  
  checkDepth(parsed, 0);
  return parsed;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultBaseDir(): string {
  return path.join(os.homedir(), '.stackguide');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ============================================================================
// SQLite Config Store
// ============================================================================

export class SQLiteConfigStore implements ConfigStore {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL,
        is_active INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_configs_name ON configs(name);
      CREATE INDEX IF NOT EXISTS idx_configs_active ON configs(is_active);
    `);
  }
  
  async getActive(): Promise<SavedConfig | null> {
    const row = this.db.prepare(
      'SELECT * FROM configs WHERE is_active = 1 LIMIT 1'
    ).get() as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      projectType: row.project_type as ProjectType,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data: JSON.parse(row.data)
    };
  }
  
  async setActive(config: UserConfiguration): Promise<void> {
    const now = nowISO();
    
    this.db.transaction(() => {
      // Deactivate all
      this.db.prepare('UPDATE configs SET is_active = 0').run();
      
      // Check if we have an active config to update
      const existing = this.db.prepare(
        'SELECT id FROM configs WHERE name = ?'
      ).get('__active__') as any;
      
      if (existing) {
        this.db.prepare(`
          UPDATE configs 
          SET data = ?, updated_at = ?, project_type = ?, is_active = 1
          WHERE id = ?
        `).run(JSON.stringify(config), now, config.projectType || 'react-typescript', existing.id);
      } else {
        const id = generateId();
        this.db.prepare(`
          INSERT INTO configs (id, name, project_type, created_at, updated_at, data, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(id, '__active__', config.projectType || 'react-typescript', now, now, JSON.stringify(config));
      }
    })();
  }
  
  async save(name: string, config: UserConfiguration): Promise<SavedConfig> {
    const validatedName = validateName(name);
    const id = generateId();
    const now = nowISO();
    
    this.db.prepare(`
      INSERT INTO configs (id, name, project_type, created_at, updated_at, data, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, validatedName, config.projectType || 'react-typescript', now, now, JSON.stringify(config));
    
    return {
      id,
      name,
      projectType: (config.projectType || 'react-typescript') as ProjectType,
      createdAt: now,
      updatedAt: now,
      data: config
    };
  }
  
  async load(id: string): Promise<SavedConfig | null> {
    const validatedId = validateId(id);
    const row = this.db.prepare('SELECT * FROM configs WHERE id = ?').get(validatedId) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      projectType: row.project_type as ProjectType,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data: JSON.parse(row.data)
    };
  }
  
  async list(): Promise<SavedConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM configs WHERE name != ? ORDER BY updated_at DESC'
    ).all('__active__') as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      projectType: row.project_type as ProjectType,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data: JSON.parse(row.data)
    }));
  }
  
  async delete(id: string): Promise<boolean> {
    const validatedId = validateId(id);
    const result = this.db.prepare('DELETE FROM configs WHERE id = ?').run(validatedId);
    return result.changes > 0;
  }
  
  async export(id: string): Promise<string | null> {
    const validatedId = validateId(id);
    const config = await this.load(validatedId);
    if (!config) return null;
    return JSON.stringify(config, null, 2);
  }
  
  async import(json: string): Promise<SavedConfig> {
    const parsed = safeJsonParse<{ data?: UserConfiguration; name?: string }>(json);
    const config = parsed.data || (parsed as unknown as UserConfiguration);
    const name = validateName(parsed.name || `imported-${Date.now()}`);
    return this.save(name, config);
  }
  
  async close(): Promise<void> {
    // Handled by StorageManager
  }
}

// ============================================================================
// SQLite Rule Store
// ============================================================================

export class SQLiteRuleStore implements RuleStore {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        project_type TEXT NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_rules_project ON rules(project_type);
      CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
      CREATE INDEX IF NOT EXISTS idx_rules_source ON rules(source);
    `);
  }
  
  async create(rule: Omit<StoredRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredRule> {
    // Validate inputs
    const validatedName = validateName(rule.name, 'rule name');
    const validatedCategory = validateName(rule.category, 'category');
    const validatedContent = validateContent(rule.content);
    
    const id = `${rule.source}-${rule.projectType}-${validatedCategory}-${validatedName}`.replace(/\s+/g, '-');
    const now = nowISO();
    
    this.db.prepare(`
      INSERT OR REPLACE INTO rules 
      (id, project_type, category, name, content, enabled, source, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      rule.projectType,
      validatedCategory,
      validatedName,
      validatedContent,
      rule.enabled ? 1 : 0,
      rule.source,
      now,
      now,
      rule.metadata ? JSON.stringify(rule.metadata) : null
    );
    
    return {
      id,
      ...rule,
      createdAt: now,
      updatedAt: now
    };
  }
  
  async get(id: string): Promise<StoredRule | null> {
    const validatedId = validateId(id, 'rule id');
    const row = this.db.prepare('SELECT * FROM rules WHERE id = ?').get(validatedId) as any;
    
    if (!row) return null;
    
    return this.rowToRule(row);
  }
  
  async list(filters?: {
    projectType?: ProjectType;
    category?: string;
    source?: StoredRule['source'];
    enabled?: boolean;
  }): Promise<StoredRule[]> {
    let sql = 'SELECT * FROM rules WHERE 1=1';
    const params: any[] = [];
    
    if (filters?.projectType) {
      sql += ' AND project_type = ?';
      params.push(filters.projectType);
    }
    if (filters?.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters?.source) {
      sql += ' AND source = ?';
      params.push(filters.source);
    }
    if (filters?.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(filters.enabled ? 1 : 0);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToRule(row));
  }
  
  async update(id: string, updates: Partial<Omit<StoredRule, 'id' | 'createdAt'>>): Promise<StoredRule | null> {
    const validatedId = validateId(id, 'rule id');
    const existing = await this.get(validatedId);
    if (!existing) return null;
    
    // Validate any updated fields
    if (updates.name) updates.name = validateName(updates.name, 'rule name');
    if (updates.category) updates.category = validateName(updates.category, 'category');
    if (updates.content) updates.content = validateContent(updates.content);
    
    const now = nowISO();
    const updated = { ...existing, ...updates, updatedAt: now };
    
    this.db.prepare(`
      UPDATE rules SET
        project_type = ?,
        category = ?,
        name = ?,
        content = ?,
        enabled = ?,
        source = ?,
        updated_at = ?,
        metadata = ?
      WHERE id = ?
    `).run(
      updated.projectType,
      updated.category,
      updated.name,
      updated.content,
      updated.enabled ? 1 : 0,
      updated.source,
      now,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      validatedId
    );
    
    return updated;
  }
  
  async delete(id: string): Promise<boolean> {
    const validatedId = validateId(id, 'rule id');
    const result = this.db.prepare('DELETE FROM rules WHERE id = ?').run(validatedId);
    return result.changes > 0;
  }
  
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const validatedId = validateId(id, 'rule id');
    const result = this.db.prepare(
      'UPDATE rules SET enabled = ?, updated_at = ? WHERE id = ?'
    ).run(enabled ? 1 : 0, nowISO(), validatedId);
    return result.changes > 0;
  }
  
  async importBatch(rules: Omit<StoredRule, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<StoredRule[]> {
    const results: StoredRule[] = [];
    
    this.db.transaction(() => {
      for (const rule of rules) {
        const created = this.createSync(rule);
        results.push(created);
      }
    })();
    
    return results;
  }
  
  private createSync(rule: Omit<StoredRule, 'id' | 'createdAt' | 'updatedAt'>): StoredRule {
    // Validate inputs
    const validatedName = validateName(rule.name, 'rule name');
    const validatedCategory = validateName(rule.category, 'category');
    const validatedContent = validateContent(rule.content);
    
    const id = `${rule.source}-${rule.projectType}-${validatedCategory}-${validatedName}`.replace(/\s+/g, '-');
    const now = nowISO();
    
    this.db.prepare(`
      INSERT OR REPLACE INTO rules 
      (id, project_type, category, name, content, enabled, source, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      rule.projectType,
      validatedCategory,
      validatedName,
      validatedContent,
      rule.enabled ? 1 : 0,
      rule.source,
      now,
      now,
      rule.metadata ? JSON.stringify(rule.metadata) : null
    );
    
    return { 
      id, 
      ...rule, 
      name: validatedName,
      category: validatedCategory,
      content: validatedContent,
      createdAt: now, 
      updatedAt: now 
    };
  }
  
  async exportAll(filters?: { projectType?: ProjectType }): Promise<string> {
    const rules = await this.list(filters);
    return JSON.stringify(rules, null, 2);
  }
  
  async close(): Promise<void> {
    // Handled by StorageManager
  }
  
  private rowToRule(row: any): StoredRule {
    return {
      id: row.id,
      projectType: row.project_type as ProjectType,
      category: row.category,
      name: row.name,
      content: row.content,
      enabled: row.enabled === 1,
      source: row.source as StoredRule['source'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}

// ============================================================================
// SQLite Cache Store
// ============================================================================

export class SQLiteCacheStore implements CacheStore {
  private db: Database.Database;
  private defaultTTL: number;
  
  constructor(db: Database.Database, defaultTTL: number = 604800) {
    this.db = db;
    this.defaultTTL = defaultTTL;
  }
  
  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        etag TEXT,
        last_modified TEXT,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
    `);
  }
  
  async get<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    const validatedKey = validateCacheKey(key);
    const row = this.db.prepare('SELECT * FROM cache WHERE key = ?').get(validatedKey) as any;
    
    if (!row) return null;
    
    // Check expiration
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      await this.delete(key);
      return null;
    }
    
    return {
      key: row.key,
      value: JSON.parse(row.value) as T,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      etag: row.etag,
      lastModified: row.last_modified,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
  
  async set<T = unknown>(key: string, value: T, options?: {
    ttl?: number;
    etag?: string;
    lastModified?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const validatedKey = validateCacheKey(key);
    const now = nowISO();
    const ttl = options?.ttl ?? this.defaultTTL;
    const expiresAt = ttl > 0 
      ? new Date(Date.now() + ttl * 1000).toISOString() 
      : null;
    
    this.db.prepare(`
      INSERT OR REPLACE INTO cache 
      (key, value, created_at, expires_at, etag, last_modified, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      validatedKey,
      JSON.stringify(value),
      now,
      expiresAt,
      options?.etag ?? null,
      options?.lastModified ?? null,
      options?.metadata ? JSON.stringify(options.metadata) : null
    );
  }
  
  async has(key: string): Promise<boolean> {
    const validatedKey = validateCacheKey(key);
    const entry = await this.get(validatedKey);
    return entry !== null;
  }
  
  async delete(key: string): Promise<boolean> {
    const validatedKey = validateCacheKey(key);
    const result = this.db.prepare('DELETE FROM cache WHERE key = ?').run(validatedKey);
    return result.changes > 0;
  }
  
  async prune(): Promise<number> {
    const now = nowISO();
    const result = this.db.prepare(
      'DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < ?'
    ).run(now);
    return result.changes;
  }
  
  async clear(): Promise<void> {
    this.db.exec('DELETE FROM cache');
  }
  
  async stats(): Promise<{
    totalEntries: number;
    totalSize: number;
    expiredEntries: number;
  }> {
    const now = nowISO();
    
    const total = this.db.prepare('SELECT COUNT(*) as count FROM cache').get() as any;
    const expired = this.db.prepare(
      'SELECT COUNT(*) as count FROM cache WHERE expires_at IS NOT NULL AND expires_at < ?'
    ).get(now) as any;
    const size = this.db.prepare(
      'SELECT SUM(LENGTH(value)) as size FROM cache'
    ).get() as any;
    
    return {
      totalEntries: total.count,
      totalSize: size.size || 0,
      expiredEntries: expired.count
    };
  }
  
  async close(): Promise<void> {
    // Handled by StorageManager
  }
}

// ============================================================================
// SQLite Storage Manager
// ============================================================================

export class SQLiteStorageManager implements StorageManager {
  private db: Database.Database;
  private _config: SQLiteConfigStore;
  private _rules: SQLiteRuleStore;
  private _cache: SQLiteCacheStore;
  private options: Required<StorageOptions>;
  
  constructor(options: StorageOptions = {}) {
    const defaultBase = getDefaultBaseDir();
    const baseDir = options.baseDir || defaultBase;
    
    // Security: validate dbName doesn't contain path traversal
    const dbName = options.dbName || 'stackguide.db';
    if (dbName.includes('/') || dbName.includes('\\') || dbName.includes('..')) {
      throw new Error('Invalid database name: must not contain path separators');
    }
    if (!dbName.endsWith('.db') && !dbName.endsWith('.sqlite')) {
      throw new Error('Invalid database name: must end with .db or .sqlite');
    }
    
    this.options = {
      baseDir,
      dbName,
      walMode: options.walMode ?? true,
      defaultCacheTTL: options.defaultCacheTTL ?? 604800,
      debug: options.debug ?? false
    };
    
    // Security: validate storage path is within allowed base
    // Only validate if custom baseDir is provided
    if (options.baseDir) {
      const resolved = path.resolve(baseDir);
      const home = os.homedir();
      const tmpDir = os.tmpdir();
      // Allow paths under home directory, /tmp, or system temp directory
      const isAllowed = resolved.startsWith(home) || 
                       resolved.startsWith('/tmp') || 
                       resolved.startsWith(tmpDir) ||
                       resolved.startsWith('/var/folders'); // macOS temp
      if (!isAllowed) {
        logger.warn('Storage path outside allowed directories', { path: resolved });
        throw new Error('Invalid storage path: must be within home or temp directory');
      }
    }
    
    // Ensure directory exists
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    
    const dbPath = path.join(baseDir, this.options.dbName);
    
    this.db = new Database(dbPath, {
      verbose: this.options.debug ? console.log : undefined
    });
    
    if (this.options.walMode) {
      this.db.pragma('journal_mode = WAL');
    }
    
    this._config = new SQLiteConfigStore(this.db);
    this._rules = new SQLiteRuleStore(this.db);
    this._cache = new SQLiteCacheStore(this.db, this.options.defaultCacheTTL);
  }
  
  get config(): ConfigStore {
    return this._config;
  }
  
  get rules(): RuleStore {
    return this._rules;
  }
  
  get cache(): CacheStore {
    return this._cache;
  }
  
  async init(): Promise<void> {
    await this._config.init();
    await this._rules.init();
    await this._cache.init();
    
    // Run migrations
    await this.migrate();
  }
  
  async close(): Promise<void> {
    this.db.close();
  }
  
  async migrate(): Promise<void> {
    // Schema version tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    
    const currentVersion = this.db.prepare(
      'SELECT MAX(version) as version FROM schema_version'
    ).get() as any;
    
    const version = currentVersion?.version || 0;
    
    // Future migrations go here
    // if (version < 1) { ... migrate ... }
  }
  
  async stats(): Promise<{
    configs: number;
    rules: number;
    cacheEntries: number;
    dbSize: number;
  }> {
    const configs = this.db.prepare('SELECT COUNT(*) as count FROM configs').get() as any;
    const rules = this.db.prepare('SELECT COUNT(*) as count FROM rules').get() as any;
    const cache = this.db.prepare('SELECT COUNT(*) as count FROM cache').get() as any;
    
    const dbPath = path.join(this.options.baseDir, this.options.dbName);
    const dbStats = fs.statSync(dbPath);
    
    return {
      configs: configs.count,
      rules: rules.count,
      cacheEntries: cache.count,
      dbSize: dbStats.size
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let storageInstance: SQLiteStorageManager | null = null;

export function getStorage(options?: StorageOptions): StorageManager {
  if (!storageInstance) {
    storageInstance = new SQLiteStorageManager(options);
  }
  return storageInstance;
}

export async function initStorage(options?: StorageOptions): Promise<StorageManager> {
  const storage = getStorage(options);
  await storage.init();
  return storage;
}

export async function closeStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.close();
    storageInstance = null;
  }
}
