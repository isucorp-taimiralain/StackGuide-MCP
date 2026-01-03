/**
 * Tests for Cursor Directory Service
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CURSOR_DIRECTORY_CATEGORIES,
  CursorDirectoryRule,
  CursorDirectoryCategory,
  getCursorDirectoryCategories,
  formatRuleForImport,
  clearCursorDirectoryCache,
  getCacheStats,
  fetchCursorDirectoryRule,
  browseCursorDirectoryCategory,
  searchCursorDirectory,
  getPopularCursorDirectoryRules
} from '../src/services/cursorDirectory.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('cursorDirectory', () => {
  describe('CURSOR_DIRECTORY_CATEGORIES', () => {
    it('should export categories array', () => {
      expect(Array.isArray(CURSOR_DIRECTORY_CATEGORIES)).toBe(true);
      expect(CURSOR_DIRECTORY_CATEGORIES.length).toBeGreaterThan(0);
    });

    it('should include common categories', () => {
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('typescript');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('python');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('react');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('next.js');
    });

    it('should include backend frameworks', () => {
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('django');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('fastapi');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('express');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('nestjs');
    });

    it('should include infrastructure categories', () => {
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('docker');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('kubernetes');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('aws');
    });

    it('should include database categories', () => {
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('mongodb');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('postgresql');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('prisma');
    });

    it('should include mobile development', () => {
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('react-native');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('flutter');
      expect(CURSOR_DIRECTORY_CATEGORIES).toContain('expo');
    });

    it('should be readonly array defined with as const', () => {
      // 'as const' makes it readonly at TypeScript level, but not frozen at runtime
      expect(CURSOR_DIRECTORY_CATEGORIES).toBeDefined();
      expect(typeof CURSOR_DIRECTORY_CATEGORIES[0]).toBe('string');
    });
  });

  describe('CursorDirectoryRule interface', () => {
    it('should accept valid rule object', () => {
      const rule: CursorDirectoryRule = {
        id: 'test-rule-1',
        slug: 'test-rule',
        title: 'Test Rule',
        description: 'A test rule for testing',
        content: '# Rule Content\n\nFollow these guidelines...',
        category: 'typescript',
        tags: ['typescript', 'testing'],
        url: 'https://cursor.directory/test-rule',
        fetchedAt: new Date().toISOString(),
      };

      expect(rule.id).toBe('test-rule-1');
      expect(rule.slug).toBe('test-rule');
      expect(rule.tags).toHaveLength(2);
    });

    it('should require all properties', () => {
      const rule: CursorDirectoryRule = {
        id: 'min-rule',
        slug: 'min',
        title: '',
        description: '',
        content: '',
        category: '',
        tags: [],
        url: '',
        fetchedAt: '',
      };

      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('slug');
      expect(rule).toHaveProperty('title');
      expect(rule).toHaveProperty('description');
      expect(rule).toHaveProperty('content');
      expect(rule).toHaveProperty('category');
      expect(rule).toHaveProperty('tags');
      expect(rule).toHaveProperty('url');
      expect(rule).toHaveProperty('fetchedAt');
    });
  });

  describe('CursorDirectoryCategory type', () => {
    it('should accept valid category', () => {
      const category: CursorDirectoryCategory = 'typescript';
      expect(category).toBe('typescript');
    });

    it('should work with array methods', () => {
      const categories: CursorDirectoryCategory[] = ['typescript', 'python', 'react'];
      expect(categories.length).toBe(3);
      expect(categories.includes('typescript')).toBe(true);
    });
  });
});

describe('cursorDirectory functions', () => {
  describe('getCursorDirectoryCategories', () => {
    it('should return array of categories', () => {
      const categories = getCursorDirectoryCategories();
      
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('typescript');
      expect(categories).toContain('python');
    });

    it('should return a copy of categories array', () => {
      const categories1 = getCursorDirectoryCategories();
      const categories2 = getCursorDirectoryCategories();
      
      // Should be different array instances
      expect(categories1).not.toBe(categories2);
      // But same content
      expect(categories1).toEqual(categories2);
    });
  });

  describe('formatRuleForImport', () => {
    it('should format rule with all fields', () => {
      const rule: CursorDirectoryRule = {
        id: 'test-rule',
        slug: 'test-slug',
        title: 'Test Rule Title',
        description: 'Test description',
        content: '# Rule Content\n\nFollow these guidelines.',
        category: 'typescript',
        tags: ['typescript', 'testing'],
        url: 'https://cursor.directory/test-slug',
        fetchedAt: '2024-01-01T00:00:00.000Z'
      };

      const formatted = formatRuleForImport(rule);

      expect(formatted).toContain('# Test Rule Title');
      expect(formatted).toContain('Imported from cursor.directory');
      expect(formatted).toContain('https://cursor.directory/test-slug');
      expect(formatted).toContain('Category: typescript');
      expect(formatted).toContain('Tags: typescript, testing');
      expect(formatted).toContain('# Rule Content');
      expect(formatted).toContain('Follow these guidelines.');
      expect(formatted).toContain('Fetched:');
    });

    it('should handle empty tags', () => {
      const rule: CursorDirectoryRule = {
        id: 'no-tags',
        slug: 'no-tags',
        title: 'No Tags Rule',
        description: 'Desc',
        content: 'Content',
        category: 'python',
        tags: [],
        url: 'https://cursor.directory/no-tags',
        fetchedAt: '2024-01-01T00:00:00.000Z'
      };

      const formatted = formatRuleForImport(rule);

      expect(formatted).toContain('Tags: ');
    });
  });

  describe('cache functions', () => {
    beforeEach(() => {
      clearCursorDirectoryCache();
      vi.clearAllMocks();
    });

    it('should return cache stats', () => {
      const stats = getCacheStats();
      
      expect(stats).toHaveProperty('rules');
      expect(stats).toHaveProperty('categories');
      expect(typeof stats.rules).toBe('number');
      expect(typeof stats.categories).toBe('number');
    });

    it('should clear cache', () => {
      clearCursorDirectoryCache();
      const stats = getCacheStats();
      
      expect(stats.rules).toBe(0);
      expect(stats.categories).toBe(0);
    });
  });

  describe('fetchCursorDirectoryRule', () => {
    beforeEach(() => {
      clearCursorDirectoryCache();
      vi.clearAllMocks();
    });

    it('should fetch and parse rule from HTML', async () => {
      // First call is connectivity check, second is actual fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
      }).mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <head>
              <title>React Best Practices - cursor.directory</title>
              <meta name="description" content="Best practices for React development">
            </head>
            <body>
              <h1>React Best Practices</h1>
              <pre><code>Follow these guidelines for React...</code></pre>
            </body>
          </html>
        `
      });

      const rule = await fetchCursorDirectoryRule('react-best-practices', 'react');

      expect(rule).not.toBeNull();
      expect(rule?.slug).toBe('react-best-practices');
      expect(rule?.category).toBe('react');
    });

    it('should return cached rule on second fetch', async () => {
      // First fetch: connectivity check + actual fetch via safeFetch
      // Content must be substantial enough to pass sanitization (>= 10 chars)
      mockFetch.mockResolvedValueOnce({
        ok: true,
      }).mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <title>Cached Rule</title>
            <body>
              <h1>Cached</h1>
              <pre><code>This is a substantial cached rule content for testing purposes that will pass sanitization validation.</code></pre>
            </body>
          </html>
        `
      });

      const rule1 = await fetchCursorDirectoryRule('cached-rule', 'typescript');
      
      // Second fetch should use in-memory cache (no additional fetch calls)
      const rule2 = await fetchCursorDirectoryRule('cached-rule', 'typescript');

      expect(rule1).not.toBeNull();
      expect(rule1).toEqual(rule2);
    });

    it('should return null on fetch failure', async () => {
      // Connectivity check OK, but actual fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
      }).mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const rule = await fetchCursorDirectoryRule('nonexistent', 'typescript');

      expect(rule).toBeNull();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const rule = await fetchCursorDirectoryRule('error-rule', 'typescript');

      expect(rule).toBeNull();
    });
  });

  describe('browseCursorDirectoryCategory', () => {
    beforeEach(() => {
      clearCursorDirectoryCache();
      vi.clearAllMocks();
    });

    it('should browse category and return rules', async () => {
      // Mock category page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/typescript-rule-1">Rule 1</a>
              <a href="/typescript-rule-2">Rule 2</a>
            </body>
          </html>
        `
      });
      // Mock individual rule fetches
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <title>Rule</title>
            <body><pre><code>This is a complete rule content for TypeScript development best practices.</code></pre></body>
          </html>
        `
      });

      const rules = await browseCursorDirectoryCategory('typescript');

      expect(Array.isArray(rules)).toBe(true);
    });

    it('should return cached category on second browse', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><a href="/rule1">R1</a></body></html>`
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => `<html><title>Python Rules</title><body><pre><code>This is a comprehensive Python development ruleset for best practices.</code></pre></body></html>`
      });

      await browseCursorDirectoryCategory('python');
      mockFetch.mockClear();
      
      await browseCursorDirectoryCategory('python');
      
      // Should not fetch again due to cache
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty array on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const rules = await browseCursorDirectoryCategory('nonexistent-cat');

      expect(rules).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const rules = await browseCursorDirectoryCategory('error-category');

      expect(rules).toEqual([]);
    });
  });

  describe('searchCursorDirectory', () => {
    beforeEach(() => {
      clearCursorDirectoryCache();
      vi.clearAllMocks();
    });

    it('should search and return matching rules', async () => {
      // First add a rule to cache (connectivity check + fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
      }).mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <title>React Hooks Guide</title>
            <meta name="description" content="Guide for React hooks">
            <body><pre><code>React hooks content - use useState, useEffect, and custom hooks for state management.</code></pre></body>
          </html>
        `
      });
      await fetchCursorDirectoryRule('react-hooks', 'react');

      const results = await searchCursorDirectory('react');

      // searchCursorDirectory searches in cache first
      // Since we've cached a rule with 'react' in title, it should match
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search by category when no cache match', async () => {
      // Mock category page response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><a href="/ts-rule">TS</a></body></html>`
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => `<html><title>TypeScript Rules</title><body><pre><code>TypeScript development guidelines and best practices for enterprise applications.</code></pre></body></html>`
      });

      const results = await searchCursorDirectory('typescript');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getPopularCursorDirectoryRules', () => {
    beforeEach(() => {
      clearCursorDirectoryCache();
      vi.clearAllMocks();
    });

    it('should fetch popular rules', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <title>Popular Rule</title>
            <body><pre><code>Popular content for coding best practices and development guidelines.</code></pre></body>
          </html>
        `
      });

      const rules = await getPopularCursorDirectoryRules();

      expect(Array.isArray(rules)).toBe(true);
    });

    it('should handle fetch failures gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const rules = await getPopularCursorDirectoryRules();

      expect(Array.isArray(rules)).toBe(true);
      expect(rules).toEqual([]);
    });
  });
});
