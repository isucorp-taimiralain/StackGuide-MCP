/**
 * Smart Configuration Generator
 * Generates optimal configuration files based on project analysis
 * @version 3.3.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ConfigAnalysis,
  ConfigFile,
  ConfigType,
  ConfigRecommendation,
  ConfigIssue,
  SmartConfig
} from './types.js';
import { getFrameworkTemplate, getConfigTemplate } from './templates.js';

/**
 * Configuration file patterns for detection
 */
const CONFIG_PATTERNS: Record<ConfigType, string[]> = {
  'eslint': ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'],
  'prettier': ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'],
  'tsconfig': ['tsconfig.json', 'tsconfig.*.json'],
  'jest': ['jest.config.js', 'jest.config.ts', 'jest.config.json'],
  'vitest': ['vitest.config.ts', 'vitest.config.js'],
  'babel': ['.babelrc', '.babelrc.js', 'babel.config.js', 'babel.config.json'],
  'webpack': ['webpack.config.js', 'webpack.config.ts'],
  'vite': ['vite.config.js', 'vite.config.ts'],
  'rollup': ['rollup.config.js', 'rollup.config.ts'],
  'docker': ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'],
  'github-actions': ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
  'editorconfig': ['.editorconfig'],
  'gitignore': ['.gitignore'],
  'env': ['.env', '.env.local', '.env.example'],
  'package-json': ['package.json'],
  'pyproject': ['pyproject.toml'],
  'cargo': ['Cargo.toml'],
  'go-mod': ['go.mod'],
  'other': []
};

/**
 * Analyze existing configuration files
 */
export function analyzeConfigurations(projectPath: string, projectType: string): ConfigAnalysis {
  const existingConfigs: ConfigFile[] = [];
  const recommendedConfigs: ConfigRecommendation[] = [];
  const issues: ConfigIssue[] = [];
  
  // Scan for existing configs
  for (const [configType, patterns] of Object.entries(CONFIG_PATTERNS)) {
    for (const pattern of patterns) {
      const configPath = path.join(projectPath, pattern);
      if (fs.existsSync(configPath) && !pattern.includes('*')) {
        const configFile = parseConfigFile(configPath, configType as ConfigType);
        if (configFile) {
          existingConfigs.push(configFile);
          // Analyze for issues
          const configIssues = analyzeConfigFile(configFile, projectType);
          issues.push(...configIssues);
        }
      }
    }
  }
  
  // Determine what's missing
  const template = getFrameworkTemplate(projectType);
  const existingTypes = new Set(existingConfigs.map(c => c.type));
  
  // Check for recommended configs
  if (!existingTypes.has('eslint')) {
    recommendedConfigs.push({
      type: 'eslint',
      filename: 'eslint.config.js',
      description: 'Code linting and quality enforcement',
      priority: 'high',
      suggestedContent: getConfigTemplate('eslint')?.content || '',
      reason: 'ESLint helps catch bugs and enforce code style'
    });
  }
  
  if (!existingTypes.has('prettier')) {
    recommendedConfigs.push({
      type: 'prettier',
      filename: '.prettierrc',
      description: 'Automatic code formatting',
      priority: 'high',
      suggestedContent: getConfigTemplate('prettier')?.content || '',
      reason: 'Prettier ensures consistent code formatting'
    });
  }
  
  if (!existingTypes.has('editorconfig')) {
    recommendedConfigs.push({
      type: 'editorconfig',
      filename: '.editorconfig',
      description: 'Editor-agnostic settings',
      priority: 'medium',
      suggestedContent: getConfigTemplate('editorconfig')?.content || '',
      reason: 'EditorConfig ensures consistent editor settings across team'
    });
  }
  
  if (!existingTypes.has('gitignore')) {
    recommendedConfigs.push({
      type: 'gitignore',
      filename: '.gitignore',
      description: 'Git ignore patterns',
      priority: 'critical',
      suggestedContent: getConfigTemplate('gitignore')?.content || '',
      reason: 'Prevents committing sensitive or generated files'
    });
  }
  
  // TypeScript projects should have tsconfig
  const needsTypeScript = ['react-typescript', 'nextjs', 'nestjs', 'express', 'vue-node'].includes(projectType);
  if (needsTypeScript && !existingTypes.has('tsconfig')) {
    recommendedConfigs.push({
      type: 'tsconfig',
      filename: 'tsconfig.json',
      description: 'TypeScript compiler configuration',
      priority: 'critical',
      suggestedContent: getConfigTemplate('tsconfig')?.content || '',
      reason: 'TypeScript configuration is required for type checking'
    });
  }
  
  // Calculate config score
  const configScore = calculateConfigScore(existingConfigs, recommendedConfigs, issues);
  
  return {
    existingConfigs,
    recommendedConfigs,
    issues,
    configScore
  };
}

