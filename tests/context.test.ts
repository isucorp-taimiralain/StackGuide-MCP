/**
 * Tests for Context Handler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleContext } from '../src/handlers/context.js';
import { handleSetup } from '../src/handlers/setup.js';
import { ServerState } from '../src/handlers/types.js';

describe('context handler', () => {
  let state: ServerState;

  beforeEach(() => {
    state = {
      activeProjectType: null,
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
  });

  describe('handleContext', () => {
    it('should return unconfigured state when not set up', async () => {
      const response = await handleContext({}, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(data.configured).toBe(false);
      expect(data.hint).toContain('setup');
    });

    it('should return context after setup', async () => {
      await handleSetup({ type: 'react-typescript' }, state);
      const response = await handleContext({}, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(data.projectType).toBe('react-typescript');
      expect(data.projectName).toBeDefined();
    });

    it('should return rules and knowledge arrays', async () => {
      await handleSetup({ type: 'react-node' }, state);
      const response = await handleContext({}, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(Array.isArray(data.rules)).toBe(true);
      expect(Array.isArray(data.knowledge)).toBe(true);
    });

    it('should return totalRules and totalKnowledge counts', async () => {
      await handleSetup({ type: 'python-django' }, state);
      const response = await handleContext({}, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(typeof data.totalRules).toBe('number');
      expect(typeof data.totalKnowledge).toBe('number');
    });

    it('should return full content when full=true', async () => {
      await handleSetup({ type: 'react-typescript' }, state);
      const response = await handleContext({ full: true }, state);
      
      expect(response.content[0].text).toContain('Context');
    });

    it('should return proper response format', async () => {
      const response = await handleContext({}, state);
      
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');
    });

    it('should return languages and frameworks after setup', async () => {
      await handleSetup({ type: 'react-typescript' }, state);
      const response = await handleContext({}, state);
      const data = JSON.parse(response.content[0].text);
      
      expect(Array.isArray(data.languages)).toBe(true);
      expect(Array.isArray(data.frameworks)).toBe(true);
    });
  });
});
