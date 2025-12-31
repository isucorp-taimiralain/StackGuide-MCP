/**
 * Tests for Rule Manager Service
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn()
}));

vi.mock('../src/config/persistence.js', () => ({
  getConfigPath: vi.fn(() => '/mock/config/path')
}));

import {
  RULE_TEMPLATES,
  createUserRule,
  createRuleFromTemplate,
  getUserRules,
  updateUserRule,
  deleteUserRule,
  listTemplates,
  getTemplateContent,
  exportAllUserRules,
  importUserRules
} from '../src/services/ruleManager.js';

describe('ruleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('RULE_TEMPLATES', () => {
    it('should export rule templates', () => {
      expect(RULE_TEMPLATES).toBeDefined();
      expect(Object.keys(RULE_TEMPLATES).length).toBeGreaterThan(0);
    });

    it('should include coding-standard template', () => {
      expect(RULE_TEMPLATES).toHaveProperty('coding-standard');
      expect(RULE_TEMPLATES['coding-standard'].name).toBe('Coding Standard Template');
      expect(RULE_TEMPLATES['coding-standard'].content).toContain('{{RULE_NAME}}');
    });

    it('should include best-practice template', () => {
      expect(RULE_TEMPLATES).toHaveProperty('best-practice');
      expect(RULE_TEMPLATES['best-practice'].name).toBe('Best Practice Template');
    });

    it('should include security template', () => {
      expect(RULE_TEMPLATES).toHaveProperty('security');
      expect(RULE_TEMPLATES['security'].content).toContain('Risk Level');
    });

    it('should include architecture template', () => {
      expect(RULE_TEMPLATES).toHaveProperty('architecture');
      expect(RULE_TEMPLATES['architecture'].content).toContain('Diagram');
    });

    it('should include testing template', () => {
      expect(RULE_TEMPLATES).toHaveProperty('testing');
      expect(RULE_TEMPLATES['testing'].content).toContain('Coverage');
    });

    it('should have templates with {{LANGUAGE}} placeholder', () => {
      for (const template of Object.values(RULE_TEMPLATES)) {
        expect(template.content).toContain('{{LANGUAGE}}');
      }
    });
  });

  describe('createUserRule', () => {
    it('should create a user rule file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const rule = createUserRule(
        'react-typescript',
        'coding',
        'My Custom Rule',
        '# Rule content',
        'Description'
      );
      
      expect(rule.id).toContain('user-');
      expect(rule.id).toContain('react-typescript');
      expect(rule.name).toBe('My Custom Rule');
      expect(rule.content).toBe('# Rule content');
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should slugify the rule name for filename', () => {
      createUserRule(
        'react-typescript',
        'security',
        'My Rule With Spaces',
        'Content',
        'Desc'
      );
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const filepath = writeCall[0] as string;
      
      expect(filepath).toContain('my-rule-with-spaces.json');
    });

    it('should create rule without description', () => {
      const rule = createUserRule(
        'react-typescript',
        'coding',
        'No Desc Rule',
        'Content'
      );
      
      expect(rule.name).toBe('No Desc Rule');
    });
  });

  describe('createRuleFromTemplate', () => {
    it('should create rule from template', () => {
      const rule = createRuleFromTemplate(
        'react-typescript',
        'coding',
        'coding-standard',
        'TypeScript Coding Standards',
        'Follow these standards',
        'typescript'
      );
      
      expect(rule).not.toBeNull();
      expect(rule?.name).toBe('TypeScript Coding Standards');
      
      // Check that writeFileSync was called with replaced placeholders
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = JSON.parse(writeCall[1] as string);
      
      expect(content.content).toContain('TypeScript Coding Standards');
      expect(content.content).toContain('Follow these standards');
      expect(content.content).toContain('typescript');
      expect(content.content).not.toContain('{{RULE_NAME}}');
      expect(content.content).not.toContain('{{DESCRIPTION}}');
      expect(content.content).not.toContain('{{LANGUAGE}}');
    });

    it('should return null for unknown template', () => {
      const rule = createRuleFromTemplate(
        'react-typescript',
        'coding',
        'unknown-template',
        'Name',
        'Desc'
      );
      
      expect(rule).toBeNull();
    });

    it('should use default language when not specified', () => {
      createRuleFromTemplate(
        'react-typescript',
        'coding',
        'coding-standard',
        'Rule',
        'Desc'
      );
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = JSON.parse(writeCall[1] as string);
      
      expect(content.content).toContain('typescript');
    });
  });

  describe('getUserRules', () => {
    it('should return empty array when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const rules = getUserRules('react-typescript');
      
      expect(rules).toEqual([]);
    });

    it('should return parsed rules from json files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['rule1.json', 'rule2.json', 'readme.md'] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify({ id: 'rule-1', name: 'Rule 1' }))
        .mockReturnValueOnce(JSON.stringify({ id: 'rule-2', name: 'Rule 2' }));
      
      const rules = getUserRules('react-typescript');
      
      expect(rules).toHaveLength(2);
      expect(rules[0].name).toBe('Rule 1');
      expect(rules[1].name).toBe('Rule 2');
    });

    it('should skip invalid json files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['valid.json', 'invalid.json'] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify({ id: 'valid', name: 'Valid' }))
        .mockImplementationOnce(() => { throw new Error('Invalid JSON'); });
      
      const rules = getUserRules('react-typescript');
      
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('Valid');
    });

    it('should handle readdirSync error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('Permission denied'); });
      
      const rules = getUserRules('react-typescript');
      
      expect(rules).toEqual([]);
    });
  });

  describe('updateUserRule', () => {
    it('should return null for non-user rules', () => {
      const result = updateUserRule('builtin-rule', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should return null when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = updateUserRule('user-react-typescript-coding-test', { name: 'Updated' });
      
      expect(result).toBeNull();
    });

    it('should update and save rule', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['test.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        id: 'user-react-typescript-coding-test',
        name: 'Original',
        content: 'Original content'
      }));
      
      const result = updateUserRule('user-react-typescript-coding-test', {
        name: 'Updated Name',
        content: 'Updated content'
      });
      
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Name');
      expect(result?.content).toBe('Updated content');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return null when rule not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['other.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        id: 'user-react-typescript-coding-other',
        name: 'Other'
      }));
      
      const result = updateUserRule('user-react-typescript-coding-notfound', { name: 'X' });
      
      expect(result).toBeNull();
    });
  });

  describe('deleteUserRule', () => {
    it('should return false for non-user rules', () => {
      const result = deleteUserRule('builtin-rule');
      expect(result).toBe(false);
    });

    it('should return false when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = deleteUserRule('user-react-typescript-coding-test');
      
      expect(result).toBe(false);
    });

    it('should delete rule file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['test.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        id: 'user-react-typescript-coding-test',
        name: 'Test'
      }));
      
      const result = deleteUserRule('user-react-typescript-coding-test');
      
      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should return false when rule not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['other.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        id: 'user-react-typescript-coding-other',
        name: 'Other'
      }));
      
      const result = deleteUserRule('user-react-typescript-coding-notfound');
      
      expect(result).toBe(false);
    });
  });

  describe('listTemplates', () => {
    it('should return list of available templates', () => {
      const templates = listTemplates();
      
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('id');
      expect(templates[0]).toHaveProperty('name');
    });

    it('should include all defined templates', () => {
      const templates = listTemplates();
      const ids = templates.map(t => t.id);
      
      expect(ids).toContain('coding-standard');
      expect(ids).toContain('best-practice');
      expect(ids).toContain('security');
      expect(ids).toContain('architecture');
      expect(ids).toContain('testing');
    });
  });

  describe('getTemplateContent', () => {
    it('should return template content for valid id', () => {
      const content = getTemplateContent('coding-standard');
      
      expect(content).not.toBeNull();
      expect(content).toContain('{{RULE_NAME}}');
    });

    it('should return null for invalid id', () => {
      const content = getTemplateContent('nonexistent');
      expect(content).toBeNull();
    });
  });

  describe('exportAllUserRules', () => {
    it('should return empty object when no rules directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const exported = exportAllUserRules();
      
      expect(JSON.parse(exported)).toEqual({});
    });

    it('should export rules from all project type directories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce([
          { name: 'react-typescript', isDirectory: () => true },
          { name: 'python-django', isDirectory: () => true }
        ] as any)
        .mockReturnValueOnce(['rule1.json'] as any)
        .mockReturnValueOnce(['rule2.json'] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify({ id: 'rule-1', name: 'Rule 1' }))
        .mockReturnValueOnce(JSON.stringify({ id: 'rule-2', name: 'Rule 2' }));
      
      const exported = exportAllUserRules();
      const data = JSON.parse(exported);
      
      expect(data).toHaveProperty('react-typescript');
      expect(data).toHaveProperty('python-django');
    });
  });

  describe('importUserRules', () => {
    it('should import rules from json string', () => {
      const jsonData = JSON.stringify({
        'react-typescript': [
          { name: 'Imported Rule 1', content: 'Content 1', category: 'coding', description: 'Desc' },
          { name: 'Imported Rule 2', content: 'Content 2', category: 'security', description: 'Desc' }
        ]
      });
      
      const count = importUserRules(jsonData);
      
      expect(count).toBe(2);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('should return 0 for invalid json', () => {
      const count = importUserRules('invalid json {{{');
      expect(count).toBe(0);
    });

    it('should handle empty data', () => {
      const count = importUserRules('{}');
      expect(count).toBe(0);
    });

    it('should import rules from multiple project types', () => {
      const jsonData = JSON.stringify({
        'react-typescript': [
          { name: 'React Rule', content: 'Content', category: 'coding', description: '' }
        ],
        'python-django': [
          { name: 'Django Rule', content: 'Content', category: 'coding', description: '' }
        ]
      });
      
      const count = importUserRules(jsonData);
      
      expect(count).toBe(2);
    });
  });
});
