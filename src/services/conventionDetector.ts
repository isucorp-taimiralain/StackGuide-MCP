/**
 * Convention Detector Service
 * 
 * Detects project code conventions by analyzing:
 * - ESLint, Prettier, EditorConfig configurations
 * - Existing code patterns in the project
 * - TSConfig settings
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface CodeConventions {
  // Formatting
  indentation: 'tabs' | 'spaces';
  indentSize: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingComma: 'none' | 'es5' | 'all';
  
  // Naming conventions
  componentNaming: 'PascalCase' | 'camelCase' | 'kebab-case';
  fileNaming: 'PascalCase' | 'camelCase' | 'kebab-case' | 'snake_case';
  
  // React specific
  reactStyle: 'functional' | 'class' | 'mixed';
  propsStyle: 'interface' | 'type' | 'inline';
  stateManagement: 'useState' | 'redux' | 'zustand' | 'jotai' | 'context' | 'none';
  
  // TypeScript
  strictMode: boolean;
  
  // Testing
  testFramework: 'jest' | 'vitest' | 'mocha' | 'none';
  testLocation: 'alongside' | '__tests__' | 'tests';
  
  // Imports
  importStyle: 'named' | 'default' | 'mixed';
  importOrder: string[];
  
  // Detected from
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
}

const DEFAULT_CONVENTIONS: CodeConventions = {
  indentation: 'spaces',
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
  testFramework: 'none',
  testLocation: '__tests__',
  importStyle: 'named',
  importOrder: ['react', 'libraries', 'components', 'utils', 'styles'],
  sources: [],
  confidence: 'low'
};

/**
 * Read and parse JSON file safely
 */
function readJsonFile(filePath: string): Record<string, any> | null {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Remove comments for JSON files that support them (like tsconfig)
      const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      return JSON.parse(cleaned);
    }
  } catch (error) {
    logger.debug(`Failed to parse ${filePath}`, { error });
  }
  return null;
}

/**
 * Parse EditorConfig file
 */
function parseEditorConfig(projectPath: string): Partial<CodeConventions> {
  const editorConfigPath = path.join(projectPath, '.editorconfig');
  const conventions: Partial<CodeConventions> = {};
  
  try {
    if (fs.existsSync(editorConfigPath)) {
      const content = fs.readFileSync(editorConfigPath, 'utf-8');
      
      // Parse indent_style
      const indentStyleMatch = content.match(/indent_style\s*=\s*(tab|space)/i);
      if (indentStyleMatch) {
        conventions.indentation = indentStyleMatch[1].toLowerCase() === 'tab' ? 'tabs' : 'spaces';
      }
      
      // Parse indent_size
      const indentSizeMatch = content.match(/indent_size\s*=\s*(\d+)/i);
      if (indentSizeMatch) {
        conventions.indentSize = parseInt(indentSizeMatch[1], 10);
      }
    }
  } catch (error) {
    logger.debug('Failed to parse .editorconfig', { error });
  }
  
  return conventions;
}

/**
 * Parse Prettier configuration
 */
function parsePrettierConfig(projectPath: string): Partial<CodeConventions> {
  const conventions: Partial<CodeConventions> = {};
  
  // Check various Prettier config locations
  const prettierFiles = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
    'prettier.config.cjs'
  ];
  
  for (const file of prettierFiles) {
    const filePath = path.join(projectPath, file);
    
    if (file.endsWith('.json') || file === '.prettierrc') {
      const config = readJsonFile(filePath);
      if (config) {
        if (config.useTabs !== undefined) {
          conventions.indentation = config.useTabs ? 'tabs' : 'spaces';
        }
        if (config.tabWidth !== undefined) {
          conventions.indentSize = config.tabWidth;
        }
        if (config.singleQuote !== undefined) {
          conventions.quotes = config.singleQuote ? 'single' : 'double';
        }
        if (config.semi !== undefined) {
          conventions.semicolons = config.semi;
        }
        if (config.trailingComma !== undefined) {
          conventions.trailingComma = config.trailingComma as 'none' | 'es5' | 'all';
        }
        return conventions;
      }
    }
  }
  
  // Check package.json for prettier config
  const packageJson = readJsonFile(path.join(projectPath, 'package.json'));
  if (packageJson?.prettier) {
    const config = packageJson.prettier;
    if (config.useTabs !== undefined) conventions.indentation = config.useTabs ? 'tabs' : 'spaces';
    if (config.tabWidth !== undefined) conventions.indentSize = config.tabWidth;
    if (config.singleQuote !== undefined) conventions.quotes = config.singleQuote ? 'single' : 'double';
    if (config.semi !== undefined) conventions.semicolons = config.semi;
    if (config.trailingComma !== undefined) conventions.trailingComma = config.trailingComma;
  }
  
  return conventions;
}

