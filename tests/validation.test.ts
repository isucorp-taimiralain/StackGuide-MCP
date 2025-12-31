/**
 * Tests for Zod Validation Schemas
 */
import { describe, it, expect } from 'vitest';
import {
  SetupInputSchema,
  RulesInputSchema,
  KnowledgeInputSchema,
  ReviewInputSchema,
  CursorInputSchema,
  DocsInputSchema,
  ConfigInputSchema,
  CustomRuleInputSchema,
} from '../src/utils/validation.js';

describe('validation schemas', () => {
  describe('SetupInputSchema', () => {
    it('should accept valid project type', () => {
      const result = SetupInputSchema.safeParse({ type: 'react-node' });
      expect(result.success).toBe(true);
    });

    it('should accept path', () => {
      const result = SetupInputSchema.safeParse({ path: '/some/path' });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = SetupInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid project type', () => {
      const result = SetupInputSchema.safeParse({ type: 'invalid-type' });
      expect(result.success).toBe(false);
    });
  });

  describe('RulesInputSchema', () => {
    it('should accept list action', () => {
      const result = RulesInputSchema.safeParse({ action: 'list' });
      expect(result.success).toBe(true);
    });

    it('should accept get action with query', () => {
      const result = RulesInputSchema.safeParse({ action: 'get', query: 'some-rule' });
      expect(result.success).toBe(true);
    });

    it('should accept search action with query', () => {
      const result = RulesInputSchema.safeParse({ action: 'search', query: 'security' });
      expect(result.success).toBe(true);
    });

    it('should accept category filter', () => {
      const result = RulesInputSchema.safeParse({ 
        action: 'list', 
        category: 'security' 
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
      const result = RulesInputSchema.safeParse({ action: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid category', () => {
      const result = RulesInputSchema.safeParse({ 
        action: 'list', 
        category: 'invalid-category' 
      });
      expect(result.success).toBe(false);
    });
  });

  describe('KnowledgeInputSchema', () => {
    it('should accept list action', () => {
      const result = KnowledgeInputSchema.safeParse({ action: 'list' });
      expect(result.success).toBe(true);
    });

    it('should accept search with query', () => {
      const result = KnowledgeInputSchema.safeParse({ 
        action: 'search', 
        query: 'patterns' 
      });
      expect(result.success).toBe(true);
    });

    it('should accept category filter', () => {
      const result = KnowledgeInputSchema.safeParse({ 
        action: 'list',
        category: 'patterns'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ReviewInputSchema', () => {
    it('should accept file path', () => {
      const result = ReviewInputSchema.safeParse({ file: './src/index.ts' });
      expect(result.success).toBe(true);
    });

    it('should accept URL', () => {
      const result = ReviewInputSchema.safeParse({ 
        url: 'https://example.com/code.ts' 
      });
      expect(result.success).toBe(true);
    });

    it('should accept project flag', () => {
      const result = ReviewInputSchema.safeParse({ project: true });
      expect(result.success).toBe(true);
    });

    it('should accept focus option', () => {
      const result = ReviewInputSchema.safeParse({ 
        file: './test.ts',
        focus: 'security'
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid focus', () => {
      const result = ReviewInputSchema.safeParse({ 
        file: './test.ts',
        focus: 'invalid-focus'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CursorInputSchema', () => {
    it('should accept browse action', () => {
      const result = CursorInputSchema.safeParse({ action: 'browse' });
      expect(result.success).toBe(true);
    });

    it('should accept search with query', () => {
      const result = CursorInputSchema.safeParse({ 
        action: 'search', 
        query: 'react' 
      });
      expect(result.success).toBe(true);
    });

    it('should accept import with slug', () => {
      const result = CursorInputSchema.safeParse({ 
        action: 'import', 
        slug: 'typescript-rules' 
      });
      expect(result.success).toBe(true);
    });

    it('should accept categories action', () => {
      const result = CursorInputSchema.safeParse({ action: 'categories' });
      expect(result.success).toBe(true);
    });

    it('should accept popular action', () => {
      const result = CursorInputSchema.safeParse({ action: 'popular' });
      expect(result.success).toBe(true);
    });
  });

  describe('DocsInputSchema', () => {
    it('should accept action and query', () => {
      const result = DocsInputSchema.safeParse({ 
        action: 'search', 
        query: 'authentication' 
      });
      expect(result.success).toBe(true);
    });

    it('should accept url for fetch', () => {
      const result = DocsInputSchema.safeParse({ 
        action: 'fetch', 
        url: 'https://docs.example.com' 
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ConfigInputSchema', () => {
    it('should accept list action', () => {
      const result = ConfigInputSchema.safeParse({ action: 'list' });
      expect(result.success).toBe(true);
    });

    it('should accept save with name', () => {
      const result = ConfigInputSchema.safeParse({ 
        action: 'save', 
        name: 'my-config'
      });
      expect(result.success).toBe(true);
    });

    it('should accept delete action', () => {
      const result = ConfigInputSchema.safeParse({ action: 'delete', id: 'config-1' });
      expect(result.success).toBe(true);
    });

    it('should accept export action', () => {
      const result = ConfigInputSchema.safeParse({ action: 'export' });
      expect(result.success).toBe(true);
    });
  });

  describe('CustomRuleInputSchema', () => {
    it('should accept create action with content', () => {
      const result = CustomRuleInputSchema.safeParse({ 
        action: 'create', 
        name: 'my-rule',
        content: 'Rule content here' 
      });
      expect(result.success).toBe(true);
    });

    it('should accept list action', () => {
      const result = CustomRuleInputSchema.safeParse({ action: 'list' });
      expect(result.success).toBe(true);
    });

    it('should accept delete action with name', () => {
      const result = CustomRuleInputSchema.safeParse({ 
        action: 'delete', 
        name: 'my-rule' 
      });
      expect(result.success).toBe(true);
    });
  });
});
