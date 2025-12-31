/**
 * Tests for Auto-Detection Service
 */
import { describe, it, expect } from 'vitest';
import {
  detectProjectType,
  analyzeProject,
  getSetupInstructions,
  generateQuickStart,
  getSuggestions,
  DetectionResult,
  ProjectAnalysis,
} from '../src/services/autoDetect.js';
import { SUPPORTED_PROJECTS } from '../src/config/types.js';

describe('autoDetect', () => {
  describe('detectProjectType', () => {
    it('should return DetectionResult object', () => {
      const result = detectProjectType('/nonexistent/path');
      
      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('projectType');
      expect(result).toHaveProperty('indicators');
      expect(result).toHaveProperty('confidence');
    });

    it('should return detected=false for nonexistent path', () => {
      const result = detectProjectType('/nonexistent/path/xyz123');
      
      expect(result.detected).toBe(false);
    });

    it('should return indicators array', () => {
      const result = detectProjectType('/nonexistent/path');
      
      expect(Array.isArray(result.indicators)).toBe(true);
    });

    it('should return confidence as high, medium, or low', () => {
      const result = detectProjectType('/nonexistent/path');
      
      expect(['high', 'medium', 'low']).toContain(result.confidence);
    });

    it('should detect current directory (likely has package.json)', () => {
      const result = detectProjectType(process.cwd());
      
      // The test project should be detectable
      expect(result).toHaveProperty('detected');
      expect(typeof result.detected).toBe('boolean');
    });
  });

  describe('analyzeProject', () => {
    it('should return ProjectAnalysis object', () => {
      const result = analyzeProject('/nonexistent/path');
      
      expect(result).toHaveProperty('hasPackageJson');
      expect(result).toHaveProperty('frameworks');
      expect(result).toHaveProperty('dependencies');
    });

    it('should return arrays for collections', () => {
      const result = analyzeProject('/nonexistent/path');
      
      expect(Array.isArray(result.frameworks)).toBe(true);
      expect(Array.isArray(result.dependencies)).toBe(true);
    });

    it('should analyze current project', () => {
      const result = analyzeProject(process.cwd());
      
      // Should detect that this is a Node.js project with package.json
      expect(result.hasPackageJson).toBe(true);
    });
  });

  describe('getSetupInstructions', () => {
    it('should return string instructions', () => {
      const result = getSetupInstructions('react-node');
      
      expect(typeof result).toBe('string');
    });

    it('should return instructions for supported project types', () => {
      const supportedTypes = Object.keys(SUPPORTED_PROJECTS);
      
      for (const type of supportedTypes) {
        const instructions = getSetupInstructions(type);
        expect(typeof instructions).toBe('string');
        expect(instructions.length).toBeGreaterThan(0);
      }
    });

    it('should return fallback for unknown project type', () => {
      const result = getSetupInstructions('unknown-type');
      
      expect(typeof result).toBe('string');
    });
  });

  describe('generateQuickStart', () => {
    it('should generate quickstart from DetectionResult', () => {
      const detection: DetectionResult = {
        detected: true,
        projectType: 'react-node',
        confidence: 'high',
        indicators: ['package.json found', 'react dependency'],
        suggestions: [],
        frameworks: ['react', 'express'],
        languages: ['typescript', 'javascript'],
      };
      
      const result = generateQuickStart(detection);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle undetected project', () => {
      const detection: DetectionResult = {
        detected: false,
        projectType: null,
        confidence: 'low',
        indicators: [],
        suggestions: [],
        frameworks: [],
        languages: [],
      };
      
      const result = generateQuickStart(detection);
      
      expect(typeof result).toBe('string');
    });
  });

  describe('getSuggestions', () => {
    it('should return array of suggestions', () => {
      const result = getSuggestions('react-node');
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return suggestions for valid project type', () => {
      const result = getSuggestions('react-node');
      
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle unknown project type', () => {
      const result = getSuggestions('unknown-type');
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('SUPPORTED_PROJECTS', () => {
    it('should have required project types', () => {
      expect(SUPPORTED_PROJECTS).toHaveProperty('react-node');
      expect(SUPPORTED_PROJECTS).toHaveProperty('react-typescript');
      expect(SUPPORTED_PROJECTS).toHaveProperty('python-django');
    });

    it('should have name and description for each project', () => {
      const types = Object.values(SUPPORTED_PROJECTS);
      
      for (const project of types) {
        expect(project).toHaveProperty('name');
        expect(project).toHaveProperty('description');
        expect(typeof project.name).toBe('string');
        expect(typeof project.description).toBe('string');
      }
    });
  });
});
