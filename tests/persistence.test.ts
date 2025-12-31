/**
 * Tests for Config Persistence
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn()
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home')
}));

import {
  SavedConfiguration,
  ConfigData,
  createConfiguration,
  getAllConfigurations,
  getConfigurationById,
  getActiveConfiguration,
  setActiveConfiguration,
  updateConfiguration,
  deleteConfiguration,
  addCustomRule,
  updateSelectedRules,
  updateSelectedKnowledge,
  exportConfiguration,
  importConfiguration,
  getConfigPath
} from '../src/config/persistence.js';

describe('persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      activeConfigurationId: null,
      configurations: []
    }));
  });

  describe('SavedConfiguration interface', () => {
    it('should accept valid configuration', () => {
      const config: SavedConfiguration = {
        id: 'config-123',
        name: 'My Project Config',
        projectType: 'react-node',
        selectedRules: ['rule-1', 'rule-2'],
        selectedKnowledge: ['knowledge-1'],
        customRules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(config.id).toBe('config-123');
      expect(config.name).toBe('My Project Config');
      expect(config.selectedRules).toHaveLength(2);
    });

    it('should allow empty arrays', () => {
      const config: SavedConfiguration = {
        id: 'empty-config',
        name: 'Empty Config',
        projectType: 'python-django',
        selectedRules: [],
        selectedKnowledge: [],
        customRules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(config.selectedRules).toEqual([]);
      expect(config.customRules).toEqual([]);
    });

    it('should include timestamps', () => {
      const now = new Date().toISOString();
      const config: SavedConfiguration = {
        id: 'timestamp-config',
        name: 'Timestamp Test',
        projectType: 'react-typescript',
        selectedRules: [],
        selectedKnowledge: [],
        customRules: [],
        createdAt: now,
        updatedAt: now,
      };

      expect(config.createdAt).toBe(now);
      expect(config.updatedAt).toBe(now);
    });
  });

  describe('ConfigData interface', () => {
    it('should accept valid config data', () => {
      const data: ConfigData = {
        configurations: [],
        lastUsed: null,
      };

      expect(data.configurations).toEqual([]);
      expect(data.lastUsed).toBeNull();
    });

    it('should accept configurations array', () => {
      const config: SavedConfiguration = {
        id: 'test',
        name: 'Test',
        projectType: 'react-node',
        selectedRules: [],
        selectedKnowledge: [],
        customRules: [],
        createdAt: '',
        updatedAt: '',
      };

      const data: ConfigData = {
        configurations: [config],
        lastUsed: 'test',
      };

      expect(data.configurations).toHaveLength(1);
      expect(data.lastUsed).toBe('test');
    });
  });

  describe('createConfiguration', () => {
    it('should create new configuration', () => {
      const config = createConfiguration('My Project', 'react-typescript');
      
      expect(config.name).toBe('My Project');
      expect(config.projectType).toBe('react-typescript');
      expect(config.id).toBeDefined();
      expect(config.selectedRules).toEqual([]);
      expect(config.selectedKnowledge).toEqual([]);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should create configuration with selected rules and knowledge', () => {
      const config = createConfiguration(
        'Full Project',
        'python-django',
        ['rule-1', 'rule-2'],
        ['knowledge-1']
      );
      
      expect(config.selectedRules).toEqual(['rule-1', 'rule-2']);
      expect(config.selectedKnowledge).toEqual(['knowledge-1']);
    });

    it('should create config directory if not exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      createConfiguration('New Project', 'react-node');
      
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getAllConfigurations', () => {
    it('should return all configurations', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: 'config-1',
        configurations: [
          { id: 'config-1', name: 'Config 1' },
          { id: 'config-2', name: 'Config 2' }
        ]
      }));
      
      const configs = getAllConfigurations();
      
      expect(configs).toHaveLength(2);
    });

    it('should return empty array when no configurations', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: []
      }));
      
      const configs = getAllConfigurations();
      
      expect(configs).toEqual([]);
    });
  });

  describe('getConfigurationById', () => {
    it('should return configuration by id', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Config 1' },
          { id: 'config-2', name: 'Config 2' }
        ]
      }));
      
      const config = getConfigurationById('config-1');
      
      expect(config?.name).toBe('Config 1');
    });

    it('should return null for unknown id', () => {
      const config = getConfigurationById('nonexistent');
      expect(config).toBeNull();
    });
  });

  describe('getActiveConfiguration', () => {
    it('should return active configuration', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: 'config-1',
        configurations: [
          { id: 'config-1', name: 'Active Config' }
        ]
      }));
      
      const config = getActiveConfiguration();
      
      expect(config?.name).toBe('Active Config');
    });

    it('should return null when no active configuration', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: []
      }));
      
      const config = getActiveConfiguration();
      
      expect(config).toBeNull();
    });
  });

  describe('setActiveConfiguration', () => {
    it('should set active configuration', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Config 1' }
        ]
      }));
      
      const result = setActiveConfiguration('config-1');
      
      expect(result?.id).toBe('config-1');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return null for unknown configuration', () => {
      const result = setActiveConfiguration('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateConfiguration', () => {
    it('should update configuration', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Old Name', projectType: 'react-node' }
        ]
      }));
      
      const result = updateConfiguration('config-1', { name: 'New Name' });
      
      expect(result?.name).toBe('New Name');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return null for unknown configuration', () => {
      const result = updateConfiguration('nonexistent', { name: 'New' });
      expect(result).toBeNull();
    });
  });

  describe('deleteConfiguration', () => {
    it('should delete configuration', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: 'config-1',
        configurations: [
          { id: 'config-1', name: 'Config 1' },
          { id: 'config-2', name: 'Config 2' }
        ]
      }));
      
      const result = deleteConfiguration('config-1');
      
      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return false for unknown configuration', () => {
      const result = deleteConfiguration('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('addCustomRule', () => {
    it('should add custom rule to configuration', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Config', customRules: [] }
        ]
      }));
      
      const rule = addCustomRule('config-1', {
        name: 'Custom Rule',
        content: 'Rule content',
        category: 'coding'
      });
      
      expect(rule).not.toBeNull();
      expect(rule?.name).toBe('Custom Rule');
      expect(rule?.id).toBeDefined();
    });

    it('should return null for unknown configuration', () => {
      const rule = addCustomRule('nonexistent', { name: 'Rule', content: '', category: 'coding' });
      expect(rule).toBeNull();
    });
  });

  describe('updateSelectedRules', () => {
    it('should update selected rules', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Config', selectedRules: [] }
        ]
      }));
      
      const result = updateSelectedRules('config-1', ['rule-1', 'rule-2']);
      
      expect(result).toBe(true);
    });

    it('should return false for unknown configuration', () => {
      const result = updateSelectedRules('nonexistent', ['rule-1']);
      expect(result).toBe(false);
    });
  });

  describe('updateSelectedKnowledge', () => {
    it('should update selected knowledge', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Config', selectedKnowledge: [] }
        ]
      }));
      
      const result = updateSelectedKnowledge('config-1', ['k-1', 'k-2']);
      
      expect(result).toBe(true);
    });

    it('should return false for unknown configuration', () => {
      const result = updateSelectedKnowledge('nonexistent', ['k-1']);
      expect(result).toBe(false);
    });
  });

  describe('exportConfiguration', () => {
    it('should export configuration as JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        activeConfigurationId: null,
        configurations: [
          { id: 'config-1', name: 'Export Me', projectType: 'react-node' }
        ]
      }));
      
      const exported = exportConfiguration('config-1');
      
      expect(exported).not.toBeNull();
      const parsed = JSON.parse(exported!);
      expect(parsed.name).toBe('Export Me');
    });

    it('should return null for unknown configuration', () => {
      const exported = exportConfiguration('nonexistent');
      expect(exported).toBeNull();
    });
  });

  describe('importConfiguration', () => {
    it('should import configuration from JSON', () => {
      const jsonData = JSON.stringify({
        id: 'old-id',
        name: 'Imported Config',
        projectType: 'react-typescript',
        selectedRules: [],
        selectedKnowledge: [],
        customRules: []
      });
      
      const imported = importConfiguration(jsonData);
      
      expect(imported).not.toBeNull();
      expect(imported?.name).toContain('Imported Config');
      expect(imported?.name).toContain('imported');
      expect(imported?.id).not.toBe('old-id');
    });

    it('should return null for invalid JSON', () => {
      const imported = importConfiguration('invalid json {{{');
      expect(imported).toBeNull();
    });
  });

  describe('getConfigPath', () => {
    it('should return config directory path', () => {
      const path = getConfigPath();
      
      expect(path).toBeDefined();
      expect(typeof path).toBe('string');
      expect(path).toContain('stackguide');
    });
  });
});