/**
 * Parse a configuration file
 */
function parseConfigFile(filePath: string, type: ConfigType): ConfigFile | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let settings: Record<string, unknown> = {};
    let isValid = true;
    const issues: string[] = [];
    
    if (filePath.endsWith('.json')) {
      try {
        settings = JSON.parse(content);
      } catch {
        isValid = false;
        issues.push('Invalid JSON syntax');
      }
    } else if (filePath.endsWith('.toml')) {
      // Basic TOML parsing (simplified)
      settings = { _raw: content };
    } else if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.ts')) {
      // JS configs need to be required/imported - just mark as existing
      settings = { _type: 'javascript-config' };
    } else {
      // Try JSON first, then mark as raw
      try {
        settings = JSON.parse(content);
      } catch {
        settings = { _raw: content };
      }
    }
    
    return {
      path: filePath,
      type,
      isValid,
      settings,
      issues: issues.length > 0 ? issues : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Analyze a config file for issues
 */
function analyzeConfigFile(config: ConfigFile, projectType: string): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  
  // TSConfig analysis
  if (config.type === 'tsconfig' && config.settings) {
    const compilerOptions = config.settings.compilerOptions as Record<string, unknown> | undefined;
    
    if (compilerOptions) {
      // Check strict mode
      if (!compilerOptions.strict) {
        issues.push({
          file: config.path,
          type: 'tsconfig',
          severity: 'warning',
          message: 'Strict mode is not enabled',
          suggestion: 'Enable "strict": true for better type safety',
          autoFixable: true,
          fix: {
            type: 'modify',
            path: config.path,
            key: 'compilerOptions.strict',
            value: true,
            description: 'Enable strict type checking'
          }
        });
      }
      
      // Check noImplicitAny
      if (!compilerOptions.strict && !compilerOptions.noImplicitAny) {
        issues.push({
          file: config.path,
          type: 'tsconfig',
          severity: 'warning',
          message: 'noImplicitAny is not enabled',
          suggestion: 'Enable "noImplicitAny": true to prevent implicit any types',
          autoFixable: true,
          fix: {
            type: 'modify',
            path: config.path,
            key: 'compilerOptions.noImplicitAny',
            value: true,
            description: 'Prevent implicit any types'
          }
        });
      }
      
      // Check ES module interop
      if (compilerOptions.esModuleInterop === false) {
        issues.push({
          file: config.path,
          type: 'tsconfig',
          severity: 'info',
          message: 'esModuleInterop is disabled',
          suggestion: 'Consider enabling for better CommonJS/ES module interoperability',
          autoFixable: true,
          fix: {
            type: 'modify',
            path: config.path,
            key: 'compilerOptions.esModuleInterop',
            value: true,
            description: 'Enable ES module interop'
          }
        });
      }
    }
  }
  
  // Package.json analysis
  if (config.type === 'package-json' && config.settings) {
    const pkg = config.settings as Record<string, unknown>;
    
    // Check for missing scripts
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (!scripts) {
      issues.push({
        file: config.path,
        type: 'package-json',
        severity: 'warning',
        message: 'No scripts defined in package.json',
        suggestion: 'Add common scripts like "build", "test", "lint"',
        autoFixable: false
      });
    } else {
      if (!scripts.lint && !scripts['lint:fix']) {
        issues.push({
          file: config.path,
          type: 'package-json',
          severity: 'info',
          message: 'No lint script defined',
          suggestion: 'Add a "lint" script to run ESLint',
          autoFixable: true,
          fix: {
            type: 'add',
            path: config.path,
            key: 'scripts.lint',
            value: 'eslint .',
            description: 'Add lint script'
          }
        });
      }
      
      if (!scripts.format) {
        issues.push({
          file: config.path,
          type: 'package-json',
          severity: 'info',
          message: 'No format script defined',
          suggestion: 'Add a "format" script to run Prettier',
          autoFixable: true,
          fix: {
            type: 'add',
            path: config.path,
            key: 'scripts.format',
            value: 'prettier --write .',
            description: 'Add format script'
          }
        });
      }
    }
    
    // Check for engines field
    if (!pkg.engines) {
      issues.push({
        file: config.path,
        type: 'package-json',
        severity: 'info',
        message: 'No engines field specified',
        suggestion: 'Specify Node.js version requirements in engines field',
        autoFixable: true,
        fix: {
          type: 'add',
          path: config.path,
          key: 'engines',
          value: { node: '>=18.0.0' },
          description: 'Add engines field'
        }
      });
    }
  }
  
  return issues;
}

