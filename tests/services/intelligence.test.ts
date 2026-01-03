/**
 * Intelligence Module Tests
 * @version 3.8.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  analyzeStructure,
  scanDirectory,
  getDirPurpose,
  getFilePurpose,
  getFrameworkTemplate,
  getAllTemplates,
  getConfigTemplate,
  FRAMEWORK_TEMPLATES,
  parseConfigFile,
  analyzeConfigFile,
  detectPackageManager,
  extractDependencies,
  generateIntelligenceReport
} from '../../src/services/intelligence/index.js';

describe('Intelligence Module', () => {
  let testDir: string;
  
  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `stackguide-intel-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });
  
  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Structure Analyzer', () => {
    describe('scanDirectory', () => {
      it('should scan directory and return files and dirs', () => {
        // Create test structure
        fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });
        fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
        fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), 'export {}');
        
        const result = scanDirectory(testDir, 2);
        
        expect(result.dirs).toContain('src');
        expect(result.dirs).toContain('tests');
        expect(result.files).toContain('package.json');
      });

      it('should respect max depth', () => {
        // Create nested structure
        fs.mkdirSync(path.join(testDir, 'a', 'b', 'c', 'd'), { recursive: true });
        
        const shallow = scanDirectory(testDir, 1);
        const deep = scanDirectory(testDir, 4);
        
        expect(shallow.dirs.length).toBeLessThan(deep.dirs.length);
      });

      it('should ignore node_modules and .git', () => {
        fs.mkdirSync(path.join(testDir, 'node_modules', 'pkg'), { recursive: true });
        fs.mkdirSync(path.join(testDir, '.git', 'objects'), { recursive: true });
        fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
        
        const result = scanDirectory(testDir, 2);
        
        expect(result.dirs).not.toContain('node_modules');
        expect(result.dirs).not.toContain('.git');
        expect(result.dirs).toContain('src');
      });
    });

    describe('getDirPurpose', () => {
      it('should return purpose for known directories', () => {
        expect(getDirPurpose('src', 'react-typescript').toLowerCase()).toContain('source');
        expect(getDirPurpose('tests', 'react-typescript').toLowerCase()).toMatch(/test/);
        expect(getDirPurpose('src/components', 'react-typescript').toLowerCase()).toMatch(/component/);
      });

      it('should return generic purpose for unknown directories', () => {
        const purpose = getDirPurpose('random-dir', 'react-typescript');
        expect(typeof purpose).toBe('string');
      });
    });

    describe('getFilePurpose', () => {
      it('should return purpose for known files', () => {
        expect(getFilePurpose('package.json').toLowerCase()).toContain('node');
        expect(getFilePurpose('tsconfig.json').toLowerCase()).toContain('typescript');
        expect(getFilePurpose('.gitignore').toLowerCase()).toContain('git');
      });

      it('should return generic purpose for unknown files', () => {
        const purpose = getFilePurpose('random-file.xyz');
        expect(typeof purpose).toBe('string');
      });
    });

    describe('analyzeStructure', () => {
      it('should analyze project structure', () => {
        // Create minimal project
        fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
        
        const analysis = analyzeStructure(testDir, 'react-typescript');
        
        expect(analysis.rootPath).toBe(testDir);
        expect(analysis.projectType).toBe('react-typescript');
        expect(typeof analysis.structureScore).toBe('number');
        expect(Array.isArray(analysis.existingDirs)).toBe(true);
        expect(Array.isArray(analysis.missingDirs)).toBe(true);
      });

      it('should identify missing directories', () => {
        // Create empty project
        const analysis = analyzeStructure(testDir, 'react-typescript');
        
        // Should suggest common directories
        expect(analysis.missingDirs.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Framework Templates', () => {
    describe('getFrameworkTemplate', () => {
      it('should return template for known frameworks', () => {
        const reactTemplate = getFrameworkTemplate('react-typescript');
        
        expect(reactTemplate).toBeDefined();
        expect(reactTemplate?.name).toBeDefined();
        expect(Array.isArray(reactTemplate?.requiredDirs)).toBe(true);
        expect(Array.isArray(reactTemplate?.requiredFiles)).toBe(true);
      });

      it('should return undefined for unknown frameworks', () => {
        const unknown = getFrameworkTemplate('unknown-framework');
        expect(unknown).toBeUndefined();
      });
    });

    describe('getAllTemplates', () => {
      it('should return all available templates', () => {
        const templates = getAllTemplates();
        
        expect(Array.isArray(templates)).toBe(true);
        expect(templates.length).toBeGreaterThan(0);
      });
    });

    describe('getConfigTemplate', () => {
      it('should return config template for known types', () => {
        const eslintConfig = getConfigTemplate('eslint');
        
        expect(eslintConfig).toBeDefined();
        expect(typeof eslintConfig).toBe('object');
        expect(eslintConfig?.content).toBeDefined();
      });
    });

    describe('FRAMEWORK_TEMPLATES', () => {
      it('should have templates for common frameworks', () => {
        expect(FRAMEWORK_TEMPLATES['react-typescript']).toBeDefined();
        expect(FRAMEWORK_TEMPLATES['nextjs']).toBeDefined();
        expect(FRAMEWORK_TEMPLATES['express']).toBeDefined();
      });
    });
  });

  describe('Config Generator', () => {
    describe('parseConfigFile', () => {
      it('should parse JSON config files', () => {
        const configPath = path.join(testDir, 'tsconfig.json');
        fs.writeFileSync(configPath, JSON.stringify({ compilerOptions: { strict: true } }));
        
        const parsed = parseConfigFile(configPath, 'tsconfig');
        
        expect(parsed).toBeDefined();
        expect(parsed?.type).toBe('tsconfig');
        expect(parsed?.isValid).toBe(true);
      });

      it('should handle invalid JSON gracefully', () => {
        const configPath = path.join(testDir, 'invalid.json');
        fs.writeFileSync(configPath, 'not valid json {');
        
        const parsed = parseConfigFile(configPath, 'eslint');
        
        // Should still return object but with isValid=false
        expect(parsed?.isValid).toBe(false);
      });
    });

    describe('analyzeConfigFile', () => {
      it('should analyze tsconfig.json', () => {
        const tsconfigPath = path.join(testDir, 'tsconfig.json');
        fs.writeFileSync(tsconfigPath, JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            strict: true
          }
        }));
        
        // First parse the config
        const parsed = parseConfigFile(tsconfigPath, 'tsconfig');
        expect(parsed).toBeDefined();
        
        // Then analyze it
        const issues = analyzeConfigFile(parsed!, 'react-typescript');
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should analyze package.json', () => {
        const pkgPath = path.join(testDir, 'package.json');
        fs.writeFileSync(pkgPath, JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          dependencies: { react: '^18.0.0' }
        }));
        
        const parsed = parseConfigFile(pkgPath, 'package-json');
        expect(parsed).toBeDefined();
        
        const issues = analyzeConfigFile(parsed!, 'react-typescript');
        expect(Array.isArray(issues)).toBe(true);
      });
    });
  });

  describe('Dependency Advisor', () => {
    describe('detectPackageManager', () => {
      it('should detect npm from package-lock.json', () => {
        fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{}');
        
        const manager = detectPackageManager(testDir);
        
        expect(manager).toBe('npm');
      });

      it('should detect pnpm from pnpm-lock.yaml', () => {
        fs.writeFileSync(path.join(testDir, 'pnpm-lock.yaml'), '');
        
        const manager = detectPackageManager(testDir);
        
        expect(manager).toBe('pnpm');
      });

      it('should detect yarn from yarn.lock', () => {
        fs.writeFileSync(path.join(testDir, 'yarn.lock'), '');
        
        const manager = detectPackageManager(testDir);
        
        expect(manager).toBe('yarn');
      });

      it('should default to unknown when no lock file or package.json', () => {
        const manager = detectPackageManager(testDir);
        
        expect(manager).toBe('unknown');
      });
    });

    describe('extractDependencies', () => {
      it('should extract dependencies from package.json', () => {
        fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0'
          },
          devDependencies: {
            typescript: '^5.0.0',
            vitest: '^1.0.0'
          }
        }));
        
        const deps = extractDependencies(testDir, 'npm');
        
        expect(Array.isArray(deps)).toBe(true);
        expect(deps.some(d => d.name === 'react')).toBe(true);
        expect(deps.some(d => d.name === 'typescript')).toBe(true);
      });

      it('should handle missing package.json', () => {
        const deps = extractDependencies(testDir, 'npm');
        
        expect(Array.isArray(deps)).toBe(true);
        expect(deps.length).toBe(0);
      });
    });
  });

  describe('Intelligence Report', () => {
    describe('generateIntelligenceReport', () => {
      it('should generate comprehensive report', async () => {
        // Create minimal project
        fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: { react: '^18.0.0' }
        }));
        fs.writeFileSync(path.join(testDir, 'tsconfig.json'), JSON.stringify({
          compilerOptions: { target: 'ES2020' }
        }));
        
        const report = await generateIntelligenceReport(testDir, 'react-typescript');
        
        expect(report).toBeDefined();
        expect(report.projectPath).toBe(testDir);
        expect(report.projectType).toBe('react-typescript');
        expect(report.structure).toBeDefined();
        expect(report.configuration).toBeDefined();
        expect(report.dependencies).toBeDefined();
      });

      it('should work with empty project', async () => {
        const report = await generateIntelligenceReport(testDir, 'react-typescript');
        
        expect(report).toBeDefined();
        expect(report.structure.structureScore).toBeLessThan(100);
      });
    });
  });
});
