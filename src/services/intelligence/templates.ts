/**
 * Framework Templates - Optimal structure definitions per framework
 * @version 3.3.0
 */

import type { FrameworkTemplate, DependencyRecommendation, SmartConfig } from './types.js';

/**
 * Base dependencies recommended for all JavaScript/TypeScript projects
 */
const JS_BASE_DEV_DEPS: DependencyRecommendation[] = [
  { name: 'eslint', reason: 'Code linting and quality', category: 'linting', priority: 'high' },
  { name: 'prettier', reason: 'Code formatting', category: 'dx', priority: 'high' },
  { name: 'typescript', reason: 'Type safety', category: 'types', priority: 'high' }
];

/**
 * Testing dependencies
 */
const TESTING_DEPS: DependencyRecommendation[] = [
  { name: 'vitest', reason: 'Fast unit testing', category: 'testing', priority: 'high' },
  { name: '@testing-library/react', reason: 'React component testing', category: 'testing', priority: 'medium' }
];

/**
 * ESLint base config
 */
const ESLINT_CONFIG: SmartConfig = {
  type: 'eslint',
  filename: 'eslint.config.js',
  content: `import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn'
    }
  }
];`,
  description: 'Modern flat ESLint config with TypeScript support',
  customizations: [
    {
      key: 'strictness',
      description: 'How strict should linting be?',
      options: [
        { value: 'relaxed', label: 'Relaxed', description: 'Minimal rules, mostly errors only' },
        { value: 'recommended', label: 'Recommended', description: 'Balanced rules for most projects' },
        { value: 'strict', label: 'Strict', description: 'Maximum type safety and best practices' }
      ],
      default: 'recommended'
    }
  ]
};

/**
 * Prettier config
 */
const PRETTIER_CONFIG: SmartConfig = {
  type: 'prettier',
  filename: '.prettierrc',
  content: JSON.stringify({
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    printWidth: 100,
    bracketSpacing: true
  }, null, 2),
  description: 'Prettier configuration for consistent code formatting',
  customizations: [
    {
      key: 'semi',
      description: 'Use semicolons?',
      options: [
        { value: true, label: 'Yes', description: 'Always use semicolons' },
        { value: false, label: 'No', description: 'Omit semicolons (ASI)' }
      ],
      default: true
    },
    {
      key: 'singleQuote',
      description: 'Use single quotes?',
      options: [
        { value: true, label: 'Single', description: 'Use single quotes' },
        { value: false, label: 'Double', description: 'Use double quotes' }
      ],
      default: true
    }
  ]
};

/**
 * TypeScript strict config
 */
const TSCONFIG_STRICT: SmartConfig = {
  type: 'tsconfig',
  filename: 'tsconfig.json',
  content: JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: './dist',
      rootDir: './src',
      noUnusedLocals: true,
      noUnusedParameters: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }, null, 2),
  description: 'Strict TypeScript configuration for maximum type safety',
  customizations: [
    {
      key: 'strict',
      description: 'Enable all strict type checking options?',
      options: [
        { value: true, label: 'Yes', description: 'Maximum type safety' },
        { value: false, label: 'No', description: 'Relaxed type checking' }
      ],
      default: true
    }
  ]
};

/**
 * EditorConfig
 */
const EDITORCONFIG: SmartConfig = {
  type: 'editorconfig',
  filename: '.editorconfig',
  content: `# EditorConfig helps maintain consistent coding styles
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.{yaml,yml}]
indent_size = 2

[Makefile]
indent_style = tab
`,
  description: 'EditorConfig for consistent editor settings',
  customizations: []
};

/**
 * Gitignore for Node.js projects
 */
const GITIGNORE_NODE: SmartConfig = {
  type: 'gitignore',
  filename: '.gitignore',
  content: `# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
out/
.next/
.nuxt/

# Testing
coverage/
.nyc_output/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Editor
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Cache
.cache/
.eslintcache
.prettiercache
*.tsbuildinfo
`,
  description: 'Comprehensive .gitignore for Node.js projects',
  customizations: []
};

/**
 * Framework template definitions
 */
