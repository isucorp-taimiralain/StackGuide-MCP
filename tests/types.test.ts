/**
 * Tests for Handler Types
 */
import { describe, it, expect } from 'vitest';
import { jsonResponse, textResponse } from '../src/handlers/types.js';

describe('handler types', () => {
  describe('jsonResponse', () => {
    it('should create a valid JSON response', () => {
      const data = { foo: 'bar', count: 42 };
      const response = jsonResponse(data);

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBe(1);
      expect(response.content[0].type).toBe('text');
    });

    it('should serialize object to JSON string', () => {
      const data = { name: 'test', value: 123 };
      const response = jsonResponse(data);

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toEqual(data);
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'John',
          settings: {
            theme: 'dark',
            notifications: true
          }
        }
      };
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
  });

  describe('textResponse', () => {
    it('should create a valid text response', () => {
      const text = 'Hello, World!';
      const response = textResponse(text);

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBe(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toBe(text);
    });

    it('should preserve whitespace', () => {
      const text = '  indented\n\nnewlines  ';
      const response = textResponse(text);

      expect(response.content[0].text).toBe(text);
    });

    it('should handle empty string', () => {
      const response = textResponse('');
      expect(response.content[0].text).toBe('');
    });

    it('should handle special characters', () => {
      const text = 'Special: <>&"\'';
      const response = textResponse(text);
      expect(response.content[0].text).toBe(text);
    });

    it('should handle multiline text', () => {
      const text = `Line 1
Line 2
Line 3`;
      const response = textResponse(text);
      expect(response.content[0].text).toContain('Line 1');
      expect(response.content[0].text).toContain('Line 3');
    });
  });
});
