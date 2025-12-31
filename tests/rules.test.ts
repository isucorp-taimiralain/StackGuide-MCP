/**
 * Tests for Rules Handler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleRules } from '../src/handlers/rules.js';
import { handleSetup } from '../src/handlers/setup.js';
import { ServerState } from '../src/handlers/types.js';

describe('rules handler', () => {
  let state: ServerState;

  beforeEach(async () => {
    state = {
      activeProjectType: null,
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
    // Setup with a project type to have rules loaded
    await handleSetup({ type: 'react-typescript' }, state);
  });

  describe('handleRules', () => {
    describe('list action', () => {
      it('should list rules for configured project', async () => {
        const response = await handleRules({ action: 'list' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.projectType).toBe('react-typescript');
        expect(Array.isArray(data.rules)).toBe(true);
        expect(typeof data.count).toBe('number');
      });

      it('should filter by category', async () => {
        const response = await handleRules({ 
          action: 'list', 
          category: 'best-practices' 
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        if (data.rules.length > 0) {
          data.rules.forEach((r: { category: string }) => {
            expect(r.category).toBe('best-practices');
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
        
        const response = await handleRules({ action: 'list' }, emptyState);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.count).toBe(0);
      });

      it('should default to list action', async () => {
        const response = await handleRules({}, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data).toHaveProperty('rules');
        expect(data).toHaveProperty('count');
      });
    });

    describe('search action', () => {
      it('should search rules by query', async () => {
        const response = await handleRules({ 
          action: 'search', 
          query: 'component' 
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.query).toBe('component');
        expect(typeof data.matches).toBe('number');
        expect(Array.isArray(data.rules)).toBe(true);
      });

      it('should require query for search', async () => {
        const response = await handleRules({ action: 'search' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });

      it('should be case insensitive', async () => {
        const lowerResponse = await handleRules({ 
          action: 'search', 
          query: 'react' 
        }, state);
        const upperResponse = await handleRules({ 
          action: 'search', 
          query: 'REACT' 
        }, state);
        
        const lowerData = JSON.parse(lowerResponse.content[0].text);
        const upperData = JSON.parse(upperResponse.content[0].text);
        
        expect(lowerData.matches).toBe(upperData.matches);
      });
    });

    describe('get action', () => {
      it('should require query (rule ID)', async () => {
        const response = await handleRules({ action: 'get' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('query');
      });

      it('should return not found for invalid ID', async () => {
        const response = await handleRules({ 
          action: 'get', 
          query: 'nonexistent-rule-id' 
        }, state);
        
        expect(response.content[0].text).toContain('not found');
      });
    });

    describe('select action', () => {
      it('should require ids for select', async () => {
        const response = await handleRules({ action: 'select' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('ids');
      });

      it('should require non-empty ids array', async () => {
        const response = await handleRules({ 
          action: 'select', 
          ids: [] 
        }, state);
        
        expect(response.content[0].text).toContain('Error');
      });
    });
  });
});