export const FRAMEWORK_TEMPLATES: Record<string, FrameworkTemplate> = {
  'react-typescript': {
    projectType: 'react-typescript',
    name: 'React TypeScript',
    requiredDirs: ['src', 'src/components', 'public'],
    optionalDirs: [
      'src/hooks',
      'src/utils',
      'src/types',
      'src/services',
      'src/contexts',
      'src/styles',
      'tests'
    ],
    requiredFiles: ['package.json', 'tsconfig.json', 'src/index.tsx'],
    optionalFiles: [
      '.eslintrc.js',
      '.prettierrc',
      '.editorconfig',
      '.gitignore',
      'README.md',
      'src/App.tsx',
      'src/types/index.ts'
    ],
    recommendedDependencies: [
      ...JS_BASE_DEV_DEPS,
      ...TESTING_DEPS,
      { name: 'react', reason: 'Core React library', category: 'dx', priority: 'high' },
      { name: 'react-dom', reason: 'React DOM rendering', category: 'dx', priority: 'high' },
      { name: '@types/react', reason: 'React type definitions', category: 'types', priority: 'high' },
      { name: '@types/react-dom', reason: 'React DOM types', category: 'types', priority: 'high' }
    ],
    configTemplates: [ESLINT_CONFIG, PRETTIER_CONFIG, TSCONFIG_STRICT, EDITORCONFIG, GITIGNORE_NODE]
  },

  'nextjs': {
    projectType: 'nextjs',
    name: 'Next.js',
    requiredDirs: ['app', 'public'],
    optionalDirs: [
      'app/api',
      'app/(routes)',
      'components',
      'lib',
      'hooks',
      'types',
      'styles',
      'tests'
    ],
    requiredFiles: ['package.json', 'next.config.js', 'tsconfig.json'],
    optionalFiles: [
      '.eslintrc.json',
      '.prettierrc',
      '.env.local',
      'middleware.ts',
      'tailwind.config.js'
    ],
    recommendedDependencies: [
      ...JS_BASE_DEV_DEPS,
      { name: 'next', reason: 'Next.js framework', category: 'dx', priority: 'high' },
      { name: '@next/eslint-plugin-next', reason: 'Next.js ESLint rules', category: 'linting', priority: 'high' },
      { name: 'tailwindcss', reason: 'Utility-first CSS', category: 'dx', priority: 'medium' }
    ],
    configTemplates: [ESLINT_CONFIG, PRETTIER_CONFIG, TSCONFIG_STRICT, EDITORCONFIG]
  },

  'nestjs': {
    projectType: 'nestjs',
    name: 'NestJS',
    requiredDirs: ['src', 'src/modules', 'test'],
    optionalDirs: [
      'src/common',
      'src/config',
      'src/guards',
      'src/interceptors',
      'src/filters',
      'src/pipes',
      'src/decorators'
    ],
    requiredFiles: ['package.json', 'tsconfig.json', 'nest-cli.json', 'src/main.ts', 'src/app.module.ts'],
    optionalFiles: [
      '.eslintrc.js',
      '.prettierrc',
      'test/jest-e2e.json',
      'src/app.controller.ts',
      'src/app.service.ts'
    ],
    recommendedDependencies: [
      ...JS_BASE_DEV_DEPS,
      { name: '@nestjs/core', reason: 'NestJS core', category: 'dx', priority: 'high' },
      { name: '@nestjs/common', reason: 'NestJS common utilities', category: 'dx', priority: 'high' },
      { name: '@nestjs/testing', reason: 'NestJS testing utilities', category: 'testing', priority: 'high' },
      { name: 'class-validator', reason: 'DTO validation', category: 'security', priority: 'high' },
      { name: 'class-transformer', reason: 'Object transformation', category: 'dx', priority: 'medium' }
    ],
    configTemplates: [ESLINT_CONFIG, PRETTIER_CONFIG, TSCONFIG_STRICT, EDITORCONFIG]
  },

  'express': {
    projectType: 'express',
    name: 'Express.js',
    requiredDirs: ['src', 'src/routes', 'src/middleware'],
    optionalDirs: [
      'src/controllers',
      'src/services',
      'src/models',
      'src/utils',
      'src/config',
      'tests'
    ],
    requiredFiles: ['package.json', 'src/index.ts'],
    optionalFiles: [
      'tsconfig.json',
      '.eslintrc.js',
      '.env',
      'src/app.ts',
      'Dockerfile'
    ],
    recommendedDependencies: [
      ...JS_BASE_DEV_DEPS,
      { name: 'express', reason: 'Express framework', category: 'dx', priority: 'high' },
      { name: '@types/express', reason: 'Express types', category: 'types', priority: 'high' },
      { name: 'helmet', reason: 'Security headers', category: 'security', priority: 'high' },
      { name: 'cors', reason: 'CORS support', category: 'security', priority: 'high' },
      { name: 'express-rate-limit', reason: 'Rate limiting', category: 'security', priority: 'medium' }
    ],
    configTemplates: [ESLINT_CONFIG, PRETTIER_CONFIG, TSCONFIG_STRICT, EDITORCONFIG, GITIGNORE_NODE]
  },

  'python-fastapi': {
    projectType: 'python-fastapi',
    name: 'FastAPI',
    requiredDirs: ['app', 'app/api', 'app/models', 'tests'],
    optionalDirs: [
      'app/core',
      'app/schemas',
      'app/services',
      'app/db',
      'app/utils',
      'alembic'
    ],
    requiredFiles: ['pyproject.toml', 'app/main.py'],
    optionalFiles: [
      'requirements.txt',
      '.env',
      'Dockerfile',
      'app/__init__.py',
      'app/api/__init__.py',
      'app/api/routes.py',
      'tests/conftest.py'
    ],
    recommendedDependencies: [
      { name: 'fastapi', reason: 'FastAPI framework', category: 'dx', priority: 'high' },
      { name: 'uvicorn', reason: 'ASGI server', category: 'dx', priority: 'high' },
      { name: 'pydantic', reason: 'Data validation', category: 'types', priority: 'high' },
      { name: 'pytest', reason: 'Testing framework', category: 'testing', priority: 'high' },
      { name: 'black', reason: 'Code formatting', category: 'dx', priority: 'high' },
      { name: 'ruff', reason: 'Fast Python linter', category: 'linting', priority: 'high' },
      { name: 'mypy', reason: 'Type checking', category: 'types', priority: 'medium' }
    ],
    configTemplates: []
  },

  'python-django': {
    projectType: 'python-django',
    name: 'Django',
    requiredDirs: ['project_name', 'apps', 'templates', 'static'],
    optionalDirs: [
      'project_name/settings',
      'media',
      'locale',
      'tests',
      'docs'
    ],
    requiredFiles: ['manage.py', 'requirements.txt'],
    optionalFiles: [
      'pyproject.toml',
      '.env',
      'Dockerfile',
      'docker-compose.yml',
      'pytest.ini'
    ],
    recommendedDependencies: [
      { name: 'django', reason: 'Django framework', category: 'dx', priority: 'high' },
      { name: 'djangorestframework', reason: 'REST API support', category: 'dx', priority: 'high' },
      { name: 'django-cors-headers', reason: 'CORS support', category: 'security', priority: 'high' },
      { name: 'pytest-django', reason: 'Django testing', category: 'testing', priority: 'high' },
      { name: 'black', reason: 'Code formatting', category: 'dx', priority: 'high' },
      { name: 'ruff', reason: 'Fast Python linter', category: 'linting', priority: 'high' }
    ],
    configTemplates: []
  },

  'golang': {
    projectType: 'golang',
    name: 'Go',
    requiredDirs: ['cmd', 'internal', 'pkg'],
    optionalDirs: [
      'api',
      'configs',
      'scripts',
      'test',
      'docs',
      'internal/handlers',
      'internal/services',
      'internal/models'
    ],
    requiredFiles: ['go.mod', 'main.go'],
    optionalFiles: [
      'go.sum',
      'Makefile',
      'Dockerfile',
      '.golangci.yml',
      'README.md'
    ],
    recommendedDependencies: [],
    configTemplates: []
  },

  'rust': {
    projectType: 'rust',
    name: 'Rust',
    requiredDirs: ['src'],
    optionalDirs: [
      'src/bin',
      'src/lib',
      'tests',
      'benches',
      'examples',
      'docs'
    ],
    requiredFiles: ['Cargo.toml', 'src/main.rs'],
    optionalFiles: [
      'Cargo.lock',
      '.rustfmt.toml',
      'clippy.toml',
      'README.md',
      '.github/workflows/ci.yml'
    ],
    recommendedDependencies: [
      { name: 'serde', reason: 'Serialization', category: 'dx', priority: 'high' },
      { name: 'tokio', reason: 'Async runtime', category: 'performance', priority: 'high' },
      { name: 'anyhow', reason: 'Error handling', category: 'dx', priority: 'medium' },
      { name: 'thiserror', reason: 'Custom errors', category: 'dx', priority: 'medium' }
    ],
    configTemplates: []
  },

  'vue-node': {
    projectType: 'vue-node',
    name: 'Vue.js',
    requiredDirs: ['src', 'src/components', 'public'],
    optionalDirs: [
      'src/views',
      'src/stores',
      'src/composables',
      'src/utils',
      'src/types',
      'src/assets',
      'tests'
    ],
    requiredFiles: ['package.json', 'vite.config.ts', 'src/main.ts', 'src/App.vue'],
    optionalFiles: [
      'tsconfig.json',
      '.eslintrc.js',
      'env.d.ts',
      'src/router/index.ts'
    ],
    recommendedDependencies: [
      ...JS_BASE_DEV_DEPS,
      { name: 'vue', reason: 'Vue.js framework', category: 'dx', priority: 'high' },
      { name: 'vue-router', reason: 'Vue Router', category: 'dx', priority: 'high' },
      { name: 'pinia', reason: 'State management', category: 'dx', priority: 'medium' },
      { name: '@vitejs/plugin-vue', reason: 'Vite Vue plugin', category: 'dx', priority: 'high' }
    ],
    configTemplates: [ESLINT_CONFIG, PRETTIER_CONFIG, TSCONFIG_STRICT, EDITORCONFIG]
  }
};

/**
 * Get template for a project type
 */
export function getFrameworkTemplate(projectType: string): FrameworkTemplate | undefined {
  return FRAMEWORK_TEMPLATES[projectType];
}

/**
 * Get all available templates
 */
export function getAllTemplates(): FrameworkTemplate[] {
  return Object.values(FRAMEWORK_TEMPLATES);
}

/**
 * Get config template by type
 */
export function getConfigTemplate(configType: string): SmartConfig | undefined {
  const templates: SmartConfig[] = [
    ESLINT_CONFIG,
    PRETTIER_CONFIG,
    TSCONFIG_STRICT,
    EDITORCONFIG,
    GITIGNORE_NODE
  ];
  return templates.find(t => t.type === configType);
}
