/**
 * Tests for Help Handler
 */
import { describe, it, expect } from 'vitest';
import { handleHelp } from '../src/handlers/help.js';

describe('help handler', () => {
  describe('handleHelp', () => {
    it('should return help for all topics by default', async () => {
      const response = await handleHelp({});
      
      expect(response.content[0].text).toContain('StackGuide Help');
      expect(response.content[0].text).toContain('Quick Start');
    });

    it('should return help for setup topic', async () => {
      const response = await handleHelp({ topic: 'setup' });
      
      expect(response.content[0].text).toContain('setup');
      expect(response.content[0].text).toContain('Configure');
    });

    it('should return help for rules topic', async () => {
      const response = await handleHelp({ topic: 'rules' });
      
      expect(response.content[0].text).toContain('rules');
      expect(response.content[0].text).toContain('List');
      expect(response.content[0].text).toContain('Search');
    });

    it('should return help for review topic', async () => {
      const response = await handleHelp({ topic: 'review' });
      
      expect(response.content[0].text).toContain('review');
      expect(response.content[0].text).toContain('File');
    });

    it('should return help for cursor topic', async () => {
      const response = await handleHelp({ topic: 'cursor' });
      
      expect(response.content[0].text).toContain('cursor');
      expect(response.content[0].text).toContain('Categories');
    });

    it('should return help for docs topic', async () => {
      const response = await handleHelp({ topic: 'docs' });
      
      expect(response.content[0].text).toContain('docs');
      expect(response.content[0].text).toContain('Fetch');
    });

    it('should return help for config topic', async () => {
      const response = await handleHelp({ topic: 'config' });
      
      expect(response.content[0].text).toContain('config');
      expect(response.content[0].text).toContain('Save');
      expect(response.content[0].text).toContain('Load');
    });

    it('should return all topics help when topic is "all"', async () => {
      const response = await handleHelp({ topic: 'all' });
      
      expect(response.content[0].text).toContain('Available Tools');
      expect(response.content[0].text).toContain('setup');
      expect(response.content[0].text).toContain('rules');
      expect(response.content[0].text).toContain('review');
    });

    it('should return response in correct format', async () => {
      const response = await handleHelp({});
      
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');
    });
  });
});
