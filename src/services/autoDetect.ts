/**
 * Auto-detection service for StackGuide MCP
 * Analyzes project files to automatically detect the project type and suggest configurations
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DetectionResult {
  detected: boolean;
  projectType: string | null;
  confidence: 'high' | 'medium' | 'low';
  indicators: string[];
  suggestions: string[];
  frameworks: string[];
  languages: string[];
}

export interface ProjectAnalysis {
  hasPackageJson: boolean;
  hasRequirementsTxt: boolean;
  hasPipfile: boolean;
  hasPoetryLock: boolean;
  hasComposerJson: boolean;
  hasGemfile: boolean;
  hasGoMod: boolean;
  hasCargoToml: boolean;
  hasTsConfig: boolean;
  frameworks: string[];
  dependencies: string[];
}

// Framework detection patterns
const FRAMEWORK_PATTERNS: Record<string, { dependencies: string[]; files: string[]; projectType: string }> = {
  // Python
  django: {
    dependencies: ['django', 'djangorestframework', 'django-rest-framework'],
    files: ['manage.py', 'settings.py', 'wsgi.py', 'asgi.py'],
    projectType: 'python-django'
  },
  fastapi: {
    dependencies: ['fastapi', 'uvicorn', 'starlette'],
    files: [],
    projectType: 'python-fastapi'
  },
  flask: {
    dependencies: ['flask', 'flask-restful', 'flask-sqlalchemy'],
    files: [],
    projectType: 'python-flask'
  },
  
  // JavaScript/TypeScript
  nextjs: {
    dependencies: ['next', 'next.js'],
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    projectType: 'nextjs'
  },
  react: {
    dependencies: ['react', 'react-dom'],
    files: [],
    projectType: 'react-node'
  },
  vue: {
    dependencies: ['vue', 'nuxt', '@vue/cli'],
    files: ['vue.config.js', 'nuxt.config.js'],
    projectType: 'vue-node'
  },
  nestjs: {
    dependencies: ['@nestjs/core', '@nestjs/common'],
    files: ['nest-cli.json'],
    projectType: 'nestjs'
  },
  express: {
    dependencies: ['express'],
    files: [],
    projectType: 'express'
  },
  
  // PHP
  laravel: {
    dependencies: ['laravel/framework'],
    files: ['artisan', 'app/Http/Kernel.php'],
    projectType: 'laravel'
  },
  
  // Ruby
  rails: {
    dependencies: ['rails', 'railties'],
    files: ['config/application.rb', 'bin/rails', 'Rakefile'],
    projectType: 'rails'
  },
  
  // Go
  golang: {
    dependencies: [],
    files: ['go.mod', 'go.sum', 'main.go'],
    projectType: 'golang'
  },
  
  // Rust
  rust: {
    dependencies: [],
    files: ['Cargo.toml', 'Cargo.lock'],
    projectType: 'rust'
  }
};

// Suggested rules per project type
const SUGGESTED_RULES: Record<string, string[]> = {
  'python-django': [
    'django-best-practices',
    'django-standards',
    'security-guidelines',
    'Use Django ORM properly with select_related and prefetch_related',
    'Follow MVT pattern strictly',
    'Implement proper authentication with Django REST Framework'
  ],
  'python-fastapi': [
    'Use Pydantic models for validation',
    'Implement async endpoints for I/O operations',
    'Use dependency injection for shared resources',
    'Follow OpenAPI documentation best practices'
  ],
  'python-flask': [
    'Use Flask Blueprints for modular code',
    'Implement proper error handling',
    'Use Flask-SQLAlchemy for database operations',
    'Follow application factory pattern'
  ],
  'react-node': [
    'react-best-practices',
    'react-standards',
    'node-standards',
    'security-guidelines',
    'Use functional components with hooks',
    'Implement proper state management',
    'Follow Express.js best practices'
  ],
  'react-typescript': [
    'Use strict TypeScript configuration',
    'Define proper interfaces for props',
    'Use generics for reusable components',
    'Implement proper type guards'
  ],
  'nextjs': [
    'Use App Router (Next.js 13+)',
    'Implement proper server components',
    'Optimize images with next/image',
    'Use proper data fetching patterns'
  ],
  'nestjs': [
    'Use dependency injection properly',
    'Implement proper DTOs with class-validator',
    'Follow modular architecture',
    'Use guards for authentication'
  ],
  'vue-node': [
    'Use Composition API',
    'Implement proper state management with Pinia',
    'Follow Vue style guide',
    'Use proper component communication'
  ],
  'express': [
    'Use proper middleware patterns',
    'Implement error handling middleware',
    'Use async/await with proper error catching',
    'Follow RESTful API design'
  ],
  'laravel': [
    'Use Eloquent ORM properly',
    'Implement proper validation',
    'Follow Laravel naming conventions',
    'Use service classes for business logic'
  ],
  'rails': [
    'Follow Rails conventions',
    'Use Active Record properly',
    'Implement proper validations',
    'Use concerns for shared code'
  ],
  'golang': [
    'Follow Go idioms',
    'Use proper error handling',
    'Implement interfaces for abstraction',
    'Use goroutines properly'
  ],
  'rust': [
    'Use ownership properly',
    'Implement proper error handling with Result',
    'Use lifetimes correctly',
    'Follow Rust naming conventions'
  ]
};

/**
 * Read and parse package.json if it exists
 */
