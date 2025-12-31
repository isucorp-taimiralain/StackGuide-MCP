/**
 * Tests for Knowledge Provider
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getKnowledgeForProject,
  searchKnowledge,
  getKnowledgeById,
  getKnowledgeByCategory,
  getAvailableKnowledgeCategories,
  getCombinedKnowledgeContent,
  clearKnowledgeCache,
  getProjectTypesWithKnowledge,
} from '../src/resources/knowledgeProvider.js';

describe('knowledgeProvider', () => {
  beforeEach(() => {
    clearKnowledgeCache();
  });

  describe('getKnowledgeForProject', () => {
    it('should return array for valid project type', () => {
      const knowledge = getKnowledgeForProject('react-typescript');
      expect(Array.isArray(knowledge)).toBe(true);
    });

    it('should return empty array for invalid project type', () => {
      const knowledge = getKnowledgeForProject('nonexistent-type' as any);
      expect(Array.isArray(knowledge)).toBe(true);
      expect(knowledge.length).toBe(0);
    });

    it('should return knowledge with required properties when they exist', () => {
      const knowledge = getKnowledgeForProject('react-typescript');
      if (knowledge.length > 0) {
        expect(knowledge[0]).toHaveProperty('id');
        expect(knowledge[0]).toHaveProperty('name');
        expect(knowledge[0]).toHaveProperty('category');
        expect(knowledge[0]).toHaveProperty('content');
        expect(knowledge[0]).toHaveProperty('projectType');
      }
    });

    it('should cache results', () => {
      const first = getKnowledgeForProject('react-typescript');
      const second = getKnowledgeForProject('react-typescript');
      expect(first).toBe(second);
    });
  });

  describe('searchKnowledge', () => {
    it('should return matching knowledge for valid query', () => {
      const results = searchKnowledge('react-typescript', 'pattern');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = searchKnowledge('react-typescript', 'xyznonexistent123abc');
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const upper = searchKnowledge('react-typescript', 'REACT');
      const lower = searchKnowledge('react-typescript', 'react');
      expect(upper.length).toBe(lower.length);
    });

    it('should search in name, description and content', () => {
      const knowledge = getKnowledgeForProject('react-typescript');
      if (knowledge.length > 0) {
        const nameSearch = searchKnowledge('react-typescript', knowledge[0].name.substring(0, 5));
        expect(nameSearch.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('getKnowledgeById', () => {
    it('should return knowledge for valid id', () => {
      const knowledge = getKnowledgeForProject('react-typescript');
      if (knowledge.length > 0) {
        const found = getKnowledgeById(knowledge[0].id);
        expect(found).not.toBeNull();
        expect(found?.id).toBe(knowledge[0].id);
      }
    });

    it('should return null for invalid id', () => {
      const found = getKnowledgeById('invalid-knowledge-id');
      expect(found).toBeNull();
    });

    it('should return null for malformed id', () => {
      const found = getKnowledgeById('no-hyphens');
      expect(found).toBeNull();
    });
  });

  describe('getKnowledgeByCategory', () => {
    it('should return knowledge filtered by category', () => {
      const knowledge = getKnowledgeByCategory('react-typescript', 'patterns');
      expect(Array.isArray(knowledge)).toBe(true);
      knowledge.forEach(k => {
        expect(k.category).toBe('patterns');
      });
    });

    it('should return empty array for nonexistent category', () => {
      const knowledge = getKnowledgeByCategory('react-typescript', 'nonexistent' as any);
      expect(knowledge).toEqual([]);
    });
  });

  describe('getAvailableKnowledgeCategories', () => {
    it('should return array of categories', () => {
      const categories = getAvailableKnowledgeCategories('react-typescript');
      expect(Array.isArray(categories)).toBe(true);
    });

    it('should return empty array for project with no knowledge', () => {
      const categories = getAvailableKnowledgeCategories('nonexistent-type' as any);
      expect(categories).toEqual([]);
    });
  });

  describe('getCombinedKnowledgeContent', () => {
    it('should return combined content for valid ids', () => {
      const knowledge = getKnowledgeForProject('react-typescript');
      if (knowledge.length >= 2) {
        const combined = getCombinedKnowledgeContent([knowledge[0].id, knowledge[1].id]);
        expect(typeof combined).toBe('string');
        expect(combined.length).toBeGreaterThan(0);
      }
    });

    it('should return empty string for invalid ids', () => {
      const combined = getCombinedKnowledgeContent(['invalid-id-1', 'invalid-id-2']);
      expect(combined).toBe('');
    });

    it('should return empty string for empty array', () => {
      const combined = getCombinedKnowledgeContent([]);
      expect(combined).toBe('');
    });
  });

  describe('getProjectTypesWithKnowledge', () => {
    it('should return array of project types', () => {
      const types = getProjectTypesWithKnowledge();
      expect(Array.isArray(types)).toBe(true);
    });
  });

  describe('clearKnowledgeCache', () => {
    it('should clear the cache', () => {
      getKnowledgeForProject('react-typescript');
      clearKnowledgeCache();
      const afterClear = getKnowledgeForProject('react-typescript');
      expect(Array.isArray(afterClear)).toBe(true);
    });
  });
});