/**
 * Generate a smart configuration
 */
export function generateSmartConfig(
  configType: ConfigType,
  projectType: string,
  customizations?: Record<string, unknown>
): SmartConfig | null {
  const template = getConfigTemplate(configType as string);
  if (!template) return null;
  
  // Apply customizations if provided
  if (customizations && template.content) {
    let content = template.content;
    
    // For JSON configs, we can merge customizations
    if (template.filename.endsWith('.json') || template.filename.endsWith('rc')) {
      try {
        const parsed = JSON.parse(content);
        const merged = { ...parsed, ...customizations };
        content = JSON.stringify(merged, null, 2);
        return { ...template, content };
      } catch {
        // Not JSON, return as-is
      }
    }
  }
  
  return template;
}

/**
 * Calculate configuration health score
 */
function calculateConfigScore(
  existing: ConfigFile[],
  recommended: ConfigRecommendation[],
  issues: ConfigIssue[]
): number {
  let score = 100;
  
  // Deduct for missing critical configs
  const criticalMissing = recommended.filter(r => r.priority === 'critical').length;
  score -= criticalMissing * 15;
  
  // Deduct for missing high priority configs
  const highMissing = recommended.filter(r => r.priority === 'high').length;
  score -= highMissing * 10;
  
  // Deduct for issues
  const errorIssues = issues.filter(i => i.severity === 'error').length;
  const warningIssues = issues.filter(i => i.severity === 'warning').length;
  score -= errorIssues * 10;
  score -= warningIssues * 5;
  
  // Bonus for having good configs
  if (existing.some(c => c.type === 'eslint')) score += 5;
  if (existing.some(c => c.type === 'prettier')) score += 5;
  if (existing.some(c => c.type === 'tsconfig')) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Apply a configuration fix
 */
export function applyConfigFix(projectPath: string, fix: ConfigIssue['fix']): boolean {
  if (!fix) return false;
  
  try {
    const content = fs.readFileSync(fix.path, 'utf-8');
    let parsed: Record<string, unknown>;
    
    try {
      parsed = JSON.parse(content);
    } catch {
      // Can't fix non-JSON files automatically
      return false;
    }
    
    if (fix.type === 'add' || fix.type === 'modify') {
      // Navigate to nested key
      const keys = fix.key?.split('.') || [];
      let current: Record<string, unknown> = parsed;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as Record<string, unknown>;
      }
      
      if (keys.length > 0) {
        current[keys[keys.length - 1]] = fix.value;
      }
    } else if (fix.type === 'remove' && fix.key) {
      const keys = fix.key.split('.');
      let current: Record<string, unknown> = parsed;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]] as Record<string, unknown>;
        if (!current) break;
      }
      
      if (current && keys.length > 0) {
        delete current[keys[keys.length - 1]];
      }
    }
    
    fs.writeFileSync(fix.path, JSON.stringify(parsed, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

export { parseConfigFile, analyzeConfigFile };
