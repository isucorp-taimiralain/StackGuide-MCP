/**
 * Tests for Cursor Handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCursor } from '../src/handlers/cursor.js';
import { ServerState } from '../src/handlers/types.js';
import * as cursorDirectory from '../src/services/cursorDirectory.js';
import * as ruleManager from '../src/services/ruleManager.js';

// Mock the services
vi.mock('../src/services/cursorDirectory.js', () => ({
  getCursorDirectoryCategories: vi.fn(() => ['typescript', 'python', 'react']),
  getPopularCursorDirectoryRules: vi.fn(() => Promise.resolve([
    { id: 'rule-1', slug: 'test-rule', title: 'Test Rule', content: 'Test content', category: 'typescript', tags: [], url: 'https://cursor.directory/test', fetchedAt: new Date().toISOString(), description: 'Test' }
  ])),
  browseCursorDirectoryCategory: vi.fn((category: string) => Promise.resolve([
    { id: `rule-${category}`, slug: `${category}-rule`, title: `${category} Rule`, content: 'Content', category, tags: [], url: `https://cursor.directory/${category}`, fetchedAt: new Date().toISOString(), description: 'Desc' }
  ])),
  searchCursorDirectory: vi.fn((query: string) => Promise.resolve([
    { id: 'search-result', slug: 'found-rule', title: query, content: 'Search result', category: 'typescript', tags: [query], url: 'https://cursor.directory/found', fetchedAt: new Date().toISOString(), description: 'Found' }
  ])),
  fetchCursorDirectoryRule: vi.fn((slug: string) => Promise.resolve({
    id: `cursor-${slug}`,
    slug,
    title: 'Imported Rule',
    content: 'Rule content to import',
    category: 'best-practices',
    tags: ['typescript'],
    url: `https://cursor.directory/${slug}`,
    fetchedAt: new Date().toISOString(),
    description: 'Imported from cursor.directory'
  })),
  formatRuleForImport: vi.fn((rule: any) => `# ${rule.title}\n\n${rule.content}`)
}));

vi.mock('../src/services/ruleManager.js', () => ({
  createUserRule: vi.fn((pt, cat, name, content, desc) => ({
    id: `user-${pt}-${cat}-${name}`,
    name: `cursor-${name}`,
    category: cat,
    content,
    description: desc
  }))
}));

describe('cursor handler', () => {
  let state: ServerState;

  beforeEach(() => {
    state = {
      activeProjectType: 'react-typescript',
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
    vi.clearAllMocks();
  });

  describe('handleCursor', () => {
    describe('categories action', () => {
      it('should return categories by default', async () => {
        const response = await handleCursor({}, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.categories).toBeDefined();
        expect(Array.isArray(data.categories)).toBe(true);
        expect(cursorDirectory.getCursorDirectoryCategories).toHaveBeenCalled();
      });

      it('should return categories with explicit action', async () => {
        const response = await handleCursor({ action: 'categories' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.categories).toBeDefined();
        expect(data.categories).toContain('typescript');
      });
    });

    describe('popular action', () => {
      it('should return popular rules', async () => {
        const response = await handleCursor({ action: 'popular' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.rules).toBeDefined();
        expect(Array.isArray(data.rules)).toBe(true);
        expect(cursorDirectory.getPopularCursorDirectoryRules).toHaveBeenCalled();
      });
    });

    describe('browse action', () => {
      it('should require query for browse', async () => {
        const response = await handleCursor({ action: 'browse' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });

      it('should browse category with query', async () => {
        const response = await handleCursor({ action: 'browse', query: 'typescript' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.category).toBe('typescript');
        expect(data.rules).toBeDefined();
        expect(cursorDirectory.browseCursorDirectoryCategory).toHaveBeenCalledWith('typescript');
      });
    });

    describe('search action', () => {
      it('should require query for search', async () => {
        const response = await handleCursor({ action: 'search' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });

      it('should search with query', async () => {
        const response = await handleCursor({ action: 'search', query: 'react hooks' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.query).toBe('react hooks');
        expect(data.results).toBeDefined();
        expect(cursorDirectory.searchCursorDirectory).toHaveBeenCalledWith('react hooks');
      });
    });

    describe('import action', () => {
      it('should require slug for import', async () => {
        const response = await handleCursor({ action: 'import' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('slug');
      });

      it('should import rule with slug', async () => {
        const response = await handleCursor({ action: 'import', slug: 'nextjs-best-practices' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.imported).toBeDefined();
        expect(cursorDirectory.fetchCursorDirectoryRule).toHaveBeenCalledWith('nextjs-best-practices', 'best-practices');
        expect(ruleManager.createUserRule).toHaveBeenCalled();
      });

      it('should handle rule not found', async () => {
        vi.mocked(cursorDirectory.fetchCursorDirectoryRule).mockResolvedValueOnce(null);
        
        const response = await handleCursor({ action: 'import', slug: 'nonexistent-rule' }, state);
        
        expect(response.content[0].text).toContain('not found');
      });

      it('should use default project type when not configured', async () => {
        state.activeProjectType = null;
        
        await handleCursor({ action: 'import', slug: 'some-rule' }, state);
        
        expect(ruleManager.createUserRule).toHaveBeenCalledWith(
          'react-typescript',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String)
        );
      });
    });

    describe('default action', () => {
      it('should return validation error for invalid action', async () => {
        const response = await handleCursor({ action: 'unknown' as any }, state);
        
        // With Zod validation, invalid actions return validation error
        expect(response.content[0].text).toContain('Validation error');
      });
    });
  });
});
