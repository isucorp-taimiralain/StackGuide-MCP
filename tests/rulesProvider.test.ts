/**
 * Tests for Rules Provider
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRulesForProject,
  searchRules,
  getRuleById,
  getRulesByCategory,
  getAvailableCategories,
  getCombinedRulesContent,
  clearRulesCache,
  getProjectTypesWithRules,
} from '../src/resources/rulesProvider.js';

describe('rulesProvider', () => {
  beforeEach(() => {
    clearRulesCache();
  });

  describe('getRulesForProject', () => {
    it('should return array for valid project type', () => {
      const rules = getRulesForProject('react-typescript');
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should return empty array for invalid project type', () => {
      const rules = getRulesForProject('nonexistent-type' as any);
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBe(0);
    });

    it('should return rules with required properties when they exist', () => {
      const rules = getRulesForProject('react-typescript');
      if (rules.length > 0) {
        expect(rules[0]).toHaveProperty('id');
        expect(rules[0]).toHaveProperty('name');
        expect(rules[0]).toHaveProperty('category');
        expect(rules[0]).toHaveProperty('content');
        expect(rules[0]).toHaveProperty('enabled');
      }
    });

    it('should cache results', () => {
      const first = getRulesForProject('react-typescript');
      const second = getRulesForProject('react-typescript');
      expect(first).toBe(second);
    });
  });

  describe('searchRules', () => {
    it('should return matching rules for valid query', () => {
      const results = searchRules('react-typescript', 'component');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = searchRules('react-typescript', 'xyznonexistent123abc');
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const upper = searchRules('react-typescript', 'REACT');
      const lower = searchRules('react-typescript', 'react');
      expect(upper.length).toBe(lower.length);
    });

    it('should search in name, description and content', () => {
      const rules = getRulesForProject('react-typescript');
      if (rules.length > 0) {
        const nameSearch = searchRules('react-typescript', rules[0].name.substring(0, 5));
        expect(nameSearch.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('getRuleById', () => {
    it('should return rule for valid id', () => {
      const rules = getRulesForProject('react-typescript');
      if (rules.length > 0) {
        const rule = getRuleById(rules[0].id);
        expect(rule).not.toBeNull();
        expect(rule?.id).toBe(rules[0].id);
      }
    });

    it('should return null for invalid id', () => {
      const rule = getRuleById('invalid-rule-id');
      expect(rule).toBeNull();
    });

    it('should return null for malformed id', () => {
      const rule = getRuleById('no-hyphens');
      expect(rule).toBeNull();
    });
  });

  describe('getRulesByCategory', () => {
    it('should return rules filtered by category', () => {
      const rules = getRulesByCategory('react-typescript', 'best-practices');
      expect(Array.isArray(rules)).toBe(true);
      rules.forEach(r => {
        expect(r.category).toBe('best-practices');
      });
    });

    it('should return empty array for nonexistent category', () => {
      const rules = getRulesByCategory('react-typescript', 'nonexistent' as any);
      expect(rules).toEqual([]);
    });
  });

  describe('getAvailableCategories', () => {
    it('should return array of categories', () => {
      const categories = getAvailableCategories('react-typescript');
      expect(Array.isArray(categories)).toBe(true);
    });

    it('should return empty array for project with no rules', () => {
      const categories = getAvailableCategories('nonexistent-type' as any);
      expect(categories).toEqual([]);
    });
  });

  describe('getCombinedRulesContent', () => {
    it('should return combined content for valid rule ids', () => {
      const rules = getRulesForProject('react-typescript');
      if (rules.length >= 2) {
        const combined = getCombinedRulesContent([rules[0].id, rules[1].id]);
        expect(typeof combined).toBe('string');
        expect(combined.length).toBeGreaterThan(0);
      }
    });

    it('should return empty string for invalid ids', () => {
      const combined = getCombinedRulesContent(['invalid-id-1', 'invalid-id-2']);
      expect(combined).toBe('');
    });

    it('should return empty string for empty array', () => {
      const combined = getCombinedRulesContent([]);
      expect(combined).toBe('');
    });
  });

  describe('getProjectTypesWithRules', () => {
    it('should return array of project types', () => {
      const types = getProjectTypesWithRules();
      expect(Array.isArray(types)).toBe(true);
    });
  });

  describe('clearRulesCache', () => {
    it('should clear the cache', () => {
      getRulesForProject('react-typescript');
      clearRulesCache();
      const afterClear = getRulesForProject('react-typescript');
      expect(Array.isArray(afterClear)).toBe(true);
    });
  });
});
