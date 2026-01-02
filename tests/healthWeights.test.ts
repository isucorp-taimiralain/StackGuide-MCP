/**
 * Tests for Health Weights Configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import {
  DEFAULT_HEALTH_WEIGHTS,
  loadProjectWeights,
  getHealthWeights,
  validateWeights,
  getGradeFromScore,
  calculateIssueDeduction,
  generateSampleConfig,
  getWeightsDocumentation
} from '../src/config/healthWeights.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('Health Weights Configuration', () => {
  const mockFs = fs as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
  });

  describe('DEFAULT_HEALTH_WEIGHTS', () => {
    it('should have category weights summing to 100', () => {
      const sum = Object.values(DEFAULT_HEALTH_WEIGHTS.categories)
        .reduce((acc, cat) => acc + cat.maxScore, 0);
      expect(sum).toBe(100);
    });

    it('should have all required categories', () => {
      expect(DEFAULT_HEALTH_WEIGHTS.categories.configuration).toBeDefined();
      expect(DEFAULT_HEALTH_WEIGHTS.categories.codeQuality).toBeDefined();
      expect(DEFAULT_HEALTH_WEIGHTS.categories.structure).toBeDefined();
      expect(DEFAULT_HEALTH_WEIGHTS.categories.documentation).toBeDefined();
      expect(DEFAULT_HEALTH_WEIGHTS.categories.testing).toBeDefined();
    });

    it('should have grade thresholds in descending order', () => {
      const { gradeThresholds } = DEFAULT_HEALTH_WEIGHTS;
      expect(gradeThresholds.A).toBeGreaterThan(gradeThresholds.B);
      expect(gradeThresholds.B).toBeGreaterThan(gradeThresholds.C);
      expect(gradeThresholds.C).toBeGreaterThan(gradeThresholds.D);
      expect(gradeThresholds.D).toBeGreaterThan(gradeThresholds.F);
    });
  });

  describe('loadProjectWeights', () => {
    it('should return null when no config file exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      const result = loadProjectWeights('/test/project');
      expect(result).toBeNull();
    });

    it('should return null when config has no healthWeights', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        someOtherConfig: true
      }));
      
      const result = loadProjectWeights('/test/project');
      expect(result).toBeNull();
    });

    it('should return healthWeights from config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        healthWeights: {
          issueWeights: {
            critical: 15
          }
        }
      }));
      
      const result = loadProjectWeights('/test/project');
      expect(result).toBeDefined();
      expect(result?.issueWeights?.critical).toBe(15);
    });
  });

  describe('getHealthWeights', () => {
    it('should return default weights when no project config', () => {
      mockFs.existsSync.mockReturnValue(false);
      const weights = getHealthWeights('/test/project');
      expect(weights).toEqual(DEFAULT_HEALTH_WEIGHTS);
    });

    it('should merge project weights with defaults', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        healthWeights: {
          issueWeights: {
            critical: 20
          },
          gradeThresholds: {
            A: 95
          }
        }
      }));
      
      const weights = getHealthWeights('/test/project');
      
      // Custom values
      expect(weights.issueWeights.critical).toBe(20);
      expect(weights.gradeThresholds.A).toBe(95);
      
      // Default values preserved
      expect(weights.issueWeights.warning).toBe(DEFAULT_HEALTH_WEIGHTS.issueWeights.warning);
      expect(weights.gradeThresholds.B).toBe(DEFAULT_HEALTH_WEIGHTS.gradeThresholds.B);
    });
  });

  describe('validateWeights', () => {
    it('should validate correct weights', () => {
      const result = validateWeights(DEFAULT_HEALTH_WEIGHTS);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect category sum not equal to 100', () => {
      const invalidWeights = {
        ...DEFAULT_HEALTH_WEIGHTS,
        categories: {
          ...DEFAULT_HEALTH_WEIGHTS.categories,
          configuration: { ...DEFAULT_HEALTH_WEIGHTS.categories.configuration, maxScore: 50 }
        }
      };
      
      const result = validateWeights(invalidWeights);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sum to 100'))).toBe(true);
    });

    it('should detect negative issue weights', () => {
      const invalidWeights = {
        ...DEFAULT_HEALTH_WEIGHTS,
        issueWeights: {
          ...DEFAULT_HEALTH_WEIGHTS.issueWeights,
          critical: -5
        }
      };
      
      const result = validateWeights(invalidWeights);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('negative'))).toBe(true);
    });
  });

  describe('getGradeFromScore', () => {
    it('should return A for scores >= 90', () => {
      expect(getGradeFromScore(100, DEFAULT_HEALTH_WEIGHTS)).toBe('A');
      expect(getGradeFromScore(95, DEFAULT_HEALTH_WEIGHTS)).toBe('A');
      expect(getGradeFromScore(90, DEFAULT_HEALTH_WEIGHTS)).toBe('A');
    });

    it('should return B for scores 80-89', () => {
      expect(getGradeFromScore(89, DEFAULT_HEALTH_WEIGHTS)).toBe('B');
      expect(getGradeFromScore(85, DEFAULT_HEALTH_WEIGHTS)).toBe('B');
      expect(getGradeFromScore(80, DEFAULT_HEALTH_WEIGHTS)).toBe('B');
    });

    it('should return C for scores 70-79', () => {
      expect(getGradeFromScore(79, DEFAULT_HEALTH_WEIGHTS)).toBe('C');
      expect(getGradeFromScore(70, DEFAULT_HEALTH_WEIGHTS)).toBe('C');
    });

    it('should return D for scores 60-69', () => {
      expect(getGradeFromScore(69, DEFAULT_HEALTH_WEIGHTS)).toBe('D');
      expect(getGradeFromScore(60, DEFAULT_HEALTH_WEIGHTS)).toBe('D');
    });

    it('should return F for scores < 60', () => {
      expect(getGradeFromScore(59, DEFAULT_HEALTH_WEIGHTS)).toBe('F');
      expect(getGradeFromScore(0, DEFAULT_HEALTH_WEIGHTS)).toBe('F');
    });

    it('should respect custom thresholds', () => {
      const customWeights = {
        ...DEFAULT_HEALTH_WEIGHTS,
        gradeThresholds: { A: 95, B: 85, C: 75, D: 65, F: 0 }
      };
      
      expect(getGradeFromScore(90, customWeights)).toBe('B');
      expect(getGradeFromScore(95, customWeights)).toBe('A');
    });
  });

  describe('calculateIssueDeduction', () => {
    it('should calculate correct deduction', () => {
      const deduction = calculateIssueDeduction('error', 3, DEFAULT_HEALTH_WEIGHTS);
      expect(deduction).toBe(3 * DEFAULT_HEALTH_WEIGHTS.issueWeights.error);
    });

    it('should handle zero count', () => {
      const deduction = calculateIssueDeduction('critical', 0, DEFAULT_HEALTH_WEIGHTS);
      expect(deduction).toBe(0);
    });
  });

  describe('generateSampleConfig', () => {
    it('should generate valid JSON', () => {
      const sample = generateSampleConfig();
      expect(() => JSON.parse(sample)).not.toThrow();
    });

    it('should include healthWeights section', () => {
      const sample = generateSampleConfig();
      const parsed = JSON.parse(sample);
      expect(parsed.healthWeights).toBeDefined();
    });
  });

  describe('getWeightsDocumentation', () => {
    it('should generate markdown documentation', () => {
      const docs = getWeightsDocumentation(DEFAULT_HEALTH_WEIGHTS);
      
      expect(docs).toContain('# Health Score Weights');
      expect(docs).toContain('## Categories');
      expect(docs).toContain('## Issue Deductions');
      expect(docs).toContain('## Grade Thresholds');
      expect(docs).toContain('## Bonuses');
    });

    it('should include all categories', () => {
      const docs = getWeightsDocumentation(DEFAULT_HEALTH_WEIGHTS);
      
      for (const cat of Object.values(DEFAULT_HEALTH_WEIGHTS.categories)) {
        expect(docs).toContain(cat.name);
      }
    });
  });
});
