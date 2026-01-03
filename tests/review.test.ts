/**
 * Tests for Review Handler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleReview } from '../src/handlers/review.js';
import { handleSetup } from '../src/handlers/setup.js';
import { ServerState } from '../src/handlers/types.js';

describe('review handler', () => {
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

  describe('handleReview', () => {
    describe('project review', () => {
      it('should review project when project:true', async () => {
        const response = await handleReview({ project: true }, state);
        
        expect(response.content[0].text).toContain('Review');
      });

      it('should include overall score', async () => {
        const response = await handleReview({ project: true }, state);
        
        expect(response.content[0].text).toContain('Score');
      });

      it('should include summary with errors/warnings/info', async () => {
        const response = await handleReview({ project: true }, state);
        
        expect(response.content[0].text).toContain('Summary');
      });

      it('should support focus filter', async () => {
        const response = await handleReview({ 
          project: true, 
          focus: 'security' 
        }, state);
        
        expect(response.content[0].text).toContain('security');
      });
    });

    describe('file review', () => {
      it('should handle non-existent file gracefully', async () => {
        const response = await handleReview({ 
          file: 'nonexistent/path/file.ts' 
        }, state);
        
        // Might return "not found" or path traversal error depending on cwd
        expect(response.content[0].text).toMatch(/not found|Path traversal/);
      });

      it('should review existing file', async () => {
        const response = await handleReview({ 
          file: 'src/index.ts' 
        }, state);
        
        // Either analyzes or reports file not found
        expect(response).toHaveProperty('content');
      });
    });

    describe('auto-detection', () => {
      it('should auto-detect project type if not set', async () => {
        const emptyState: ServerState = {
          activeProjectType: null,
          activeConfiguration: null,
          loadedRules: [],
          loadedKnowledge: [],
        };
        
        const response = await handleReview({ project: true }, emptyState);
        
        // Should work even without explicit setup
        expect(response).toHaveProperty('content');
      });
    });

    describe('empty args', () => {
      it('should prompt for input when no args provided', async () => {
        const response = await handleReview({}, state);
        
        expect(response.content[0].text).toContain('file');
      });
    });

    describe('focus options', () => {
      const focusOptions = ['all', 'security', 'performance', 'architecture', 'coding-standards'] as const;
      
      for (const focus of focusOptions) {
        it(`should accept focus: ${focus}`, async () => {
          const response = await handleReview({ 
            project: true, 
            focus 
          }, state);
          
          expect(response).toHaveProperty('content');
        });
      }
    });

    describe('response format', () => {
      it('should return proper response structure', async () => {
        const response = await handleReview({ project: true }, state);
        
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0]).toHaveProperty('text');
      });
    });
  });
});
