/**
 * Tests for Handler Types Response Helpers
 */
import { describe, it, expect } from 'vitest';
import {
  jsonResponse,
  textResponse,
  errorResponse,
  ToolResponse,
  ServerState,
} from '../src/handlers/types.js';

describe('handler response helpers', () => {
  describe('jsonResponse', () => {
    it('should create a response with text content', () => {
      const response = jsonResponse({ foo: 'bar' });
      
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
    });

    it('should serialize data as pretty JSON', () => {
      const data = { name: 'test', value: 123 };
      const response = jsonResponse(data);
      const parsed = JSON.parse(response.content[0].text);
      
      expect(parsed).toEqual(data);
    });

    it('should handle nested objects', () => {
      const data = { user: { name: 'John', settings: { theme: 'dark' } } };
      const response = jsonResponse(data);
      const parsed = JSON.parse(response.content[0].text);
      
      expect(parsed.user.settings.theme).toBe('dark');
    });

    it('should handle arrays', () => {
      const data = { items: [1, 2, 3] };
      const response = jsonResponse(data);
      const parsed = JSON.parse(response.content[0].text);
      
      expect(parsed.items).toEqual([1, 2, 3]);
    });

    it('should handle empty objects', () => {
      const response = jsonResponse({});
      const parsed = JSON.parse(response.content[0].text);
      
      expect(parsed).toEqual({});
    });
  });

  describe('textResponse', () => {
    it('should create text response', () => {
      const response = textResponse('Hello World');
      
      expect(response.content[0].text).toBe('Hello World');
      expect(response.content[0].type).toBe('text');
    });

    it('should handle multiline text', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const response = textResponse(text);
      
      expect(response.content[0].text).toBe(text);
    });

    it('should handle empty string', () => {
      const response = textResponse('');
      
      expect(response.content[0].text).toBe('');
    });

    it('should handle special characters', () => {
      const text = '🚀 Special <chars> & "quotes"';
      const response = textResponse(text);
      
      expect(response.content[0].text).toBe(text);
    });
  });

  describe('errorResponse', () => {
    it('should create error response', () => {
      const response = errorResponse('Something went wrong');
      
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('error');
    });

    it('should include the error message', () => {
      const message = 'File not found';
      const response = errorResponse(message);
      
      expect(response.content[0].text).toContain(message);
    });
  });

  describe('ToolResponse type', () => {
    it('should accept valid structure', () => {
      const response: ToolResponse = {
        content: [{ type: 'text', text: 'Hello' }]
      };
      
      expect(response.content.length).toBe(1);
    });
  });

  describe('ServerState type', () => {
    it('should accept valid state structure', () => {
      const state: ServerState = {
        projectType: 'react-node',
        projectPath: '/path/to/project',
        selectedRules: [],
        selectedKnowledge: [],
        customRules: [],
        docsCache: new Map(),
        savedConfigs: new Map(),
      };
      
      expect(state.projectType).toBe('react-node');
      expect(state.selectedRules).toEqual([]);
    });

    it('should allow null project type', () => {
      const state: ServerState = {
        projectType: null,
        projectPath: process.cwd(),
        selectedRules: [],
        selectedKnowledge: [],
        customRules: [],
        docsCache: new Map(),
        savedConfigs: new Map(),
      };
      
      expect(state.projectType).toBeNull();
    });
  });
});
