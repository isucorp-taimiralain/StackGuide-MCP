/**
 * Tests for Project Intelligence System - Phase 4
 * @version 3.3.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  };
});

describe('Project Intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Framework Templates', () => {
    it('should have templates for all major frameworks', async () => {
      const { FRAMEWORK_TEMPLATES, getFrameworkTemplate } = await import('../src/services/intelligence/templates.js');
      
      expect(FRAMEWORK_TEMPLATES['react-typescript']).toBeDefined();
      expect(FRAMEWORK_TEMPLATES['nextjs']).toBeDefined();
      expect(FRAMEWORK_TEMPLATES['nestjs']).toBeDefined();
      expect(FRAMEWORK_TEMPLATES['express']).toBeDefined();
      expect(FRAMEWORK_TEMPLATES['python-fastapi']).toBeDefined();
      expect(FRAMEWORK_TEMPLATES['golang']).toBeDefined();
      expect(FRAMEWORK_TEMPLATES['rust']).toBeDefined();
    });

    it('should return template for valid project type', async () => {
      const { getFrameworkTemplate } = await import('../src/services/intelligence/templates.js');
      
      const template = getFrameworkTemplate('react-typescript');
      
      expect(template).toBeDefined();
      expect(template?.name).toBe('React TypeScript');
      expect(template?.requiredDirs).toContain('src');
      expect(template?.requiredFiles).toContain('package.json');
    });

    it('should return undefined for unknown project type', async () => {
      const { getFrameworkTemplate } = await import('../src/services/intelligence/templates.js');
      
      const template = getFrameworkTemplate('unknown-type');
      
      expect(template).toBeUndefined();
    });

    it('should include recommended dependencies', async () => {
      const { getFrameworkTemplate } = await import('../src/services/intelligence/templates.js');
      
      const template = getFrameworkTemplate('nestjs');
      
      expect(template?.recommendedDependencies.length).toBeGreaterThan(0);
      expect(template?.recommendedDependencies.some(d => d.name === '@nestjs/core')).toBe(true);
    });

    it('should include config templates', async () => {
      const { getFrameworkTemplate } = await import('../src/services/intelligence/templates.js');
      
      const template = getFrameworkTemplate('react-typescript');
      
      expect(template?.configTemplates.length).toBeGreaterThan(0);
      expect(template?.configTemplates.some(c => c.type === 'eslint')).toBe(true);
    });
  });

  describe('Config Generator', () => {
    it('should get config template by type', async () => {
      const { getConfigTemplate } = await import('../src/services/intelligence/templates.js');
      
      const eslintConfig = getConfigTemplate('eslint');
      
      expect(eslintConfig).toBeDefined();
      expect(eslintConfig?.filename).toBe('eslint.config.js');
      expect(eslintConfig?.content).toContain('eslint');
    });

    it('should get prettier config template', async () => {
      const { getConfigTemplate } = await import('../src/services/intelligence/templates.js');
      
      const prettierConfig = getConfigTemplate('prettier');
      
      expect(prettierConfig).toBeDefined();
      expect(prettierConfig?.filename).toBe('.prettierrc');
    });

    it('should get tsconfig template', async () => {
      const { getConfigTemplate } = await import('../src/services/intelligence/templates.js');
      
      const tsConfig = getConfigTemplate('tsconfig');
      
      expect(tsConfig).toBeDefined();
      expect(tsConfig?.content).toContain('"strict": true');
    });

    it('should return undefined for unknown config type', async () => {
      const { getConfigTemplate } = await import('../src/services/intelligence/templates.js');
      
      const config = getConfigTemplate('unknown');
      
      expect(config).toBeUndefined();
    });
  });

  describe('Structure Analyzer', () => {
    it('should export getDirPurpose function', async () => {
      const { getDirPurpose } = await import('../src/services/intelligence/structureAnalyzer.js');
      
      expect(typeof getDirPurpose).toBe('function');
    });

    it('should return purpose for common directories', async () => {
      const { getDirPurpose } = await import('../src/services/intelligence/structureAnalyzer.js');
      
      expect(getDirPurpose('src', 'react-typescript')).toContain('Source');
      expect(getDirPurpose('src/components', 'react-typescript')).toContain('component');
      expect(getDirPurpose('tests', 'react-typescript')).toContain('Test');
    });

    it('should export getFilePurpose function', async () => {
      const { getFilePurpose } = await import('../src/services/intelligence/structureAnalyzer.js');
      
      expect(typeof getFilePurpose).toBe('function');
    });

    it('should return purpose for common files', async () => {
      const { getFilePurpose } = await import('../src/services/intelligence/structureAnalyzer.js');
      
      expect(getFilePurpose('package.json')).toContain('Node');
      expect(getFilePurpose('tsconfig.json')).toContain('TypeScript');
      expect(getFilePurpose('.gitignore')).toContain('Git');
    });
  });

  describe('Dependency Advisor', () => {
    it('should detect npm as package manager', async () => {
      const { detectPackageManager } = await import('../src/services/intelligence/dependencyAdvisor.js');
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p.endsWith('package-lock.json') || p.endsWith('package.json');
      });
      
      const pm = detectPackageManager('/test/project');
      
      expect(pm).toBe('npm');
    });

    it('should detect pnpm as package manager', async () => {
      const { detectPackageManager } = await import('../src/services/intelligence/dependencyAdvisor.js');
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p.endsWith('pnpm-lock.yaml');
      });
      
      const pm = detectPackageManager('/test/project');
      
      expect(pm).toBe('pnpm');
    });

    it('should detect yarn as package manager', async () => {
      const { detectPackageManager } = await import('../src/services/intelligence/dependencyAdvisor.js');
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p.endsWith('yarn.lock');
      });
      
      const pm = detectPackageManager('/test/project');
      
      expect(pm).toBe('yarn');
    });

    it('should detect pip for Python projects', async () => {
      const { detectPackageManager } = await import('../src/services/intelligence/dependencyAdvisor.js');
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p.endsWith('requirements.txt');
      });
      
      const pm = detectPackageManager('/test/project');
      
      expect(pm).toBe('pip');
    });

    it('should detect cargo for Rust projects', async () => {
      const { detectPackageManager } = await import('../src/services/intelligence/dependencyAdvisor.js');
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p.endsWith('Cargo.lock');
      });
      
      const pm = detectPackageManager('/test/project');
      
      expect(pm).toBe('cargo');
    });

    it('should generate correct npm install command', async () => {
      const { generateInstallCommand } = await import('../src/services/intelligence/projectIntelligence.js');
      
      const deps = [
        { name: 'eslint', reason: 'linting', category: 'linting' as const, priority: 'high' as const },
        { name: 'prettier', reason: 'formatting', category: 'dx' as const, priority: 'high' as const }
      ];
      
      const cmd = generateInstallCommand(deps, 'npm', true);
      
      expect(cmd).toContain('npm install');
      expect(cmd).toContain('-D');
      expect(cmd).toContain('eslint');
      expect(cmd).toContain('prettier');
    });

    it('should generate correct pnpm install command', async () => {
      const { generateInstallCommand } = await import('../src/services/intelligence/projectIntelligence.js');
      
      const deps = [
        { name: 'vitest', reason: 'testing', category: 'testing' as const, priority: 'high' as const }
      ];
      
      const cmd = generateInstallCommand(deps, 'pnpm', true);
      
      expect(cmd).toContain('pnpm add');
      expect(cmd).toContain('-D');
      expect(cmd).toContain('vitest');
    });
  });

  describe('Project Intelligence Service', () => {
    it('should export generateIntelligenceReport function', async () => {
      const { generateIntelligenceReport } = await import('../src/services/intelligence/projectIntelligence.js');
      
      expect(typeof generateIntelligenceReport).toBe('function');
    });

    it('should export formatIntelligenceReport function', async () => {
      const { formatIntelligenceReport } = await import('../src/services/intelligence/projectIntelligence.js');
      
      expect(typeof formatIntelligenceReport).toBe('function');
    });

    it('should format report with correct headers', async () => {
      const { formatIntelligenceReport } = await import('../src/services/intelligence/projectIntelligence.js');
      
      const mockReport = {
        timestamp: new Date().toISOString(),
        projectPath: '/test/project',
        projectType: 'react-typescript',
        confidence: 'high' as const,
        overallScore: 85,
        grade: 'B' as const,
        structure: {
          rootPath: '/test/project',
          projectType: 'react-typescript',
          structureScore: 80,
          existingDirs: ['src'],
          missingDirs: [],
          existingFiles: ['package.json'],
          missingFiles: [],
          improvements: []
        },
        configuration: {
          existingConfigs: [],
          recommendedConfigs: [],
          issues: [],
          configScore: 90
        },
        dependencies: {
          packageManager: 'npm' as const,
          totalDependencies: 10,
          directDependencies: [],
          devDependencies: [],
          outdatedPackages: [],
          vulnerabilities: [],
          recommendedAdditions: [],
          unnecessaryDependencies: [],
          dependencyScore: 85
        },
        priorityActions: [],
        suggestedWorkflow: [],
        estimatedEffort: 'minimal' as const
      };
      
      const formatted = formatIntelligenceReport(mockReport);
      
      expect(formatted).toContain('# 🧠 Project Intelligence Report');
      expect(formatted).toContain('85/100');
      expect(formatted).toContain('Grade B');
      expect(formatted).toContain('Structure');
      expect(formatted).toContain('Configuration');
      expect(formatted).toContain('Dependencies');
    });
  });

  describe('Analyze Handler', () => {
    it('should be exported from handlers', async () => {
      const { handleAnalyze } = await import('../src/handlers/index.js');
      
      expect(typeof handleAnalyze).toBe('function');
    });
  });

  describe('Tool Definition', () => {
    it('should include analyze tool definition', async () => {
      const { toolDefinitions } = await import('../src/tools/definitions.js');
      
      const analyzeTool = toolDefinitions.find(t => t.name === 'analyze');
      
      expect(analyzeTool).toBeDefined();
      expect(analyzeTool?.description).toContain('Intelligence');
      expect(analyzeTool?.inputSchema.properties.action).toBeDefined();
      expect(analyzeTool?.inputSchema.properties.action.enum).toContain('full');
      expect(analyzeTool?.inputSchema.properties.action.enum).toContain('structure');
      expect(analyzeTool?.inputSchema.properties.action.enum).toContain('config');
      expect(analyzeTool?.inputSchema.properties.action.enum).toContain('dependencies');
    });
  });

  describe('Types', () => {
    it('should export all required types', async () => {
      const types = await import('../src/services/intelligence/types.js');
      
      // Just importing should work - types are compile-time only
      expect(types).toBeDefined();
    });
  });

  describe('Index exports', () => {
    it('should export all intelligence functions', async () => {
      const intelligence = await import('../src/services/intelligence/index.js');
      
      expect(typeof intelligence.generateIntelligenceReport).toBe('function');
      expect(typeof intelligence.applyAutoFixes).toBe('function');
      expect(typeof intelligence.formatIntelligenceReport).toBe('function');
      expect(typeof intelligence.analyzeStructure).toBe('function');
      expect(typeof intelligence.analyzeConfigurations).toBe('function');
      expect(typeof intelligence.analyzeDependencies).toBe('function');
      expect(typeof intelligence.generateSmartConfig).toBe('function');
      expect(typeof intelligence.getFrameworkTemplate).toBe('function');
      expect(typeof intelligence.getAllTemplates).toBe('function');
    });
  });
});