function readPackageJson(projectPath: string): Record<string, any> | null {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Read and parse requirements.txt if it exists
 */
function readRequirementsTxt(projectPath: string): string[] {
  try {
    const reqPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      const content = fs.readFileSync(reqPath, 'utf-8');
      return content.split('\n')
        .map(line => line.trim().toLowerCase())
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.split('==')[0].split('>=')[0].split('<=')[0].split('[')[0]);
    }
  } catch {
    // Ignore errors
  }
  return [];
}

/**
 * Read Pipfile if it exists
 */
function readPipfile(projectPath: string): string[] {
  try {
    const pipfilePath = path.join(projectPath, 'Pipfile');
    if (fs.existsSync(pipfilePath)) {
      const content = fs.readFileSync(pipfilePath, 'utf-8');
      const deps: string[] = [];
      const matches = content.matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm);
      for (const match of matches) {
        deps.push(match[1].toLowerCase());
      }
      return deps;
    }
  } catch {
    // Ignore errors
  }
  return [];
}

/**
 * Read composer.json if it exists (PHP/Laravel)
 */
function readComposerJson(projectPath: string): string[] {
  try {
    const composerPath = path.join(projectPath, 'composer.json');
    if (fs.existsSync(composerPath)) {
      const content = fs.readFileSync(composerPath, 'utf-8');
      const composer = JSON.parse(content);
      const deps: string[] = [];
      if (composer.require) {
        deps.push(...Object.keys(composer.require));
      }
      if (composer['require-dev']) {
        deps.push(...Object.keys(composer['require-dev']));
      }
      return deps.map(d => d.toLowerCase());
    }
  } catch {
    // Ignore errors
  }
  return [];
}

/**
 * Read Gemfile if it exists (Ruby/Rails)
 */
function readGemfile(projectPath: string): string[] {
  try {
    const gemfilePath = path.join(projectPath, 'Gemfile');
    if (fs.existsSync(gemfilePath)) {
      const content = fs.readFileSync(gemfilePath, 'utf-8');
      const gems: string[] = [];
      const matches = content.matchAll(/gem\s+['"]([^'"]+)['"]/g);
      for (const match of matches) {
        gems.push(match[1].toLowerCase());
      }
      return gems;
    }
  } catch {
    // Ignore errors
  }
  return [];
}

/**
 * Check if specific files exist in the project
 */
function checkFiles(projectPath: string, files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const filePath = path.join(projectPath, file);
    if (fs.existsSync(filePath)) {
      found.push(file);
    }
  }
  return found;
}

/**
 * Analyze a project directory
 */
