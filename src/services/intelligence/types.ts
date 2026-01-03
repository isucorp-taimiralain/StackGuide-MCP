/**
 * Types for Project Intelligence System
 * Auto-Configuration Intelligence - Phase 4
 * @version 3.3.0
 */

/**
 * Project structure analysis result
 */
export interface StructureAnalysis {
  /** Root directory of the project */
  rootPath: string;
  /** Detected project type */
  projectType: string;
  /** Overall structure health score (0-100) */
  structureScore: number;
  /** Existing directories */
  existingDirs: string[];
  /** Missing recommended directories */
  missingDirs: DirectorySuggestion[];
  /** Existing key files */
  existingFiles: string[];
  /** Missing recommended files */
  missingFiles: FileSuggestion[];
  /** Structure improvements */
  improvements: StructureImprovement[];
}

export interface DirectorySuggestion {
  path: string;
  purpose: string;
  priority: 'high' | 'medium' | 'low';
  template?: string;
}

export interface FileSuggestion {
  path: string;
  purpose: string;
  priority: 'high' | 'medium' | 'low';
  template?: string;
  content?: string;
}

export interface StructureImprovement {
  type: 'reorganize' | 'create' | 'rename' | 'move';
  description: string;
  priority: 'high' | 'medium' | 'low';
  from?: string;
  to?: string;
}

/**
 * Configuration analysis and generation
 */
export interface ConfigAnalysis {
  /** Existing configuration files */
  existingConfigs: ConfigFile[];
  /** Recommended configurations */
  recommendedConfigs: ConfigRecommendation[];
  /** Configuration issues found */
  issues: ConfigIssue[];
  /** Overall config health score */
  configScore: number;
}

export interface ConfigFile {
  path: string;
  type: ConfigType;
  isValid: boolean;
  settings: Record<string, unknown>;
  issues?: string[];
}

export type ConfigType = 
  | 'eslint'
  | 'prettier'
  | 'tsconfig'
  | 'jest'
  | 'vitest'
  | 'babel'
  | 'webpack'
  | 'vite'
  | 'rollup'
  | 'docker'
  | 'github-actions'
  | 'editorconfig'
  | 'gitignore'
  | 'env'
  | 'package-json'
  | 'pyproject'
  | 'cargo'
  | 'go-mod'
  | 'other';

export interface ConfigRecommendation {
  type: ConfigType;
  filename: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestedContent: string;
  reason: string;
}

export interface ConfigIssue {
  file: string;
  type: ConfigType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  autoFixable: boolean;
  fix?: ConfigFix;
}

export interface ConfigFix {
  type: 'add' | 'remove' | 'modify';
  path: string;
  key?: string;
  value?: unknown;
  description: string;
}

/**
 * Dependency analysis
 */
export interface DependencyAnalysis {
  /** Package manager detected */
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'cargo' | 'go' | 'bundler' | 'composer' | 'unknown';
  /** Total dependencies count */
  totalDependencies: number;
  /** Direct dependencies */
  directDependencies: DependencyInfo[];
  /** Dev dependencies */
  devDependencies: DependencyInfo[];
  /** Outdated packages */
  outdatedPackages: OutdatedPackage[];
  /** Security vulnerabilities (if detectable) */
  vulnerabilities: VulnerabilityInfo[];
  /** Missing recommended dependencies */
  recommendedAdditions: DependencyRecommendation[];
  /** Unnecessary dependencies */
  unnecessaryDependencies: string[];
  /** Dependency health score */
  dependencyScore: number;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'dev' | 'peer' | 'optional';
  isLocal?: boolean;
}

export interface OutdatedPackage {
  name: string;
  currentVersion: string;
  latestVersion: string;
  type: 'major' | 'minor' | 'patch';
  breaking: boolean;
}

export interface VulnerabilityInfo {
  package: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  fixedIn?: string;
  url?: string;
}

export interface DependencyRecommendation {
  name: string;
  version?: string;
  reason: string;
  category: 'linting' | 'testing' | 'security' | 'performance' | 'dx' | 'types';
  priority: 'high' | 'medium' | 'low';
}

/**
 * Full project intelligence report
 */
export interface IntelligenceReport {
  /** Analysis timestamp */
  timestamp: string;
  /** Project path */
  projectPath: string;
  /** Detected project type */
  projectType: string;
  /** Detection confidence */
  confidence: 'high' | 'medium' | 'low';
  /** Overall intelligence score (0-100) */
  overallScore: number;
  /** Grade based on score */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Structure analysis */
  structure: StructureAnalysis;
  /** Configuration analysis */
  configuration: ConfigAnalysis;
  /** Dependency analysis */
  dependencies: DependencyAnalysis;
  /** Top priority actions */
  priorityActions: PriorityAction[];
  /** Suggested workflow */
  suggestedWorkflow: WorkflowStep[];
  /** Estimated effort to achieve optimal state */
  estimatedEffort: 'minimal' | 'moderate' | 'significant';
}

export interface PriorityAction {
  id: string;
  category: 'structure' | 'config' | 'dependencies' | 'security';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  command?: string;
  autoApplicable: boolean;
}

export interface WorkflowStep {
  order: number;
  title: string;
  description: string;
  command?: string;
  estimatedTime: string;
  optional: boolean;
}

/**
 * Smart configuration templates
 */
export interface SmartConfig {
  type: ConfigType;
  filename: string;
  content: string;
  description: string;
  customizations: ConfigCustomization[];
}

export interface ConfigCustomization {
  key: string;
  description: string;
  options: ConfigOption[];
  default: string | boolean | number;
}

export interface ConfigOption {
  value: string | boolean | number;
  label: string;
  description: string;
}

/**
 * Framework-specific template definitions
 */
export interface FrameworkTemplate {
  projectType: string;
  name: string;
  requiredDirs: string[];
  optionalDirs: string[];
  requiredFiles: string[];
  optionalFiles: string[];
  recommendedDependencies: DependencyRecommendation[];
  configTemplates: SmartConfig[];
}
