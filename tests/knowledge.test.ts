/**
 * Tests for Knowledge Handler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleKnowledge } from '../src/handlers/knowledge.js';
import { handleSetup } from '../src/handlers/setup.js';
import { ServerState } from '../src/handlers/types.js';

describe('knowledge handler', () => {
  let state: ServerState;

  beforeEach(async () => {
    state = {
      activeProjectType: null,
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
    await handleSetup({ type: 'react-typescript' }, state);
  });

  describe('handleKnowledge', () => {
    describe('list action', () => {
      it('should list knowledge for configured project', async () => {
        const response = await handleKnowledge({ action: 'list' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.projectType).toBe('react-typescript');
        expect(Array.isArray(data.knowledge)).toBe(true);
        expect(typeof data.count).toBe('number');
      });

      it('should filter by category', async () => {
        const response = await handleKnowledge({ 
          action: 'list', 
          category: 'patterns' 
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        if (data.knowledge.length > 0) {
          data.knowledge.forEach((k: { category: string }) => {
            expect(k.category).toBe('patterns');
          });
        }
      });

      it('should return empty for unconfigured project', async () => {
        const emptyState: ServerState = {
          activeProjectType: null,
          activeConfiguration: null,
          loadedRules: [],
          loadedKnowledge: [],
        };
        
        const response = await handleKnowledge({ action: 'list' }, emptyState);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.count).toBe(0);
      });

      it('should default to list action', async () => {
        const response = await handleKnowledge({}, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data).toHaveProperty('knowledge');
        expect(data).toHaveProperty('count');
      });
    });

    describe('search action', () => {
      it('should search knowledge by query', async () => {
        const response = await handleKnowledge({ 
          action: 'search', 
          query: 'pattern' 
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.query).toBe('pattern');
        expect(typeof data.matches).toBe('number');
        expect(Array.isArray(data.knowledge)).toBe(true);
      });

      it('should require query for search', async () => {
        const response = await handleKnowledge({ action: 'search' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });
    });

    describe('get action', () => {
      it('should require query (knowledge ID)', async () => {
        const response = await handleKnowledge({ action: 'get' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });

      it('should return not found for invalid ID', async () => {
        const response = await handleKnowledge({ 
          action: 'get', 
          query: 'nonexistent-knowledge-id' 
        }, state);
        
        expect(response.content[0].text).toContain('not found');
      });
    });
  });
});