export function analyzeProject(projectPath: string): ProjectAnalysis {
  const analysis: ProjectAnalysis = {
    hasPackageJson: fs.existsSync(path.join(projectPath, 'package.json')),
    hasRequirementsTxt: fs.existsSync(path.join(projectPath, 'requirements.txt')),
    hasPipfile: fs.existsSync(path.join(projectPath, 'Pipfile')),
    hasPoetryLock: fs.existsSync(path.join(projectPath, 'poetry.lock')),
    hasComposerJson: fs.existsSync(path.join(projectPath, 'composer.json')),
    hasGemfile: fs.existsSync(path.join(projectPath, 'Gemfile')),
    hasGoMod: fs.existsSync(path.join(projectPath, 'go.mod')),
    hasCargoToml: fs.existsSync(path.join(projectPath, 'Cargo.toml')),
    hasTsConfig: fs.existsSync(path.join(projectPath, 'tsconfig.json')),
    frameworks: [],
    dependencies: []
  };

  // Collect all dependencies
  const packageJson = readPackageJson(projectPath);
  if (packageJson) {
    const deps = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {})
    ];
    analysis.dependencies.push(...deps.map(d => d.toLowerCase()));
  }

  analysis.dependencies.push(...readRequirementsTxt(projectPath));
  analysis.dependencies.push(...readPipfile(projectPath));
  analysis.dependencies.push(...readComposerJson(projectPath));
  analysis.dependencies.push(...readGemfile(projectPath));

  return analysis;
}

/**
 * Detect project type from a directory path
 */
export function detectProjectType(projectPath: string): DetectionResult {
  const result: DetectionResult = {
    detected: false,
    projectType: null,
    confidence: 'low',
    indicators: [],
    suggestions: [],
    frameworks: [],
    languages: []
  };

  if (!fs.existsSync(projectPath)) {
    return result;
  }

  const analysis = analyzeProject(projectPath);
  
  // Determine languages
  if (analysis.hasPackageJson || analysis.hasTsConfig) {
    result.languages.push(analysis.hasTsConfig ? 'TypeScript' : 'JavaScript');
  }
  if (analysis.hasRequirementsTxt || analysis.hasPipfile || analysis.hasPoetryLock) {
    result.languages.push('Python');
  }
  if (analysis.hasComposerJson) {
    result.languages.push('PHP');
  }
  if (analysis.hasGemfile) {
    result.languages.push('Ruby');
  }
  if (analysis.hasGoMod) {
    result.languages.push('Go');
  }
  if (analysis.hasCargoToml) {
    result.languages.push('Rust');
  }

  // Detect frameworks with priority (more specific first)
  const detectionOrder = [
    'nextjs', 'nestjs', 'vue', 'django', 'fastapi', 'flask', 
    'laravel', 'rails', 'react', 'express', 'golang', 'rust'
  ];

  for (const framework of detectionOrder) {
    const pattern = FRAMEWORK_PATTERNS[framework];
    let matched = false;
    
    // Check dependencies
    for (const dep of pattern.dependencies) {
      if (analysis.dependencies.includes(dep.toLowerCase())) {
        result.indicators.push(`Found dependency: ${dep}`);
        result.frameworks.push(framework);
        matched = true;
        break;
      }
    }
    
    // Check files
    if (!matched) {
      const foundFiles = checkFiles(projectPath, pattern.files);
      if (foundFiles.length > 0) {
        result.indicators.push(`Found file(s): ${foundFiles.join(', ')}`);
        result.frameworks.push(framework);
        matched = true;
      }
    }

    // Set project type on first match
    if (matched && !result.projectType) {
      result.projectType = pattern.projectType;
      result.detected = true;
      
      // Determine confidence
      if (result.indicators.length >= 3) {
        result.confidence = 'high';
      } else if (result.indicators.length >= 2) {
        result.confidence = 'medium';
      }
    }
  }

  // Add suggestions based on detected type
  if (result.projectType && SUGGESTED_RULES[result.projectType]) {
    result.suggestions = SUGGESTED_RULES[result.projectType];
  }

  // Special case: React + TypeScript
  if (result.frameworks.includes('react') && analysis.hasTsConfig) {
    result.projectType = 'react-typescript';
    result.detected = true;
  }

  return result;
}

