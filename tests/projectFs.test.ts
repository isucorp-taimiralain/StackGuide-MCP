/**
 * Tests for ProjectFs Security
 * Ensures path traversal protection is working correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RealProjectFs, MockProjectFs } from '../src/services/projectFs.js';
import * as path from 'path';
import * as os from 'os';

describe('ProjectFs Security', () => {
  describe('RealProjectFs', () => {
    let fs: RealProjectFs;
    const testBasePath = '/test/project';

    beforeEach(() => {
      fs = new RealProjectFs(testBasePath);
    });

    describe('Path Traversal Protection', () => {
      it('should allow paths within basePath', () => {
        expect(() => fs.resolve('src/index.ts')).not.toThrow();
        expect(() => fs.resolve('nested/deep/file.ts')).not.toThrow();
        expect(() => fs.resolve('./relative/path.ts')).not.toThrow();
      });

      it('should reject path traversal with ../', () => {
        expect(() => fs.resolve('../../../etc/passwd')).toThrow('Access denied');
        expect(() => fs.resolve('../../secret.key')).toThrow('Access denied');
        expect(() => fs.resolve('src/../../../outside.txt')).toThrow('Access denied');
      });

      it('should reject absolute paths outside workspace', () => {
        expect(() => fs.resolve('/etc/passwd')).toThrow('Access denied');
        expect(() => fs.resolve('/root/.ssh/id_rsa')).toThrow('Access denied');
        expect(() => fs.resolve(os.homedir() + '/.bashrc')).toThrow('Access denied');
      });

      it('should allow absolute paths within workspace', () => {
        const insidePath = path.join(testBasePath, 'src', 'file.ts');
        expect(() => fs.resolve(insidePath)).not.toThrow();
      });

      it('should handle empty paths correctly', () => {
        const result = fs.resolve();
        expect(result).toBe(path.resolve(testBasePath));
      });

      it('should normalize paths and still catch traversal', () => {
        // Tricky path that might bypass naive checks
        expect(() => fs.resolve('src/./../../etc/passwd')).toThrow('Access denied');
        expect(() => fs.resolve('src/../src/../../../etc')).toThrow('Access denied');
      });
    });
  });

  describe('MockProjectFs', () => {
    let fs: MockProjectFs;

    beforeEach(() => {
      fs = new MockProjectFs('/mock/project', {
        '/mock/project/src/index.ts': { content: 'console.log("hello");' },
        '/mock/project/src': { isDirectory: true }
      });
    });

    it('should resolve paths correctly', () => {
      const result = fs.resolve('src/index.ts');
      expect(result).toBe('/mock/project/src/index.ts');
    });

    it('should read mock files', async () => {
      const content = await fs.readFile('src/index.ts');
      expect(content).toBe('console.log("hello");');
    });

    describe('Path Traversal Protection (consistent with RealProjectFs)', () => {
      it('should reject path traversal with ../', () => {
        expect(() => fs.resolve('../../../etc/passwd')).toThrow('Access denied');
        expect(() => fs.resolve('src/../../../outside.txt')).toThrow('Access denied');
      });

      it('should reject absolute paths outside mock workspace', () => {
        expect(() => fs.resolve('/etc/passwd')).toThrow('Access denied');
        expect(() => fs.resolve('/root/.ssh/id_rsa')).toThrow('Access denied');
      });

      it('should allow paths within mock workspace', () => {
        expect(() => fs.resolve('src/nested/file.ts')).not.toThrow();
        expect(() => fs.resolve('./relative.ts')).not.toThrow();
      });
    });
  });
});

describe('Code Analyzer Resource Limits', () => {
  it('should export resource limit constants', async () => {
    const { 
      MAX_FILE_SIZE_BYTES, 
      MAX_LINE_COUNT, 
      MAX_BATCH_FILES,
      validateFileForAnalysis 
    } = await import('../src/services/codeAnalyzer.js');
    
    expect(MAX_FILE_SIZE_BYTES).toBe(1 * 1024 * 1024); // 1MB
    expect(MAX_LINE_COUNT).toBe(50_000);
    expect(MAX_BATCH_FILES).toBe(100);
    expect(typeof validateFileForAnalysis).toBe('function');
  });

  it('should reject files exceeding size limit', async () => {
    const { validateFileForAnalysis, MAX_FILE_SIZE_BYTES } = await import('../src/services/codeAnalyzer.js');
    
    // Create a string slightly over 1MB
    const largeContent = 'x'.repeat(MAX_FILE_SIZE_BYTES + 1);
    
    expect(() => validateFileForAnalysis('large.ts', largeContent))
      .toThrow('File too large for analysis');
  });

  it('should reject files with too many lines', async () => {
    const { validateFileForAnalysis, MAX_LINE_COUNT } = await import('../src/services/codeAnalyzer.js');
    
    // Create content with more lines than allowed
    const manyLinesContent = Array(MAX_LINE_COUNT + 100).fill('const x = 1;').join('\n');
    
    expect(() => validateFileForAnalysis('many-lines.ts', manyLinesContent))
      .toThrow('too many lines');
  });

  it('should allow normal files', async () => {
    const { validateFileForAnalysis } = await import('../src/services/codeAnalyzer.js');
    
    const normalContent = 'const x = 1;\nconst y = 2;';
    
    expect(() => validateFileForAnalysis('normal.ts', normalContent)).not.toThrow();
  });
});
