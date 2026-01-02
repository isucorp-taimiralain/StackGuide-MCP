/**
 * Tests for Health Handler - Phase 6
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleHealth } from '../../src/handlers/health.js';
import { ServerState } from '../../src/handlers/types.js';

describe('handleHealth', () => {
  let mockState: ServerState;

  beforeEach(() => {
    mockState = {
      activeProjectType: null,
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: []
    };
  });

  describe('basic functionality', () => {
    it('should return health report with score and grade', async () => {
      const result = await handleHealth({}, mockState);

      const data = JSON.parse(result.content[0].text);
      expect(data.header).toBe('🏥 Project Health Report');
      expect(data.score).toBeDefined();
      expect(data.grade).toBeDefined();
      expect(data.categories).toBeInstanceOf(Array);
    });

    it('should include all health categories', async () => {
      const result = await handleHealth({ detailed: true }, mockState);

      const data = JSON.parse(result.content[0].text);
      const categoryNames = data.categories.map((c: any) => c.name);
      
      expect(categoryNames).toContain('Configuration');
      expect(categoryNames).toContain('Code Quality');
      expect(categoryNames).toContain('Structure');
      expect(categoryNames).toContain('Documentation');
      expect(categoryNames).toContain('Testing');
    });

    it('should return simplified report when detailed is false', async () => {
      const result = await handleHealth({ detailed: false }, mockState);

      const data = JSON.parse(result.content[0].text);
      expect(data.score).toBeDefined();
      expect(data.grade).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.topRecommendations).toBeDefined();
      // Should not include full category breakdown
      expect(data.categories).toBeUndefined();
    });
  });

  describe('score calculation', () => {
    it('should return low score when not configured', async () => {
      const result = await handleHealth({}, mockState);

      const data = JSON.parse(result.content[0].text);
      const scoreNum = parseInt(data.score.split('/')[0]);
      expect(scoreNum).toBeLessThan(80);
    });

    it('should return higher score when configured', async () => {
      mockState.activeProjectType = 'react-typescript';
      mockState.loadedRules = [
        { id: 'rule1', name: 'Test Rule', content: 'content', category: 'best-practices' }
      ];
      mockState.loadedKnowledge = [
        { id: 'k1', name: 'Knowledge', content: 'content', category: 'patterns' }
      ];

      const result = await handleHealth({}, mockState);

      const data = JSON.parse(result.content[0].text);
      const scoreNum = parseInt(data.score.split('/')[0]);
      expect(scoreNum).toBeGreaterThan(50);
    });
  });

  describe('grade assignment', () => {
    it('should assign appropriate grade based on score', async () => {
      mockState.activeProjectType = 'react-typescript';
      mockState.loadedRules = [
        { id: 'r1', name: 'Rule', content: 'content', category: 'best-practices' },
        { id: 'r2', name: 'Rule2', content: 'content', category: 'coding-standards' },
        { id: 'r3', name: 'Rule3', content: 'testing', category: 'testing' }
      ];
      mockState.loadedKnowledge = [
        { id: 'k1', name: 'Knowledge', content: 'content', category: 'patterns' }
      ];

      const result = await handleHealth({}, mockState);

      const data = JSON.parse(result.content[0].text);
      expect(data.grade).toMatch(/[A-F]/);
    });
  });

  describe('recommendations', () => {
    it('should provide recommendations when issues exist', async () => {
      const result = await handleHealth({ detailed: true }, mockState);

      const data = JSON.parse(result.content[0].text);
      expect(data.recommendations).toBeInstanceOf(Array);
      expect(data.recommendations.length).toBeGreaterThan(0);
    });

    it('should include next steps', async () => {
      const result = await handleHealth({ detailed: true }, mockState);

      const data = JSON.parse(result.content[0].text);
      expect(data.nextSteps).toBeInstanceOf(Array);
    });
  });

  describe('category analysis', () => {
    it('should analyze configuration category', async () => {
      const result = await handleHealth({ detailed: true }, mockState);

      const data = JSON.parse(result.content[0].text);
      const configCategory = data.categories.find((c: any) => c.name === 'Configuration');
      
      expect(configCategory).toBeDefined();
      expect(configCategory.score).toBeDefined();
      expect(configCategory.percentage).toBeDefined();
    });

    it('should show issues in categories', async () => {
      const result = await handleHealth({ detailed: true }, mockState);

      const data = JSON.parse(result.content[0].text);
      const hasIssues = data.categories.some((c: any) => c.issues && c.issues.length > 0);
      
      expect(hasIssues).toBe(true);
    });

    it('should show suggestions in categories', async () => {
      const result = await handleHealth({ detailed: true }, mockState);

      const data = JSON.parse(result.content[0].text);
      const hasSuggestions = data.categories.some((c: any) => c.suggestions && c.suggestions.length > 0);
      
      expect(hasSuggestions).toBe(true);
    });
  });
});
