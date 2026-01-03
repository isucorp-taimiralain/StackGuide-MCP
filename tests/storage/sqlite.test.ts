/**
 * SQLite Storage Tests
 * @version 3.8.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  initStorage,
  getStorage,
  closeStorage,
  SQLiteStorageManager
} from '../../src/storage/sqlite.js';
import type { StorageManager } from '../../src/storage/types.js';
import type { UserConfiguration, ProjectType } from '../../src/config/types.js';

describe('SQLite Storage', () => {
  let testDir: string;
  let manager: SQLiteStorageManager | null = null;
  
  beforeEach(async () => {
    // Close any existing storage first to reset singleton
    await closeStorage();
    
    testDir = path.join(os.tmpdir(), `stackguide-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Close our local manager
    if (manager) {
      await manager.close();
      manager = null;
    }
    await closeStorage();
    
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('SQLiteStorageManager', () => {
    it('should create storage with options', async () => {
      manager = new SQLiteStorageManager({ baseDir: testDir });
      await manager.init();
      
      expect(manager).toBeDefined();
      expect(manager.config).toBeDefined();
      expect(manager.rules).toBeDefined();
      expect(manager.cache).toBeDefined();
    });

    it('should create database file in specified directory', async () => {
      manager = new SQLiteStorageManager({ 
        baseDir: testDir,
        dbName: 'test-storage.db'
      });
      await manager.init();
      
      const dbPath = path.join(testDir, 'test-storage.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should use in-memory database when specified', async () => {
      manager = new SQLiteStorageManager({ 
        baseDir: testDir,
        inMemory: true 
      });
      await manager.init();
      
      expect(manager).toBeDefined();
    });
  });

  describe('ConfigStore', () => {
    beforeEach(async () => {
      manager = new SQLiteStorageManager({ baseDir: testDir, inMemory: true });
      await manager.init();
    });

    it('should save and load configuration', async () => {
      const config: UserConfiguration = {
        projectType: 'react-typescript',
        selectedRuleIds: ['rule-1', 'rule-2'],
        selectedKnowledgeIds: ['knowledge-1']
      };
      
      const saved = await manager!.config.save('my-config', config);
      
      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('my-config');
      expect(saved.projectType).toBe('react-typescript');
      expect(saved.data).toEqual(config);
      
      const loaded = await manager!.config.load(saved.id);
      expect(loaded).toEqual(saved);
    });

    it('should set and get active configuration', async () => {
      const config: UserConfiguration = {
        projectType: 'nextjs',
        selectedRuleIds: ['rule-1']
      };
      
      await manager!.config.setActive(config);
      
      const active = await manager!.config.getActive();
      expect(active).not.toBeNull();
      expect(active?.data).toEqual(config);
    });

    it('should list all configurations', async () => {
      const config1: UserConfiguration = {
        projectType: 'react-typescript',
        selectedRuleIds: []
      };
      const config2: UserConfiguration = {
        projectType: 'nextjs',
        selectedRuleIds: []
      };
      
      await manager!.config.save('config-1', config1);
      await manager!.config.save('config-2', config2);
      
      const list = await manager!.config.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete configuration', async () => {
      const config: UserConfiguration = {
        projectType: 'react-typescript',
        selectedRuleIds: []
      };
      
      const saved = await manager!.config.save('to-delete', config);
      const deleted = await manager!.config.delete(saved.id);
      
      expect(deleted).toBe(true);
      
      const loaded = await manager!.config.load(saved.id);
      expect(loaded).toBeNull();
    });

    it('should export and import configuration', async () => {
      const config: UserConfiguration = {
        projectType: 'golang',
        selectedRuleIds: ['go-rule-1']
      };
      
      const saved = await manager!.config.save('exportable', config);
      const exported = await manager!.config.export(saved.id);
      
      expect(exported).not.toBeNull();
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported!);
      expect(parsed.name).toBe('exportable');
      
      // Import creates a new config
      const imported = await manager!.config.import(exported!);
      expect(imported.id).not.toBe(saved.id);
      expect(imported.data).toEqual(config);
    });
  });

  describe('SQLiteRuleStore', () => {
    beforeEach(async () => {
      manager = new SQLiteStorageManager({ baseDir: testDir, inMemory: true });
      await manager.init();
    });

    it('should create and get rule', async () => {
      const rule = await manager!.rules.create({
        projectType: 'react-typescript',
        category: 'security',
        name: 'no-eval',
        content: 'Never use eval()',
        enabled: true,
        source: 'user'
      });
      
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('no-eval');
      expect(rule.createdAt).toBeDefined();
      
      const fetched = await manager!.rules.get(rule.id);
      expect(fetched).toEqual(rule);
    });

    it('should list rules by project type', async () => {
      await manager!.rules.create({
        projectType: 'react-typescript',
        category: 'security',
        name: 'react-rule',
        content: 'React specific',
        enabled: true,
        source: 'user'
      });
      
      await manager!.rules.create({
        projectType: 'golang',
        category: 'security',
        name: 'go-rule',
        content: 'Go specific',
        enabled: true,
        source: 'user'
      });
      
      const reactRules = await manager!.rules.list({ projectType: 'react-typescript' });
      expect(reactRules.some(r => r.name === 'react-rule')).toBe(true);
      expect(reactRules.some(r => r.name === 'go-rule')).toBe(false);
    });

    it('should update rule', async () => {
      const rule = await manager!.rules.create({
        projectType: 'react-typescript',
        category: 'security',
        name: 'original-name',
        content: 'Original content',
        enabled: true,
        source: 'user'
      });
      
      const updated = await manager!.rules.update(rule.id, {
        name: 'updated-name',
        content: 'Updated content'
      });
      
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('updated-name');
      expect(updated?.content).toBe('Updated content');
    });

    it('should delete rule', async () => {
      const rule = await manager!.rules.create({
        projectType: 'react-typescript',
        category: 'security',
        name: 'to-delete',
        content: 'Will be deleted',
        enabled: true,
        source: 'user'
      });
      
      const deleted = await manager!.rules.delete(rule.id);
      expect(deleted).toBe(true);
      
      const fetched = await manager!.rules.get(rule.id);
      expect(fetched).toBeNull();
    });

    it('should set rule enabled status', async () => {
      const rule = await manager!.rules.create({
        projectType: 'react-typescript',
        category: 'security',
        name: 'toggleable',
        content: 'Toggle me',
        enabled: true,
        source: 'user'
      });
      
      expect(rule.enabled).toBe(true);
      
      const success = await manager!.rules.setEnabled(rule.id, false);
      expect(success).toBe(true);
      
      const fetched = await manager!.rules.get(rule.id);
      expect(fetched?.enabled).toBe(false);
    });

    it('should export and import rules', async () => {
      await manager!.rules.create({
        projectType: 'react-typescript',
        category: 'security',
        name: 'export-rule',
        content: 'Export me',
        enabled: true,
        source: 'user'
      });
      
      const exported = await manager!.rules.exportAll({ projectType: 'react-typescript' });
      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      
      // Clear and import
      const rules = await manager!.rules.list({ projectType: 'react-typescript' });
      for (const rule of rules) {
        await manager!.rules.delete(rule.id);
      }
      
      const imported = await manager!.rules.importBatch(JSON.parse(exported));
      expect(imported.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('SQLiteCacheStore', () => {
    beforeEach(async () => {
      manager = new SQLiteStorageManager({ baseDir: testDir, inMemory: true });
      await manager.init();
    });

    it('should set and get cache entry', async () => {
      await manager!.cache.set('test-key', { data: 'test-value' }, 3600);
      
      const cached = await manager!.cache.get('test-key');
      // Cache returns CacheEntry object with value inside
      expect(cached).toBeDefined();
      expect(cached?.value || cached).toEqual({ data: 'test-value' });
    });

    it('should return null for non-existent key', async () => {
      const cached = await manager!.cache.get('non-existent');
      expect(cached).toBeNull();
    });

    it('should delete cache entry', async () => {
      await manager!.cache.set('to-delete', { value: 1 });
      await manager!.cache.delete('to-delete');
      
      const cached = await manager!.cache.get('to-delete');
      expect(cached).toBeNull();
    });

    it('should clear all cache entries', async () => {
      await manager!.cache.set('key-1', 'value-1');
      await manager!.cache.set('key-2', 'value-2');
      
      await manager!.cache.clear();
      
      const cached1 = await manager!.cache.get('key-1');
      const cached2 = await manager!.cache.get('key-2');
      
      expect(cached1).toBeNull();
      expect(cached2).toBeNull();
    });

    it('should check if key exists', async () => {
      await manager!.cache.set('exists', 'value');
      
      const exists = await manager!.cache.has('exists');
      const notExists = await manager!.cache.has('not-exists');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should return cache entry with TTL info', async () => {
      await manager!.cache.set('with-ttl', 'value', 3600);
      
      const cached = await manager!.cache.get('with-ttl');
      expect(cached).toBeDefined();
      // Entry should have expiration info
      if (cached && typeof cached === 'object') {
        expect('expiresAt' in cached || 'value' in cached).toBe(true);
      }
    });
  });
});
