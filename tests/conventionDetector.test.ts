/**
 * Tests for Convention Detector Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import {
  detectConventions,
  formatWithConventions,
  getConventionsSummary,
  CodeConventions
} from '../src/services/conventionDetector.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

describe('Convention Detector Service', () => {
  const mockFs = fs as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no config files exist
    mockFs.existsSync.mockReturnValue(false);
  });

  describe('detectConventions', () => {
    it('should return default conventions when no config files exist', () => {
      const conventions = detectConventions('/test/project');
      
      expect(conventions.indentation).toBe('spaces');
      expect(conventions.indentSize).toBe(2);
      expect(conventions.quotes).toBe('single');
      expect(conventions.semicolons).toBe(true);
      expect(conventions.confidence).toBe('low');
    });

    it('should detect conventions from .prettierrc', () => {
      mockFs.existsSync.mockImplementation((p: string) => 
        p.endsWith('.prettierrc.json')
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        useTabs: true,
        tabWidth: 4,
        singleQuote: false,
        semi: false,
        trailingComma: 'all'
      }));

      const conventions = detectConventions('/test/project');
      
      expect(conventions.indentation).toBe('tabs');
      expect(conventions.indentSize).toBe(4);
      expect(conventions.quotes).toBe('double');
      expect(conventions.semicolons).toBe(false);
      expect(conventions.trailingComma).toBe('all');
      expect(conventions.confidence).toBe('high');
      expect(conventions.sources).toContain('prettier');
    });

    it('should detect conventions from .editorconfig', () => {
      mockFs.existsSync.mockImplementation((p: string) => 
        p.endsWith('.editorconfig')
      );
      mockFs.readFileSync.mockReturnValue(`
root = true

[*]
indent_style = tab
indent_size = 4
      `);

      const conventions = detectConventions('/test/project');
      
      expect(conventions.indentation).toBe('tabs');
      expect(conventions.indentSize).toBe(4);
      expect(conventions.sources).toContain('.editorconfig');
    });

    it('should detect TypeScript strict mode from tsconfig', () => {
      mockFs.existsSync.mockImplementation((p: string) => 
        p.endsWith('tsconfig.json')
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        compilerOptions: {
          strict: true
        }
      }));

      const conventions = detectConventions('/test/project');
      
      expect(conventions.strictMode).toBe(true);
      expect(conventions.sources).toContain('tsconfig');
    });

    it('should detect state management from package.json', () => {
      mockFs.existsSync.mockImplementation((p: string) => 
        p.endsWith('package.json')
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        dependencies: {
          'zustand': '^4.0.0',
          'react': '^18.0.0'
        }
      }));

      const conventions = detectConventions('/test/project');
      
      expect(conventions.stateManagement).toBe('zustand');
    });

    it('should detect test framework from package.json', () => {
      mockFs.existsSync.mockImplementation((p: string) => 
        p.endsWith('package.json')
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: {
          'vitest': '^1.0.0'
        }
      }));

      const conventions = detectConventions('/test/project');
      
      expect(conventions.testFramework).toBe('vitest');
    });

    it('should prefer Prettier over EditorConfig', () => {
      mockFs.existsSync.mockImplementation((p: string) => 
        p.endsWith('.editorconfig') || p.endsWith('.prettierrc.json')
      );
      mockFs.readFileSync.mockImplementation((p: string) => {
        if (p.endsWith('.editorconfig')) {
          return 'indent_style = space\nindent_size = 2';
        }
        return JSON.stringify({ useTabs: true, tabWidth: 4 });
      });

      const conventions = detectConventions('/test/project');
      
      // Prettier should win
      expect(conventions.indentation).toBe('tabs');
      expect(conventions.indentSize).toBe(4);
    });
  });

  describe('formatWithConventions', () => {
    it('should convert spaces to tabs when configured', () => {
      const code = '  const x = 1;\n    const y = 2;';
      const conventions: CodeConventions = {
        indentation: 'tabs',
        indentSize: 2,
        quotes: 'single',
        semicolons: true,
        trailingComma: 'es5',
        componentNaming: 'PascalCase',
        fileNaming: 'PascalCase',
        reactStyle: 'functional',
        propsStyle: 'interface',
        stateManagement: 'useState',
        strictMode: true,
        testFramework: 'vitest',
        testLocation: '__tests__',
        importStyle: 'named',
        importOrder: [],
        sources: [],
        confidence: 'high'
      };

      const formatted = formatWithConventions(code, conventions);
      expect(formatted).toContain('\t');
    });

    it('should preserve code structure when formatting', () => {
      const code = 'const x = 1;\nconst y = 2;\n';
      const conventions: CodeConventions = {
        indentation: 'spaces',
        indentSize: 2,
        quotes: 'single',
        semicolons: false,  // Note: semicolon removal not yet implemented
        trailingComma: 'es5',
        componentNaming: 'PascalCase',
        fileNaming: 'PascalCase',
        reactStyle: 'functional',
        propsStyle: 'interface',
        stateManagement: 'useState',
        strictMode: true,
        testFramework: 'vitest',
        testLocation: '__tests__',
        importStyle: 'named',
        importOrder: [],
        sources: [],
        confidence: 'high'
      };

      const formatted = formatWithConventions(code, conventions);
      // Basic formatting should preserve the code structure
      expect(formatted).toContain('const x');
      expect(formatted).toContain('const y');
    });
  });

  describe('getConventionsSummary', () => {
    it('should generate markdown summary', () => {
      const conventions: CodeConventions = {
        indentation: 'spaces',
        indentSize: 2,
        quotes: 'single',
        semicolons: true,
        trailingComma: 'es5',
        componentNaming: 'PascalCase',
        fileNaming: 'PascalCase',
        reactStyle: 'functional',
        propsStyle: 'interface',
        stateManagement: 'zustand',
        strictMode: true,
        testFramework: 'vitest',
        testLocation: '__tests__',
        importStyle: 'named',
        importOrder: [],
        sources: ['prettier', 'tsconfig'],
        confidence: 'high'
      };

      const summary = getConventionsSummary(conventions);
      
      expect(summary).toContain('Detected Conventions');
      expect(summary).toContain('Confidence:** high');
      expect(summary).toContain('prettier');
      expect(summary).toContain('zustand');
      expect(summary).toContain('vitest');
    });
  });
});