/**
 * Parse ESLint configuration
 */
function parseEslintConfig(projectPath: string): Partial<CodeConventions> {
  const conventions: Partial<CodeConventions> = {};
  
  const eslintFiles = [
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    'eslint.config.js',
    'eslint.config.mjs'
  ];
  
  for (const file of eslintFiles) {
    const filePath = path.join(projectPath, file);
    
    if (file.endsWith('.json')) {
      const config = readJsonFile(filePath);
      if (config?.rules) {
        // Check quote style
        if (config.rules.quotes) {
          const quoteRule = Array.isArray(config.rules.quotes) 
            ? config.rules.quotes[1] 
            : config.rules.quotes;
          if (quoteRule === 'single' || quoteRule === 'double') {
            conventions.quotes = quoteRule;
          }
        }
        
        // Check semicolons
        if (config.rules.semi) {
          const semiRule = Array.isArray(config.rules.semi) 
            ? config.rules.semi[1] 
            : config.rules.semi;
          conventions.semicolons = semiRule === 'always';
        }
        
        // Check indent
        if (config.rules.indent) {
          const indentRule = Array.isArray(config.rules.indent) 
            ? config.rules.indent[1] 
            : config.rules.indent;
          if (indentRule === 'tab') {
            conventions.indentation = 'tabs';
          } else if (typeof indentRule === 'number') {
            conventions.indentation = 'spaces';
            conventions.indentSize = indentRule;
          }
        }
        
        return conventions;
      }
    }
  }
  
  return conventions;
}

/**
 * Parse TypeScript configuration
 */
function parseTsConfig(projectPath: string): Partial<CodeConventions> {
  const conventions: Partial<CodeConventions> = {};
  
  const tsConfig = readJsonFile(path.join(projectPath, 'tsconfig.json'));
  if (tsConfig?.compilerOptions) {
    const opts = tsConfig.compilerOptions;
    
    // Check strict mode
    conventions.strictMode = opts.strict === true;
    
    // Check for additional strict flags
    if (opts.noImplicitAny || opts.strictNullChecks || opts.strictFunctionTypes) {
      conventions.strictMode = true;
    }
  }
  
  return conventions;
}

/**
 * Detect state management from dependencies
 */
function detectStateManagement(projectPath: string): CodeConventions['stateManagement'] {
  const packageJson = readJsonFile(path.join(projectPath, 'package.json'));
  if (!packageJson?.dependencies && !packageJson?.devDependencies) {
    return 'useState';
  }
  
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (deps['zustand']) return 'zustand';
  if (deps['jotai']) return 'jotai';
  if (deps['@reduxjs/toolkit'] || deps['redux'] || deps['react-redux']) return 'redux';
  if (deps['recoil']) return 'context'; // Similar pattern to context
  
  return 'useState';
}

/**
 * Detect test framework from dependencies
 */
function detectTestFramework(projectPath: string): CodeConventions['testFramework'] {
  const packageJson = readJsonFile(path.join(projectPath, 'package.json'));
  if (!packageJson?.dependencies && !packageJson?.devDependencies) {
    return 'none';
  }
  
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (deps['vitest']) return 'vitest';
  if (deps['jest']) return 'jest';
  if (deps['mocha']) return 'mocha';
  
  return 'none';
}

/**
 * Detect test location by scanning project
 */
