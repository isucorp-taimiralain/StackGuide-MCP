// Supported project types
export type ProjectType = 
  | 'python-django'
  | 'python-fastapi'
  | 'python-flask'
  | 'react-node'
  | 'react-typescript'
  | 'vue-node'
  | 'nextjs'
  | 'express'
  | 'nestjs'
  | 'laravel'
  | 'rails'
  | 'golang'
  | 'rust'
  | 'custom';

// Project information
export interface ProjectInfo {
  type: ProjectType;
  name: string;
  description: string;
  languages: string[];
  frameworks: string[];
  detectionFiles: string[];
}

// Individual rule configuration (documentation/knowledge rules)
export interface Rule {
  id: string;
  name: string;
  category: RuleCategory;
  description: string;
  content: string;
  enabled: boolean;
  priority: number;
}

// =============================================================================
// ANALYSIS RULE TYPES - Phase 1: Unified Rule Pipeline
// =============================================================================

/**
 * Severity levels for code analysis issues
 */
export type IssueSeverity = 'error' | 'warning' | 'info' | 'suggestion';

/**
 * Quick fix definition for auto-corrections
 */
export interface QuickFix {
  description: string;
  before: string;
  after: string;
  isRegex?: boolean;
}

/**
 * Base interface for all analysis rules
 */
export interface BaseAnalysisRule {
  id: string;
  category: AnalysisCategory;
  severity: IssueSeverity;
  message: string;
  suggestion?: string;
  languages?: string[];
  enabled: boolean;
  priority: number;
  source: 'builtin' | 'user' | 'project';
}

/**
 * Regex-based pattern matching rule (current implementation)
 */
export interface PatternRule extends BaseAnalysisRule {
  type: 'pattern';
  pattern: RegExp;
  quickFix?: (match: string) => QuickFix | undefined;
}

/**
 * AST-based rule (Phase 2 implementation)
 * Uses ts-morph for semantic code analysis
 */
export interface ASTRule extends BaseAnalysisRule {
  type: 'ast';
  /** 
   * Node types to check. Maps to ts-morph SyntaxKind.
   * Examples: 'CallExpression', 'FunctionDeclaration', 'VariableDeclaration', 'ClassDeclaration'
   */
  nodeTypes: string[];
  /**
   * The check function receives the node and source file context.
   * Returns an ASTCheckResult with issue details if a problem is found.
   */
  check: (context: ASTCheckContext) => ASTCheckResult | null;
  /**
   * Optional quick fix generator
   */
  quickFix?: (context: ASTCheckContext) => QuickFix | undefined;
}

/**
 * Context passed to AST rule check functions
 */
export interface ASTCheckContext {
  /** The node being checked (ts-morph Node) */
  node: unknown;
  /** The source file being analyzed */
  sourceFile: unknown;
  /** File path */
  filePath: string;
  /** Full source code text */
  sourceText: string;
  /** Helper to get node text */
  getNodeText: () => string;
  /** Helper to get node start line */
  getStartLine: () => number;
  /** Helper to get node type references (for type checking) */
  getTypeText?: () => string;
}

/**
 * Result from an AST rule check
 */
export interface ASTCheckResult {
  /** Whether an issue was found */
  hasIssue: boolean;
  /** Custom message override (optional) */
  message?: string;
  /** Additional context for the issue */
  details?: string;
  /** The problematic code snippet */
  code?: string;
  /** Line number of the issue */
  line?: number;
}

/**
 * External linter rule (future implementation - Phase 3)
 */
export interface LinterRule extends BaseAnalysisRule {
  type: 'linter';
  linter: 'eslint' | 'prettier' | 'biome' | 'ruff' | 'pylint';
  linterRule: string;  // e.g., 'no-unused-vars'
}

/**
 * Union type for all analysis rules
 */
export type AnalysisRule = PatternRule | ASTRule | LinterRule;

/**
 * Analysis categories (more specific than RuleCategory)
 */
export type AnalysisCategory = 
  | 'security'
  | 'performance'
  | 'coding-standards'
  | 'architecture'
  | 'best-practices'
  | 'testing'
  | 'accessibility'
  | 'react'
  | 'node'
  | 'python'
  | 'go'
  | 'rust';

/**
 * Analysis rule registry for managing all rules
 */
export interface AnalysisRuleRegistry {
  builtin: AnalysisRule[];
  user: AnalysisRule[];
  project: AnalysisRule[];
}

/**
 * Code issue found during analysis
 */
export interface CodeIssue {
  severity: IssueSeverity;
  rule: string;
  category: string;
  message: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
  details?: string;
  quickFix?: QuickFix;
  source: 'builtin' | 'user' | 'project';
}

/**
 * Analysis result for a single file
 */
