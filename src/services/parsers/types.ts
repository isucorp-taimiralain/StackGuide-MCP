/**
 * Language Parser Types
 * Type definitions for the multi-language parsing system
 * @version 3.2.0
 */

import type { CodeIssue } from '../../config/types.js';

/**
 * Supported programming languages
 */
export type SupportedLanguage = 
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'java'
  | 'csharp'
  | 'unknown';

/**
 * Language-specific rule for semantic analysis
 */
export interface LanguageRule {
  id: string;
  name: string;
  description: string;
  language: SupportedLanguage;
  severity: 'error' | 'warning' | 'info';
  category: string;
  enabled: boolean;
  priority: number;
  
  /**
   * Check function that analyzes parsed code
   */
  check: (context: ParseContext) => ParseIssue | null;
}

/**
 * Context passed to language-specific rules
 */
export interface ParseContext {
  /** Original source code */
  code: string;
  
  /** File path */
  filePath: string;
  
  /** Detected language */
  language: SupportedLanguage;
  
  /** Parsed symbols/tokens */
  symbols: ParsedSymbol[];
  
  /** Imports/dependencies found */
  imports: ImportInfo[];
  
  /** Functions/methods found */
  functions: FunctionInfo[];
  
  /** Classes/structs found */
  classes: ClassInfo[];
  
  /** Variables/constants found */
  variables: VariableInfo[];
  
  /** Comments found */
  comments: CommentInfo[];
  
  /** Get line content by number (1-indexed) */
  getLine: (lineNumber: number) => string;
  
  /** Get lines in range */
  getLines: (start: number, end: number) => string[];
  
  /** Check if code contains pattern */
  containsPattern: (pattern: RegExp) => boolean;
  
  /** Find all matches of pattern */
  findPatternMatches: (pattern: RegExp) => PatternMatch[];
}

/**
 * Result from a language rule check
 */
export interface ParseIssue {
  hasIssue: boolean;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  details?: string;
  suggestion?: string;
  code?: string;
}

/**
 * Generic parsed symbol
 */
export interface ParsedSymbol {
  type: 'function' | 'class' | 'variable' | 'import' | 'export' | 'decorator' | 'annotation' | 'macro' | 'trait' | 'interface' | 'enum' | 'struct' | 'module' | 'other';
  name: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  modifiers?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Import/dependency information
 */
export interface ImportInfo {
  module: string;
  items: string[];
  alias?: string;
  line: number;
  isDefault?: boolean;
  isNamespace?: boolean;
  isRelative?: boolean;
}

/**
 * Function/method information
 */
export interface FunctionInfo {
  name: string;
  line: number;
  endLine?: number;
  parameters: ParameterInfo[];
  returnType?: string;
  isAsync?: boolean;
  isGenerator?: boolean;
  isExported?: boolean;
  isPublic?: boolean;
  decorators?: string[];
  annotations?: string[];
  docstring?: string;
  complexity?: number;
  bodyLines?: number;
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  defaultValue?: string;
  isOptional?: boolean;
  isRest?: boolean;
}

/**
 * Class/struct information
 */
export interface ClassInfo {
  name: string;
  line: number;
  endLine?: number;
  baseClasses?: string[];
  interfaces?: string[];
  traits?: string[];
  members: MemberInfo[];
  isExported?: boolean;
  isAbstract?: boolean;
  decorators?: string[];
  annotations?: string[];
  docstring?: string;
}

/**
 * Class/struct member information
 */
export interface MemberInfo {
  name: string;
  type: 'field' | 'method' | 'property' | 'constructor' | 'static';
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  dataType?: string;
  line: number;
  isStatic?: boolean;
  isReadonly?: boolean;
}

/**
 * Variable/constant information
 */
export interface VariableInfo {
  name: string;
  line: number;
  type?: string;
  isConst?: boolean;
  isExported?: boolean;
  scope?: 'global' | 'module' | 'function' | 'block';
  value?: string;
}

/**
 * Comment information
 */
export interface CommentInfo {
  text: string;
  line: number;
  endLine?: number;
  type: 'line' | 'block' | 'doc';
  isTodo?: boolean;
  isFixme?: boolean;
}

/**
 * Pattern match result
 */
export interface PatternMatch {
  match: string;
  line: number;
  column: number;
  groups?: Record<string, string>;
}

/**
 * Parse result from a language parser
 */
export interface ParseResult {
  language: SupportedLanguage;
  filePath: string;
  symbols: ParsedSymbol[];
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  variables: VariableInfo[];
  comments: CommentInfo[];
  errors: ParseError[];
  parseTime: number;
}

/**
 * Parse error
 */
export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
}

/**
 * Language parser interface
 */
export interface LanguageParser {
  /** Language this parser handles */
  readonly language: SupportedLanguage;
  
  /** File extensions this parser handles */
  readonly extensions: string[];
  
  /** Parse source code */
  parse(code: string, filePath: string): ParseResult;
  
  /** Get language-specific rules */
  getRules(): LanguageRule[];
  
  /** Analyze code using language-specific rules */
  analyze(code: string, filePath: string): CodeIssue[];
  
  /** Check if parser can handle this file */
  canHandle(filePath: string): boolean;
}

/**
 * Parser factory function type
 */
export type ParserFactory = () => LanguageParser;

/**
 * File extension to language mapping
 */
export const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  // TypeScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  
  // JavaScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  
  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyw': 'python',
  
  // Go
  '.go': 'go',
  
  // Rust
  '.rs': 'rust',
  
  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  
  // PHP
  '.php': 'php',
  '.phtml': 'php',
  
  // Java
  '.java': 'java',
  
  // C#
  '.cs': 'csharp',
};

/**
 * Get language from file path
 */
export function getLanguageFromPath(filePath: string): SupportedLanguage {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || 'unknown';
}