function detectTestLocation(projectPath: string): CodeConventions['testLocation'] {
  if (fs.existsSync(path.join(projectPath, '__tests__'))) return '__tests__';
  if (fs.existsSync(path.join(projectPath, 'tests'))) return 'tests';
  if (fs.existsSync(path.join(projectPath, 'test'))) return 'tests';
  
  // Check for .test. or .spec. files alongside source
  const srcPath = path.join(projectPath, 'src');
  if (fs.existsSync(srcPath)) {
    try {
      const files = fs.readdirSync(srcPath);
      for (const file of files) {
        if (file.includes('.test.') || file.includes('.spec.')) {
          return 'alongside';
        }
      }
    } catch { /* ignore */ }
  }
  
  return '__tests__';
}

/**
 * Analyze existing code patterns
 */
function analyzeCodePatterns(projectPath: string): Partial<CodeConventions> {
  const conventions: Partial<CodeConventions> = {};
  const srcPath = path.join(projectPath, 'src');
  
  if (!fs.existsSync(srcPath)) return conventions;
  
  try {
    const files = fs.readdirSync(srcPath).filter(f => 
      f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')
    );
    
    let functionalCount = 0;
    let classCount = 0;
    let interfaceCount = 0;
    let typeCount = 0;
    let singleQuotes = 0;
    let doubleQuotes = 0;
    let withSemicolons = 0;
    let withoutSemicolons = 0;
    
    for (const file of files.slice(0, 10)) {
      try {
        const content = fs.readFileSync(path.join(srcPath, file), 'utf-8');
        
        // Check component style
        if (/const\s+\w+\s*[:=]\s*(?:React\.)?FC|function\s+\w+\s*\(/.test(content)) {
          functionalCount++;
        }
        if (/class\s+\w+\s+extends\s+(?:React\.)?Component/.test(content)) {
          classCount++;
        }
        
        // Check props style
        if (/interface\s+\w+Props/.test(content)) interfaceCount++;
        if (/type\s+\w+Props\s*=/.test(content)) typeCount++;
        
        // Check quotes (simple heuristic)
        const singleMatches = (content.match(/'/g) || []).length;
        const doubleMatches = (content.match(/"/g) || []).length;
        if (singleMatches > doubleMatches) singleQuotes++;
        else doubleQuotes++;
        
        // Check semicolons
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        const semiLines = lines.filter(l => l.trim().endsWith(';')).length;
        if (semiLines > lines.length * 0.3) withSemicolons++;
        else withoutSemicolons++;
        
      } catch { /* ignore */ }
    }
    
    // Determine patterns from analysis
    if (functionalCount > classCount) conventions.reactStyle = 'functional';
    else if (classCount > functionalCount) conventions.reactStyle = 'class';
    else conventions.reactStyle = 'mixed';
    
    if (interfaceCount > typeCount) conventions.propsStyle = 'interface';
    else if (typeCount > interfaceCount) conventions.propsStyle = 'type';
    
    if (singleQuotes > doubleQuotes) conventions.quotes = 'single';
    else conventions.quotes = 'double';
    
    conventions.semicolons = withSemicolons > withoutSemicolons;
    
    // Detect file naming from actual files
    const componentFiles = files.filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    if (componentFiles.length > 0) {
      const sample = componentFiles[0].replace(/\.(tsx|jsx)$/, '');
      if (/^[A-Z][a-zA-Z]+$/.test(sample)) conventions.fileNaming = 'PascalCase';
      else if (/^[a-z][a-zA-Z]+$/.test(sample)) conventions.fileNaming = 'camelCase';
      else if (/^[a-z]+-[a-z-]+$/.test(sample)) conventions.fileNaming = 'kebab-case';
      else if (/^[a-z]+_[a-z_]+$/.test(sample)) conventions.fileNaming = 'snake_case';
    }
    
  } catch (error) {
    logger.debug('Failed to analyze code patterns', { error });
  }
  
  return conventions;
}

/**
 * Detect all code conventions for a project
 */
export function detectConventions(projectPath: string): CodeConventions {
  const sources: string[] = [];
  let conventions: CodeConventions = { ...DEFAULT_CONVENTIONS };
  
  // Parse EditorConfig
  const editorConfig = parseEditorConfig(projectPath);
  if (Object.keys(editorConfig).length > 0) {
    conventions = { ...conventions, ...editorConfig };
    sources.push('.editorconfig');
  }
  
  // Parse Prettier (overrides EditorConfig)
  const prettierConfig = parsePrettierConfig(projectPath);
  if (Object.keys(prettierConfig).length > 0) {
    conventions = { ...conventions, ...prettierConfig };
    sources.push('prettier');
  }
  
  // Parse ESLint
  const eslintConfig = parseEslintConfig(projectPath);
  if (Object.keys(eslintConfig).length > 0) {
    conventions = { ...conventions, ...eslintConfig };
    sources.push('eslint');
  }
  
  // Parse TSConfig
  const tsConfig = parseTsConfig(projectPath);
  if (Object.keys(tsConfig).length > 0) {
    conventions = { ...conventions, ...tsConfig };
    sources.push('tsconfig');
  }
  
  // Detect from package.json dependencies
  conventions.stateManagement = detectStateManagement(projectPath);
  conventions.testFramework = detectTestFramework(projectPath);
  conventions.testLocation = detectTestLocation(projectPath);
  
  // Analyze code patterns (lowest priority, fill in gaps)
  const codePatterns = analyzeCodePatterns(projectPath);
  for (const [key, value] of Object.entries(codePatterns)) {
    if (value !== undefined && (conventions as any)[key] === DEFAULT_CONVENTIONS[key as keyof CodeConventions]) {
      (conventions as any)[key] = value;
    }
  }
  
  if (Object.keys(codePatterns).length > 0) {
    sources.push('code-analysis');
  }
  
  // Set confidence based on sources
  conventions.sources = sources;
  if (sources.includes('prettier') || sources.includes('eslint')) {
    conventions.confidence = 'high';
  } else if (sources.includes('.editorconfig') || sources.includes('tsconfig')) {
    conventions.confidence = 'medium';
  } else if (sources.includes('code-analysis')) {
    conventions.confidence = 'low';
  }
  
  logger.debug('Detected conventions', { 
    sources, 
    confidence: conventions.confidence,
    indentation: conventions.indentation,
    quotes: conventions.quotes
  });
  
  return conventions;
}

/**
 * Format code according to conventions
 */
export function formatWithConventions(code: string, conventions: CodeConventions): string {
  let formatted = code;
  
  // Apply indentation
  if (conventions.indentation === 'tabs') {
    formatted = formatted.replace(/^( {2,})/gm, (match) => {
      return '\t'.repeat(Math.floor(match.length / 2));
    });
  } else {
    const indent = ' '.repeat(conventions.indentSize);
    formatted = formatted.replace(/^\t+/gm, (match) => {
      return indent.repeat(match.length);
    });
  }
  
  // Apply quotes (simple replacement - doesn't handle complex cases)
  if (conventions.quotes === 'single') {
    // Only replace in simple string cases, avoid JSX attributes
    formatted = formatted.replace(/(?<!<[^>]*)"([^"]*)"(?![^<]*>)/g, "'$1'");
  } else {
    formatted = formatted.replace(/(?<!<[^>])'([^'])'(?![^<]*>)/g, '"$1"');
  }
  
  // Note: Full formatting should use Prettier/ESLint programmatically
  // This is a basic implementation for template generation
  
  return formatted;
}

/**
 * Get convention summary as markdown
 */
export function getConventionsSummary(conventions: CodeConventions): string {
  return `
## Detected Conventions

**Confidence:** ${conventions.confidence}
**Sources:** ${conventions.sources.join(', ') || 'defaults'}

### Formatting
- Indentation: ${conventions.indentation} (${conventions.indentSize})
- Quotes: ${conventions.quotes}
- Semicolons: ${conventions.semicolons ? 'yes' : 'no'}
- Trailing Comma: ${conventions.trailingComma}

### React
- Component Style: ${conventions.reactStyle}
- Props Definition: ${conventions.propsStyle}
- State Management: ${conventions.stateManagement}

### TypeScript
- Strict Mode: ${conventions.strictMode ? 'yes' : 'no'}

### Testing
- Framework: ${conventions.testFramework}
- Location: ${conventions.testLocation}
`.trim();
}
