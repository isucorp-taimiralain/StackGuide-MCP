/**
 * Tests for Web Documentation Service
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchWebDocumentation,
  fetchMultipleDocuments,
  searchWebDocuments,
  getWebDocumentById,
  getWebDocumentByUrl,
  listCachedDocuments,
  clearWebDocCache,
  removeFromCache,
  getSuggestedDocs,
  POPULAR_DOCS
} from '../src/services/webDocumentation.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('webDocumentation', () => {
  beforeEach(() => {
    clearWebDocCache();
    vi.clearAllMocks();
  });

  describe('fetchWebDocumentation', () => {
    it('should fetch and parse HTML documentation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => `
          <html>
            <head><title>Test Documentation</title></head>
            <body>
              <article>
                <h1>Getting Started</h1>
                <p>Welcome to the documentation.</p>
              </article>
            </body>
          </html>
        `
      });

      const doc = await fetchWebDocumentation('https://example.com/docs');
      
      expect(doc.title).toBe('Test Documentation');
      expect(doc.url).toBe('https://example.com/docs');
      expect(doc.content).toContain('Getting Started');
      expect(doc.content).toContain('Welcome');
      expect(doc.id).toBeDefined();
      expect(doc.fetchedAt).toBeDefined();
    });

    it('should handle markdown content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/markdown' }),
        text: async () => `# Markdown Doc\n\nThis is markdown content.`
      });

      const doc = await fetchWebDocumentation('https://example.com/docs.md');
      
      expect(doc.title).toBe('Markdown Doc');
      expect(doc.content).toContain('markdown content');
    });

    it('should handle plain text content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Plain text documentation content'
      });

      const doc = await fetchWebDocumentation('https://example.com/readme.txt');
      
      expect(doc.content).toContain('Plain text');
    });

    it('should return cached document on second request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>Cached Doc</title><body>Content</body></html>'
      });

      const doc1 = await fetchWebDocumentation('https://example.com/cached');
      const doc2 = await fetchWebDocumentation('https://example.com/cached');
      
      expect(doc1.id).toBe(doc2.id);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw on invalid URL', async () => {
      await expect(fetchWebDocumentation('not-a-valid-url'))
        .rejects.toThrow('Invalid URL');
    });

    it('should throw on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(fetchWebDocumentation('https://example.com/notfound'))
        .rejects.toThrow('Failed to fetch');
    });

    it('should include project type and tags in document', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>React Doc</title><body>React content</body></html>'
      });

      const doc = await fetchWebDocumentation('https://example.com/react', {
        projectType: 'react-typescript',
        category: 'guides',
        tags: ['react', 'hooks']
      });
      
      expect(doc.projectType).toBe('react-typescript');
      expect(doc.category).toBe('guides');
      expect(doc.tags).toContain('react');
    });

    it('should extract content from main/article tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => `
          <html>
            <head><title>Main Content Test</title></head>
            <body>
              <nav>Navigation menu</nav>
              <main>
                <h1>Main Content</h1>
                <p>This is the main content.</p>
              </main>
              <footer>Footer content</footer>
            </body>
          </html>
        `
      });

      const doc = await fetchWebDocumentation('https://example.com/main');
      
      expect(doc.content).toContain('Main Content');
      expect(doc.content).not.toContain('Navigation menu');
      expect(doc.content).not.toContain('Footer content');
    });

    it('should convert HTML elements to markdown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => `
          <html>
            <title>Markdown Conversion</title>
            <body>
              <main>
                <h1>Header 1</h1>
                <h2>Header 2</h2>
                <p><strong>Bold</strong> and <em>italic</em></p>
                <ul>
                  <li>Item 1</li>
                  <li>Item 2</li>
                </ul>
                <code>inline code</code>
              </main>
            </body>
          </html>
        `
      });

      const doc = await fetchWebDocumentation('https://example.com/convert');
      
      // Check for formatted content (may vary based on HTML structure)
      expect(doc.content).toContain('**Bold**');
      expect(doc.content).toContain('*italic*');
      expect(doc.content).toContain('- Item 1');
      expect(doc.content).toContain('`inline code`');
    });
  });

  describe('fetchMultipleDocuments', () => {
    it('should fetch multiple URLs in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<html><title>Doc 1</title><body>First doc</body></html>'
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<html><title>Doc 2</title><body>Second doc</body></html>'
        });

      const results = await fetchMultipleDocuments([
        'https://example.com/doc1',
        'https://example.com/doc2'
      ]);
      
      expect(results.successful).toHaveLength(2);
      expect(results.failed).toHaveLength(0);
    });

    it('should handle partial failures', async () => {
      // Use URL-based response mapping for parallel fetch reliability
      mockFetch.mockImplementation(async (url: string) => {
        if (url === 'https://example.com/good') {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'text/html' }),
            text: async () => '<html><title>Good Doc</title><body>Good content</body></html>'
          };
        }
        if (url === 'https://example.com/bad') {
          return {
            ok: false,
            status: 500,
            statusText: 'Server Error'
          };
        }
        throw new Error('Unexpected URL');
      });

      const results = await fetchMultipleDocuments([
        'https://example.com/good',
        'https://example.com/bad'
      ]);
      
      expect(results.successful).toHaveLength(1);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].url).toBe('https://example.com/bad');
    });
  });

  describe('searchWebDocuments', () => {
    it('should search in cached documents', async () => {
      // First add some documents to cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>React Hooks</title><body>Learn about React hooks</body></html>'
      });
      await fetchWebDocumentation('https://example.com/hooks');

      const results = searchWebDocuments('hooks');
      
      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Hooks');
    });

    it('should search by title, content, and tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>TypeScript Guide</title><body>Type safety</body></html>'
      });
      await fetchWebDocumentation('https://example.com/ts', { tags: ['typescript'] });

      const byTitle = searchWebDocuments('TypeScript');
      const byTag = searchWebDocuments('typescript');
      
      expect(byTitle).toHaveLength(1);
      expect(byTag).toHaveLength(1);
    });

    it('should return empty array when no matches', () => {
      const results = searchWebDocuments('nonexistent-term-xyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('getWebDocumentById', () => {
    it('should return document by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>Find By ID</title><body>Content</body></html>'
      });
      const original = await fetchWebDocumentation('https://example.com/byid');
      
      const found = getWebDocumentById(original.id);
      
      expect(found).not.toBeNull();
      expect(found?.id).toBe(original.id);
    });

    it('should return null for unknown id', () => {
      const result = getWebDocumentById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getWebDocumentByUrl', () => {
    it('should return document by url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>Find By URL</title><body>Content</body></html>'
      });
      await fetchWebDocumentation('https://example.com/byurl');
      
      const found = getWebDocumentByUrl('https://example.com/byurl');
      
      expect(found).not.toBeNull();
      expect(found?.url).toBe('https://example.com/byurl');
    });

    it('should return null for unknown url', () => {
      const result = getWebDocumentByUrl('https://example.com/unknown');
      expect(result).toBeNull();
    });
  });

  describe('listCachedDocuments', () => {
    it('should list all cached documents without content', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<html><title>List Doc 1</title><body>Content 1</body></html>'
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<html><title>List Doc 2</title><body>Content 2</body></html>'
        });

      await fetchWebDocumentation('https://example.com/list1');
      await fetchWebDocumentation('https://example.com/list2');
      
      const list = listCachedDocuments();
      
      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('title');
      expect(list[0]).toHaveProperty('url');
      expect(list[0]).toHaveProperty('summary');
      expect(list[0]).not.toHaveProperty('content');
    });

    it('should return empty array when cache is empty', () => {
      const list = listCachedDocuments();
      expect(list).toHaveLength(0);
    });
  });

  describe('removeFromCache', () => {
    it('should remove document by url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>Remove Me</title><body>Content</body></html>'
      });
      await fetchWebDocumentation('https://example.com/remove');
      
      const removed = removeFromCache('https://example.com/remove');
      
      expect(removed).toBe(true);
      expect(getWebDocumentByUrl('https://example.com/remove')).toBeNull();
    });

    it('should remove document by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>Remove By ID</title><body>Content</body></html>'
      });
      const doc = await fetchWebDocumentation('https://example.com/remove-id');
      
      const removed = removeFromCache(doc.id);
      
      expect(removed).toBe(true);
      expect(getWebDocumentById(doc.id)).toBeNull();
    });

    it('should return false for unknown url/id', () => {
      const removed = removeFromCache('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('clearWebDocCache', () => {
    it('should clear all cached documents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><title>Clear Me</title><body>Content</body></html>'
      });
      await fetchWebDocumentation('https://example.com/clear');
      
      clearWebDocCache();
      
      expect(listCachedDocuments()).toHaveLength(0);
    });
  });

  describe('getSuggestedDocs', () => {
    it('should return suggestions for known project types', () => {
      const suggestions = getSuggestedDocs('react-node');
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toHaveProperty('name');
      expect(suggestions[0]).toHaveProperty('url');
    });

    it('should return empty array for unknown project type', () => {
      const suggestions = getSuggestedDocs('unknown-project');
      expect(suggestions).toEqual([]);
    });
  });

  describe('POPULAR_DOCS', () => {
    it('should export popular docs by project type', () => {
      expect(POPULAR_DOCS).toHaveProperty('python-django');
      expect(POPULAR_DOCS).toHaveProperty('react-node');
      expect(POPULAR_DOCS).toHaveProperty('nextjs');
    });

    it('should have valid doc entries', () => {
      const reactDocs = POPULAR_DOCS['react-node'];
      expect(reactDocs.length).toBeGreaterThan(0);
      expect(reactDocs[0]).toHaveProperty('name');
      expect(reactDocs[0]).toHaveProperty('url');
    });
  });
});
