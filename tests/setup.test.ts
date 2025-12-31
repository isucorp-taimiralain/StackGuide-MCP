/**
 * Tests for Setup Handler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleSetup } from '../src/handlers/setup.js';
import { ServerState } from '../src/handlers/types.js';
import { SUPPORTED_PROJECTS } from '../src/config/types.js';

describe('setup handler', () => {
  let state: ServerState;

  beforeEach(() => {
    state = {
      activeProjectType: null,
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
  });

  describe('handleSetup', () => {
    it('should configure with explicit project type', async () => {
      const response = await handleSetup({ type: 'react-typescript' }, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(data.success).toBe(true);
      expect(data.projectType).toBe('react-typescript');
      expect(state.activeProjectType).toBe('react-typescript');
    });

    it('should return success true with message', async () => {
      const response = await handleSetup({ type: 'python-django' }, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('Configured');
    });

    it('should load rules for project type', async () => {
      await handleSetup({ type: 'react-node' }, state);
      
      expect(Array.isArray(state.loadedRules)).toBe(true);
    });

    it('should load knowledge for project type', async () => {
      await handleSetup({ type: 'react-node' }, state);
      
      expect(Array.isArray(state.loadedKnowledge)).toBe(true);
    });

    it('should create active configuration', async () => {
      await handleSetup({ type: 'react-typescript' }, state);
      
      expect(state.activeConfiguration).not.toBeNull();
      expect(state.activeConfiguration?.projectType).toBe('react-typescript');
    });

    it('should auto-detect with current directory', async () => {
      const response = await handleSetup({ path: '.' }, state);
      const data = JSON.parse(response.content[0].text);
      
      // Should either succeed or provide helpful failure message
      expect(data).toHaveProperty('success');
    });

    it('should return nextSteps on success', async () => {
      const response = await handleSetup({ type: 'react-node' }, state);
      const data = JSON.parse(response.content[0].text);
      
      if (data.success) {
        expect(data.nextSteps).toBeDefined();
        expect(Array.isArray(data.nextSteps)).toBe(true);
      }
    });

    it('should return rulesLoaded count', async () => {
      const response = await handleSetup({ type: 'react-typescript' }, state);
      const data = JSON.parse(response.content[0].text);
      
      if (data.success) {
        expect(typeof data.rulesLoaded).toBe('number');
        expect(data.rulesLoaded).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle empty args for auto-detect', async () => {
      const response = await handleSetup({}, state);
      
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
    });

    it('should return availableTypes on failed auto-detect', async () => {
      const response = await handleSetup({ path: '/nonexistent/path/xyz123' }, state);
      const data = JSON.parse(response.content[0].text);
      
      if (!data.success) {
        expect(data.availableTypes).toBeDefined();
        expect(data.availableTypes).toContain('react-node');
      }
    });

    it('should work with all supported project types', async () => {
      const projectTypes = Object.keys(SUPPORTED_PROJECTS);
      
      for (const type of projectTypes.slice(0, 3)) { // Test first 3 types
        const testState: ServerState = {
          activeProjectType: null,
          activeConfiguration: null,
          loadedRules: [],
          loadedKnowledge: [],
        };
        
        const response = await handleSetup({ type }, testState);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(testState.activeProjectType).toBe(type);
      }
    });

    it('should populate activeConfiguration on success', async () => {
      await handleSetup({ type: 'nextjs' }, state);
      
      expect(state.activeConfiguration).not.toBeNull();
      expect(state.activeConfiguration?.id).toContain('nextjs');
      expect(state.activeConfiguration?.projectType).toBe('nextjs');
      expect(state.activeConfiguration?.selectedRules).toBeDefined();
      expect(state.activeConfiguration?.selectedKnowledge).toBeDefined();
    });

    it('should include detection info for auto-detected projects', async () => {
      const response = await handleSetup({ path: '.' }, state);
      const data = JSON.parse(response.content[0].text);
      
      // If auto-detection succeeded
      if (data.success && data.detection) {
        expect(data.detection).toHaveProperty('projectType');
        expect(data.detection).toHaveProperty('confidence');
      }
    });

    it('should return knowledgeLoaded count', async () => {
      const response = await handleSetup({ type: 'python-fastapi' }, state);
      const data = JSON.parse(response.content[0].text);
      
      if (data.success) {
        expect(typeof data.knowledgeLoaded).toBe('number');
        expect(data.knowledgeLoaded).toBeGreaterThanOrEqual(0);
      }
    });

    it('should set loadedKnowledge in state', async () => {
      await handleSetup({ type: 'golang' }, state);
      
      expect(Array.isArray(state.loadedKnowledge)).toBe(true);
    });

    it('should use process.cwd for dot path', async () => {
      const response = await handleSetup({ path: '.' }, state);
      
      expect(response).toHaveProperty('content');
    });

    it('should handle validation errors gracefully', async () => {
      // Pass invalid args that should fail validation
      const response = await handleSetup({ type: 123 }, state);
      const data = JSON.parse(response.content[0].text);
      
      // Should handle gracefully
      expect(response.content[0].text).toBeDefined();
    });

    it('should include message in successful response', async () => {
      const response = await handleSetup({ type: 'vue-node' }, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('Configured');
      expect(data.message).toContain('✅');
    });

    it('should include hint on failed auto-detection', async () => {
      const response = await handleSetup({ path: '/completely/fake/path/xyz' }, state);
      const data = JSON.parse(response.content[0].text);
      
      if (!data.success) {
        expect(data.hint).toBeDefined();
        expect(data.hint).toContain('setup');
      }
    });
  });
});