/**
 * Get setup instructions for a project type
 */
export function getSetupInstructions(projectType: string): string {
  const instructions: Record<string, string> = {
    'python-django': `
## Django Project Setup

1. **Activate context**: The Django context has been activated with DRF support.

2. **Recommended rules loaded**:
   - Django coding standards
   - Django best practices  
   - Security guidelines

3. **Key patterns available**:
   - MVT architecture
   - DRF serializers and viewsets
   - Authentication patterns

4. **Suggested workflow**:
   - Use \`get_full_context\` to see all loaded rules
   - Use \`browse_cursor_directory category:"django"\` for community rules
   - Use \`save_configuration\` to save your setup
`,
    'python-fastapi': `
## FastAPI Project Setup

1. **Activate context**: FastAPI context with async support.

2. **Key patterns**:
   - Pydantic models for validation
   - Dependency injection
   - Async/await patterns
   - OpenAPI documentation

3. **Suggested workflow**:
   - Use \`browse_cursor_directory category:"fastapi"\` for rules
   - Consider importing Python best practices
`,
    'react-node': `
## React + Node.js Project Setup

1. **Activate context**: Full-stack React/Node context.

2. **Recommended rules loaded**:
   - React best practices (hooks, components)
   - Node.js/Express standards
   - Security guidelines

3. **Key patterns available**:
   - Component patterns
   - State management
   - API design

4. **Suggested workflow**:
   - Use \`browse_cursor_directory category:"react"\` for frontend rules
   - Use \`browse_cursor_directory category:"nodejs"\` for backend rules
`,
    'nextjs': `
## Next.js Project Setup

1. **Activate context**: Next.js with App Router support.

2. **Key patterns**:
   - Server Components
   - Server Actions
   - Data fetching patterns
   - Image optimization

3. **Suggested workflow**:
   - Use \`browse_cursor_directory category:"nextjs"\` for community rules
   - Consider TypeScript strict mode
`,
    'nestjs': `
## NestJS Project Setup

1. **Activate context**: NestJS enterprise patterns.

2. **Key patterns**:
   - Dependency Injection
   - Decorators
   - Guards and Interceptors
   - DTOs with class-validator

3. **Suggested workflow**:
   - Use \`browse_cursor_directory category:"nestjs"\` for rules
`
  };

  return instructions[projectType] || `
## ${projectType} Project Setup

Context has been activated. Use \`get_full_context\` to see loaded rules.

Suggested:
- \`list_rules\` - See available rules
- \`browse_cursor_directory\` - Find community rules
- \`save_configuration\` - Save your setup
`;
}

/**
 * Generate a quick start guide based on detection
 */
export function generateQuickStart(detection: DetectionResult): string {
  if (!detection.detected) {
    return `
# Quick Start

Could not auto-detect project type. Please run:

\`select_project_type\` with one of:
- python-django
- python-fastapi  
- python-flask
- react-node
- react-typescript
- nextjs
- nestjs
- vue-node
- express
- laravel
- rails
- golang
- rust

Or tell me about your project and I'll help configure it!
`;
  }

  return `
# Quick Start - ${detection.projectType}

✅ **Detected**: ${detection.projectType} (${detection.confidence} confidence)

**Indicators found**:
${detection.indicators.map(i => `- ${i}`).join('\n')}

**Languages**: ${detection.languages.join(', ')}
**Frameworks**: ${detection.frameworks.join(', ')}

## Recommended Setup

${detection.suggestions.slice(0, 5).map(s => `- ${s}`).join('\n')}

## Next Steps

1. Run \`auto_setup\` to automatically configure everything
2. Or run \`select_project_type projectType:"${detection.projectType}"\` to activate manually
3. Use \`browse_cursor_directory\` to find community rules for your stack
`;
}

/**
 * Get all suggestions for a project type
 */
export function getSuggestions(projectType: string): string[] {
  return SUGGESTED_RULES[projectType] || [];
}
