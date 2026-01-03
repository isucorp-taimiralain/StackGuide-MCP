/**
 * AST Analysis Module
 * Real AST-based code analysis using tree-sitter
 * @version 3.5.0
 */

// Main analyzer
export {
  analyzeWithTreeSitter,
  analyzeMultipleWithTreeSitter,
  aggregateMetrics,
  generateReport,
  convertToCodeIssues
} from './analyzer.js';

// Parser utilities
export {
  parseCode,
  parseCodeCached,
  detectLanguage,
  extractMetrics,
  findNodesByType,
  walkAST,
  clearASTParserCache,
  getSupportedLanguages
} from './treeSitterParser.js';

// Rules
export {
  ALL_TREE_SITTER_RULES,
  getRulesForLanguage,
  TYPESCRIPT_RULES,
  PYTHON_RULES,
  GO_RULES,
  RUST_RULES
} from './rules.js';

// Types
export type {
  // AST node types
  ASTNode,
  ASTNodeLocation,
  ParsedAST,
  
  // Language support
  SupportedASTLanguage,
  
  // Rules and issues
  TreeSitterRule,
  TreeSitterIssue,
  TreeSitterQuickFix,
  
  // Context and results
  TreeSitterContext,
  TreeSitterAnalysisResult,
  TreeSitterMetrics,
  
  // Query types
  ASTQueryMatch,
  ASTCapture,
  
  // Visitor types
  ASTVisitor,
  
  // Node type helpers
  CommonNodeTypes
} from './types.js';
