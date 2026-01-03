/**
 * Rules Engine Tests
 * @version 3.7.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rulesRegistry,
  registerBuiltinRule,
  addCustomRule,
  removeCustomRule,
  getRule,
  getRules,
  getRulesForFile,
  setRuleEnabled,
  setRuleOverride,
  getRuleStats,
  resetRulesEngine,
  exportRulesConfig,
  importRulesConfig,
  type RuleDefinition,
  type RuleConfig
} from '../src/services/rulesEngine.js';

// Mock persistence
vi.mock('../src/config/persistence.js', () => ({
  getStorage: vi.fn(() => null),
  setStorage: vi.fn()
}));

describe('Rules Engine', () => {
  beforeEach(() => {
    resetRulesEngine();
  });

  describe('Builtin Rules', () => {
    it('should register a builtin rule', () => {
      const rule: RuleDefinition = {
        id: 'builtin-001',
        name: 'Test Rule',
        description: 'A test builtin rule',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'This is a test message',
        source: 'builtin'
      };

      registerBuiltinRule(rule);
      
      const retrieved = getRule('builtin-001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('builtin-001');
      expect(retrieved?.source).toBe('builtin');
    });

    it('should not allow custom rules to override builtin rules', () => {
      const builtinRule: RuleDefinition = {
        id: 'no-eval',
        name: 'No eval',
        description: 'Disallow eval()',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'Avoid using eval()',
        source: 'builtin'
      };

      registerBuiltinRule(builtinRule);

      const customRule: RuleDefinition = {
        id: 'no-eval', // Same ID
        name: 'Custom No eval',
        description: 'Custom version',
        category: 'security',
        severity: 'warning',
        enabled: true,
        message: 'Custom message',
        source: 'custom'
      };

      const result = addCustomRule(customRule);
      expect(result.success).toBe(false);
      expect(result.error).toContain('builtin');
    });
  });

  describe('Custom Rules', () => {
    it('should add a custom rule', () => {
      const rule: RuleDefinition = {
        id: 'custom-001',
        name: 'My Custom Rule',
        description: 'A custom rule for testing',
        category: 'best-practices',
        severity: 'warning',
        enabled: true,
        message: 'Follow this best practice',
        source: 'custom'
      };

      const result = addCustomRule(rule);
      expect(result.success).toBe(true);

      const retrieved = getRule('custom-001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('My Custom Rule');
    });

    it('should validate custom rules', () => {
      const invalidRule = {
        id: '', // Invalid: empty ID
        name: 'Invalid Rule',
        description: 'This should fail',
        category: 'security',
        severity: 'error',
        message: 'Test'
      } as RuleDefinition;

      const result = addCustomRule(invalidRule);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should remove a custom rule', () => {
      const rule: RuleDefinition = {
        id: 'to-remove',
        name: 'Remove Me',
        description: 'Will be removed',
        category: 'performance',
        severity: 'info',
        enabled: true,
        message: 'Test',
        source: 'custom'
      };

      addCustomRule(rule);
      expect(getRule('to-remove')).not.toBeNull();

      const removed = removeCustomRule('to-remove');
      expect(removed).toBe(true);
      expect(getRule('to-remove')).toBeNull();
    });
  });

  describe('Rule Filtering', () => {
    beforeEach(() => {
      // Register some test rules
      registerBuiltinRule({
        id: 'sec-001',
        name: 'Security Rule 1',
        description: 'Security check',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'Security issue',
        languages: ['typescript', 'javascript'],
        source: 'builtin'
      });

      registerBuiltinRule({
        id: 'perf-001',
        name: 'Performance Rule 1',
        description: 'Performance check',
        category: 'performance',
        severity: 'warning',
        enabled: true,
        message: 'Performance issue',
        languages: ['typescript'],
        source: 'builtin'
      });

      registerBuiltinRule({
        id: 'disabled-001',
        name: 'Disabled Rule',
        description: 'This is disabled',
        category: 'code-style',
        severity: 'info',
        enabled: false,
        message: 'Style issue',
        source: 'builtin'
      });
    });

    it('should filter by category', () => {
      const securityRules = getRules({ category: 'security' });
      expect(securityRules.length).toBe(1);
      expect(securityRules[0].id).toBe('sec-001');
    });

    it('should filter by severity', () => {
      const errorRules = getRules({ severity: 'error' });
      expect(errorRules.length).toBe(1);
      expect(errorRules[0].id).toBe('sec-001');
    });

    it('should filter by language', () => {
      const tsRules = getRules({ language: 'typescript' });
      expect(tsRules.length).toBe(2);

      const jsRules = getRules({ language: 'javascript' });
      expect(jsRules.length).toBe(1);
    });

    it('should filter enabled rules by default', () => {
      const enabledRules = getRules();
      expect(enabledRules.every(r => r.enabled)).toBe(true);
      expect(enabledRules.find(r => r.id === 'disabled-001')).toBeUndefined();
    });

    it('should include disabled rules when requested', () => {
      const allRules = getRules({ enabledOnly: false });
      expect(allRules.find(r => r.id === 'disabled-001')).toBeDefined();
    });
  });

  describe('Rule Overrides', () => {
    beforeEach(() => {
      registerBuiltinRule({
        id: 'override-test',
        name: 'Override Test',
        description: 'Test overriding',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'Original message',
        source: 'builtin'
      });
    });

    it('should override rule severity', () => {
      const result = setRuleOverride('override-test', { severity: 'warning' });
      expect(result.success).toBe(true);

      const rule = getRule('override-test');
      expect(rule?.severity).toBe('warning');
    });

    it('should override rule message', () => {
      setRuleOverride('override-test', { message: 'Custom message' });

      const rule = getRule('override-test');
      expect(rule?.message).toBe('Custom message');
    });

    it('should reject override for non-existent rule', () => {
      const result = setRuleOverride('non-existent', { severity: 'info' });
      expect(result.success).toBe(false);
    });
  });

  describe('Enable/Disable', () => {
    beforeEach(() => {
      registerBuiltinRule({
        id: 'toggle-test',
        name: 'Toggle Test',
        description: 'Test toggling',
        category: 'performance',
        severity: 'warning',
        enabled: true,
        message: 'Test',
        source: 'builtin'
      });
    });

    it('should disable a specific rule', () => {
      setRuleEnabled('toggle-test', false);
      
      const rules = getRules();
      expect(rules.find(r => r.id === 'toggle-test')).toBeUndefined();
    });

    it('should re-enable a disabled rule', () => {
      setRuleEnabled('toggle-test', false);
      setRuleEnabled('toggle-test', true);
      
      const rules = getRules();
      expect(rules.find(r => r.id === 'toggle-test')).toBeDefined();
    });
  });

  describe('File Pattern Matching', () => {
    beforeEach(() => {
      registerBuiltinRule({
        id: 'test-only',
        name: 'Test Only Rule',
        description: 'Only for test files',
        category: 'best-practices',
        severity: 'info',
        enabled: true,
        message: 'Test file rule',
        filePatterns: ['\\.test\\.ts$', '\\.spec\\.ts$'],
        source: 'builtin'
      });

      registerBuiltinRule({
        id: 'all-files',
        name: 'All Files Rule',
        description: 'For all files',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'All files rule',
        source: 'builtin'
      });
    });

    it('should match rules by file pattern', () => {
      const testFileRules = getRulesForFile('src/utils.test.ts');
      expect(testFileRules.find(r => r.id === 'test-only')).toBeDefined();
      expect(testFileRules.find(r => r.id === 'all-files')).toBeDefined();

      const srcFileRules = getRulesForFile('src/utils.ts');
      expect(srcFileRules.find(r => r.id === 'test-only')).toBeUndefined();
      expect(srcFileRules.find(r => r.id === 'all-files')).toBeDefined();
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      registerBuiltinRule({
        id: 'stat-1', name: 'Stat 1', description: 'Test',
        category: 'security', severity: 'error', enabled: true, message: 'Test', source: 'builtin'
      });
      registerBuiltinRule({
        id: 'stat-2', name: 'Stat 2', description: 'Test',
        category: 'security', severity: 'warning', enabled: true, message: 'Test', source: 'builtin'
      });
      registerBuiltinRule({
        id: 'stat-3', name: 'Stat 3', description: 'Test',
        category: 'performance', severity: 'info', enabled: false, message: 'Test', source: 'builtin'
      });
      addCustomRule({
        id: 'custom-stat', name: 'Custom Stat', description: 'Test',
        category: 'best-practices', severity: 'warning', enabled: true, message: 'Test', source: 'custom'
      });
    });

    it('should return correct statistics', () => {
      const stats = getRuleStats();
      
      expect(stats.totalBuiltin).toBe(3);
      expect(stats.totalCustom).toBe(1);
      expect(stats.enabled).toBe(3); // stat-1, stat-2, custom-stat
      expect(stats.disabled).toBe(1); // stat-3
      expect(stats.byCategory.security).toBe(2);
      expect(stats.byCategory['best-practices']).toBe(1);
      expect(stats.bySeverity.error).toBe(1);
      expect(stats.bySeverity.warning).toBe(2);
    });
  });

  describe('Import/Export', () => {
    it('should export configuration', () => {
      addCustomRule({
        id: 'export-test',
        name: 'Export Test',
        description: 'For export',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'Test',
        source: 'custom'
      });

      const config = exportRulesConfig();
      
      expect(config.version).toBe('1.0.0');
      expect(config.rules.length).toBe(1);
      expect(config.rules[0].id).toBe('export-test');
    });

    it('should import configuration', () => {
      const config: RuleConfig = {
        version: '1.0.0',
        rules: [
          {
            id: 'imported-rule',
            name: 'Imported Rule',
            description: 'From import',
            category: 'performance',
            severity: 'warning',
            enabled: true,
            message: 'Imported',
            source: 'custom'
          }
        ],
        overrides: {},
        disabledCategories: [],
        disabledRules: [],
        settings: {
          maxIssuesPerFile: 100,
          maxIssuesTotal: 1000,
          failOnError: true,
          failOnWarning: true,
          autoFix: false,
          verboseOutput: true
        }
      };

      const result = importRulesConfig(config);
      expect(result.success).toBe(true);
      expect(result.imported).toBe(1);

      const rule = getRule('imported-rule');
      expect(rule).not.toBeNull();
      expect(rule?.name).toBe('Imported Rule');
    });
  });

  describe('Reset', () => {
    it('should reset to defaults', () => {
      addCustomRule({
        id: 'will-be-reset',
        name: 'Reset Test',
        description: 'Test reset',
        category: 'security',
        severity: 'error',
        enabled: true,
        message: 'Test',
        source: 'custom'
      });

      expect(getRule('will-be-reset')).not.toBeNull();

      resetRulesEngine();

      expect(getRule('will-be-reset')).toBeNull();
    });
  });
});