export interface AnalysisResult {
  file: string;
  language: string;
  issues: CodeIssue[];
  score: number;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    suggestions: number;
  };
  quickFixes?: QuickFix[];
  rulesApplied: {
    builtin: number;
    user: number;
    project: number;
  };
}

// Rule categories
export type RuleCategory = 
  | 'coding-standards'
  | 'best-practices'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'testing'
  | 'documentation'
  | 'naming-conventions';

// Knowledge base file
export interface KnowledgeFile {
  id: string;
  name: string;
  path: string;
  projectType: ProjectType;
  category: KnowledgeCategory;
  description: string;
  content: string;
}

// Knowledge categories
export type KnowledgeCategory =
  | 'patterns'
  | 'common-issues'
  | 'architecture'
  | 'snippets'
  | 'workflows'
  | 'troubleshooting';

// User configuration
export interface UserConfiguration {
  id: string;
  name: string;
  projectType: ProjectType;
  selectedRules: string[];
  selectedKnowledge: string[];
  customRules: Rule[];
  createdAt: string;
  updatedAt: string;
}

// Server state
export interface ServerState {
  activeProjectType: ProjectType | null;
  activeConfiguration: UserConfiguration | null;
  loadedRules: Rule[];
  loadedKnowledge: KnowledgeFile[];
}

// Supported projects definition
export const SUPPORTED_PROJECTS: Record<ProjectType, ProjectInfo> = {
  'python-django': {
    type: 'python-django',
    name: 'Python Django',
    description: 'Django web framework with Python',
    languages: ['python'],
    frameworks: ['django'],
    detectionFiles: ['manage.py', 'django', 'settings.py']
  },
  'python-fastapi': {
    type: 'python-fastapi',
    name: 'Python FastAPI',
    description: 'FastAPI modern web framework',
    languages: ['python'],
    frameworks: ['fastapi'],
    detectionFiles: ['main.py', 'fastapi']
  },
  'python-flask': {
    type: 'python-flask',
    name: 'Python Flask',
    description: 'Flask micro web framework',
    languages: ['python'],
    frameworks: ['flask'],
    detectionFiles: ['app.py', 'flask']
  },
  'react-node': {
    type: 'react-node',
    name: 'React with Node.js',
    description: 'React frontend with Node.js backend',
    languages: ['javascript', 'typescript'],
    frameworks: ['react', 'node', 'express'],
    detectionFiles: ['package.json', 'react', 'node']
  },
  'react-typescript': {
    type: 'react-typescript',
    name: 'React TypeScript',
    description: 'React with TypeScript',
    languages: ['typescript'],
    frameworks: ['react'],
    detectionFiles: ['tsconfig.json', 'react']
  },
  'vue-node': {
    type: 'vue-node',
    name: 'Vue.js with Node.js',
    description: 'Vue.js frontend with Node.js backend',
    languages: ['javascript', 'typescript'],
    frameworks: ['vue', 'node'],
    detectionFiles: ['package.json', 'vue']
  },
  'nextjs': {
    type: 'nextjs',
    name: 'Next.js',
    description: 'Next.js React framework',
    languages: ['javascript', 'typescript'],
    frameworks: ['nextjs', 'react'],
    detectionFiles: ['next.config.js', 'next.config.mjs']
  },
  'express': {
    type: 'express',
    name: 'Express.js',
    description: 'Express.js Node framework',
    languages: ['javascript', 'typescript'],
    frameworks: ['express', 'node'],
    detectionFiles: ['package.json', 'express']
  },
  'nestjs': {
    type: 'nestjs',
    name: 'NestJS',
    description: 'NestJS Node framework',
    languages: ['typescript'],
    frameworks: ['nestjs', 'node'],
    detectionFiles: ['nest-cli.json', 'nestjs']
  },
  'laravel': {
    type: 'laravel',
    name: 'Laravel PHP',
    description: 'Laravel PHP framework',
    languages: ['php'],
    frameworks: ['laravel'],
    detectionFiles: ['artisan', 'composer.json']
  },
  'rails': {
    type: 'rails',
    name: 'Ruby on Rails',
    description: 'Ruby on Rails framework',
    languages: ['ruby'],
    frameworks: ['rails'],
    detectionFiles: ['Gemfile', 'config/routes.rb']
  },
  'golang': {
    type: 'golang',
    name: 'Go',
    description: 'Go programming language',
    languages: ['go'],
    frameworks: [],
    detectionFiles: ['go.mod', 'main.go']
  },
  'rust': {
    type: 'rust',
    name: 'Rust',
    description: 'Rust programming language',
    languages: ['rust'],
    frameworks: [],
    detectionFiles: ['Cargo.toml', 'main.rs']
  },
  'custom': {
    type: 'custom',
    name: 'Custom Project',
    description: 'Custom project configuration',
    languages: [],
    frameworks: [],
    detectionFiles: []
  }
};
