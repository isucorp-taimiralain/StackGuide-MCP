/**
 * Tests for Docs Handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleDocs } from '../src/handlers/docs.js';
import { ServerState } from '../src/handlers/types.js';
import * as webDocs from '../src/services/webDocumentation.js';

// Mock the webDocumentation service
vi.mock('../src/services/webDocumentation.js', () => ({
  fetchWebDocumentation: vi.fn((url: string, options: any) => Promise.resolve({
    id: `doc-${Date.now()}`,
    url,
    title: 'Fetched Document',
    content: '# Documentation\n\nContent here',
    summary: 'Summary of the document',
    fetchedAt: new Date().toISOString(),
    projectType: options?.projectType,
    tags: []
  })),
  listCachedDocuments: vi.fn(() => [
    { id: 'doc-1', title: 'Doc 1', url: 'https://example.com/doc1', summary: 'Summary 1', fetchedAt: new Date().toISOString(), tags: [] },
    { id: 'doc-2', title: 'Doc 2', url: 'https://example.com/doc2', summary: 'Summary 2', fetchedAt: new Date().toISOString(), tags: [] }
  ]),
  searchWebDocuments: vi.fn((query: string) => [
    { id: 'search-1', title: `Result for ${query}`, url: 'https://example.com/result', content: 'Match content', summary: 'Match', fetchedAt: new Date().toISOString(), tags: [query] }
  ]),
  getWebDocumentById: vi.fn((id: string) => {
    if (id === 'doc-1') {
      return { id: 'doc-1', title: 'Doc 1', url: 'https://example.com/doc1', content: 'Full content of doc 1', summary: 'Summary', fetchedAt: new Date().toISOString(), tags: [] };
    }
    return null;
  }),
  getWebDocumentByUrl: vi.fn((url: string) => {
    if (url === 'https://example.com/doc1') {
      return { id: 'doc-1', title: 'Doc 1', url, content: 'Full content of doc 1', summary: 'Summary', fetchedAt: new Date().toISOString(), tags: [] };
    }
    return null;
  }),
  removeFromCache: vi.fn(() => true),
  getSuggestedDocs: vi.fn((pt: string) => [
    { name: 'React Documentation', url: 'https://react.dev' },
    { name: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/' }
  ])
}));

describe('docs handler', () => {
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

  describe('handleDocs', () => {
    describe('list action', () => {
      it('should list cached documents by default', async () => {
        const response = await handleDocs({}, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.count).toBeDefined();
        expect(data.docs).toBeDefined();
        expect(Array.isArray(data.docs)).toBe(true);
        expect(webDocs.listCachedDocuments).toHaveBeenCalled();
      });

      it('should list documents with explicit action', async () => {
        const response = await handleDocs({ action: 'list' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.docs.length).toBe(2);
        expect(data.docs[0]).toHaveProperty('id');
        expect(data.docs[0]).toHaveProperty('title');
        expect(data.docs[0]).toHaveProperty('url');
      });
    });

    describe('fetch action', () => {
      it('should require url for fetch', async () => {
        const response = await handleDocs({ action: 'fetch' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('url');
      });

      it('should fetch documentation from url', async () => {
        const response = await handleDocs({
          action: 'fetch',
          url: 'https://example.com/documentation'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.id).toBeDefined();
        expect(data.title).toBeDefined();
        expect(webDocs.fetchWebDocumentation).toHaveBeenCalledWith(
          'https://example.com/documentation',
          { projectType: 'react-typescript' }
        );
      });

      it('should handle fetch errors', async () => {
        vi.mocked(webDocs.fetchWebDocumentation).mockRejectedValueOnce(new Error('Network error'));
        
        const response = await handleDocs({
          action: 'fetch',
          url: 'https://example.com/bad-url'
        }, state);
        
        expect(response.content[0].text).toContain('Error fetching');
      });

      it('should work without active project type', async () => {
        state.activeProjectType = null;
        
        const response = await handleDocs({
          action: 'fetch',
          url: 'https://example.com/doc'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(webDocs.fetchWebDocumentation).toHaveBeenCalledWith(
          'https://example.com/doc',
          undefined
        );
      });
    });

    describe('search action', () => {
      it('should require query for search', async () => {
        const response = await handleDocs({ action: 'search' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });

      it('should search documents with query', async () => {
        const response = await handleDocs({
          action: 'search',
          query: 'react hooks'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.query).toBe('react hooks');
        expect(data.matches).toBeDefined();
        expect(webDocs.searchWebDocuments).toHaveBeenCalledWith('react hooks');
      });
    });

    describe('get action', () => {
      it('should require url/id for get', async () => {
        const response = await handleDocs({ action: 'get' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('url');
      });

      it('should get document by id', async () => {
        const response = await handleDocs({
          action: 'get',
          url: 'doc-1'
        }, state);
        
        expect(response.content[0].text).toContain('Doc 1');
        expect(response.content[0].text).toContain('Full content');
        expect(webDocs.getWebDocumentById).toHaveBeenCalledWith('doc-1');
      });

      it('should get document by url', async () => {
        vi.mocked(webDocs.getWebDocumentById).mockReturnValueOnce(null);
        
        const response = await handleDocs({
          action: 'get',
          url: 'https://example.com/doc1'
        }, state);
        
        expect(response.content[0].text).toContain('Doc 1');
        expect(webDocs.getWebDocumentByUrl).toHaveBeenCalledWith('https://example.com/doc1');
      });

      it('should handle document not found', async () => {
        vi.mocked(webDocs.getWebDocumentById).mockReturnValueOnce(null);
        vi.mocked(webDocs.getWebDocumentByUrl).mockReturnValueOnce(null);
        
        const response = await handleDocs({
          action: 'get',
          url: 'https://nonexistent.example.com/doc'
        }, state);
        
        expect(response.content[0].text).toContain('not found');
      });
    });

    describe('remove action', () => {
      it('should require url/id for remove', async () => {
        const response = await handleDocs({ action: 'remove' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('url');
      });

      it('should remove document from cache', async () => {
        const response = await handleDocs({
          action: 'remove',
          url: 'https://example.com/doc-1'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.removed).toBe('https://example.com/doc-1');
        expect(webDocs.removeFromCache).toHaveBeenCalledWith('https://example.com/doc-1');
      });
    });

    describe('suggest action', () => {
      it('should return suggested docs for project type', async () => {
        const response = await handleDocs({ action: 'suggest' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.suggestions).toBeDefined();
        expect(Array.isArray(data.suggestions)).toBe(true);
        expect(webDocs.getSuggestedDocs).toHaveBeenCalledWith('react-typescript');
      });

      it('should use default project type when not configured', async () => {
        state.activeProjectType = null;
        
        const response = await handleDocs({ action: 'suggest' }, state);
        
        expect(webDocs.getSuggestedDocs).toHaveBeenCalledWith('react-typescript');
      });

      it('should return suggestions with name and url', async () => {
        const response = await handleDocs({ action: 'suggest' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.suggestions[0]).toHaveProperty('name');
        expect(data.suggestions[0]).toHaveProperty('url');
      });
    });

    describe('default action', () => {
      it('should return validation error for invalid action', async () => {
        const response = await handleDocs({ action: 'unknown' as any }, state);
        
        // With Zod validation, invalid actions return validation error
        expect(response.content[0].text).toContain('Validation error');
      });
    });
  });
});
