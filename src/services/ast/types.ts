/**
 * Tree-Sitter AST Types
 * Type definitions for multi-language AST analysis
 * @version 3.5.0
 */

// ============================================================================
// Core AST Types
// ============================================================================

export interface ASTNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: ASTNode[];
  parent?: ASTNode;
  namedChildren: ASTNode[];
  childCount: number;
  namedChildCount: number;
  isNamed: boolean;
}

export interface ParsedAST {
  language: SupportedASTLanguage;
  filePath: string;
  rootNode: ASTNode;
  parseTime: number;
  errors: ASTError[];
}

export interface ASTError {
  message: string;
  line: number;
  column: number;
  type: 'syntax' | 'semantic';
}

// ============================================================================
// Language Support
// ============================================================================

export type SupportedASTLanguage = 
  | 'typescript'
  | 'javascript' 
  | 'tsx'
  | 'python'
  | 'go'
  | 'rust';

export interface LanguageGrammar {
  language: SupportedASTLanguage;
  extensions: string[];
  parser: unknown; // tree-sitter Language object
}

// ============================================================================
// Query Types
// ============================================================================

export interface ASTQuery {
  /** S-expression pattern for tree-sitter query */
  pattern: string;
  /** Capture names to extract */
  captures: string[];
  /** Description of what this query finds */
  description: string;
}

export interface ASTQueryMatch {
  pattern: number;
  captures: Array<{
    name: string;
    node: ASTNode;
  }>;
}

// ============================================================================
// Analysis Rule Types
// ============================================================================

export interface TreeSitterRule {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'performance' | 'best-practices' | 'maintainability' | 'architecture';
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  languages: SupportedASTLanguage[];
  enabled: boolean;
  
  /** Tree-sitter query pattern */
  query: string;
  
  /** Callback to validate matches and generate issues */
  check: (matches: ASTQueryMatch[], context: TreeSitterContext) => TreeSitterIssue[];
}

export interface TreeSitterContext {
  filePath: string;
  code: string;
  ast: ParsedAST;
}

export interface TreeSitterIssue {
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;
  quickFix?: {
    description: string;
    replacement: string;
    range: { start: number; end: number };
  };
}

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface TreeSitterAnalysisResult {
  filePath: string;
  language: SupportedASTLanguage;
  issues: TreeSitterIssue[];
  metrics: TreeSitterMetrics;
  parseTime: number;
  analysisTime: number;
}

export interface TreeSitterMetrics {
  /** Total lines of code */
  loc: number;
  /** Number of functions/methods */
  functions: number;
  /** Number of classes */
  classes: number;
  /** Maximum nesting depth */
  maxNestingDepth: number;
  /** Cyclomatic complexity estimate */
  complexity: number;
  /** Number of imports/dependencies */
  imports: number;
}

// ============================================================================
// Node Type Helpers
// ============================================================================

/** Common node types across languages */
export const CommonNodeTypes = {
  // Declarations
  FUNCTION: ['function_declaration', 'function_definition', 'method_declaration', 'arrow_function'],
  CLASS: ['class_declaration', 'class_definition', 'class_specifier'],
  VARIABLE: ['variable_declaration', 'lexical_declaration', 'assignment_expression'],
  
  // Expressions
  CALL: ['call_expression', 'function_call', 'invocation_expression'],
  BINARY: ['binary_expression', 'comparison_operator'],
  CONDITIONAL: ['if_statement', 'conditional_expression', 'ternary_expression'],
  LOOP: ['for_statement', 'while_statement', 'for_in_statement', 'for_of_statement'],
  
  // Control Flow
  RETURN: ['return_statement'],
  THROW: ['throw_statement'],
  TRY: ['try_statement', 'try_expression'],
  CATCH: ['catch_clause', 'except_clause'],
  
  // Imports
  IMPORT: ['import_statement', 'import_declaration', 'import_from_statement'],
  EXPORT: ['export_statement', 'export_declaration'],
  
  // Literals
  STRING: ['string', 'string_literal', 'template_string'],
  NUMBER: ['number', 'integer', 'float'],
  BOOLEAN: ['true', 'false', 'boolean'],
  
  // Comments
  COMMENT: ['comment', 'line_comment', 'block_comment'],
};

// ============================================================================
// Utility Types
// ============================================================================

export interface NodeVisitor {
  enter?: (node: ASTNode) => void;
  leave?: (node: ASTNode) => void;
}

export interface NodeFilter {
  type?: string | string[];
  text?: string | RegExp;
  hasChild?: string;
  hasParent?: string;
}

export interface ASTNodeLocation {
  line: number;
  column: number;
  offset?: number;
}

export interface TreeSitterQuickFix {
  description: string;
  replacement: string;
  range: { start: number; end: number };
}

export interface ASTCapture {
  name: string;
  node: ASTNode;
}

export interface ASTVisitor {
  enter?: (node: ASTNode) => void;
  leave?: (node: ASTNode) => void;
}
